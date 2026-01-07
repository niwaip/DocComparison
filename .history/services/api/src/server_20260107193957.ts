import crypto from "node:crypto";
import path from "node:path";
import express from "express";
import multer from "multer";
import { docxBufferToSafeHtml } from "./lib/docx";
import { pdfBufferToSafeHtml } from "./lib/pdfInput";
import { buildBlocksFromHtml } from "./lib/blocks";
import { alignBlocks } from "./lib/align";
import { inlineDiffHtml } from "./lib/inlineDiff";
import { renderCompareHtml } from "./lib/render";
import { ensureArtifacts, fileExists, readJson, writeJson } from "./lib/storage";
import { normalizeText } from "./lib/text";
import { aiQueue } from "./lib/queue";
import { analyzeRisks, analyzeSnippet } from "./lib/ai/analyze";
import { AlignmentRow, Block } from "./lib/types";
import { env } from "./lib/env";

type CompareJsonV1 = {
  compareId: string;
  status: "done";
  createdAt: string;
  document: {
    left: { fileName: string; sha256: string; mimeType: string };
    right: { fileName: string; sha256: string; mimeType: string };
  };
  diff: {
    anchorStrategy: {
      kind: "data-attr";
      rowAttr: "data-row-id";
      blockAttr: "data-block-id";
      insAttr: "data-ins-id";
      delAttr: "data-del-id";
    };
    summary: {
      rows: number;
      matched: number;
      modified: number;
      inserted: number;
      deleted: number;
    };
    meta: {
      sectionNumberChangedRows: number;
    };
    rows: AlignmentRow[];
    leftBlocks: Block[];
    rightBlocks: Block[];
  };
  ai: {
    mode: "none" | "async";
    status: "none" | "pending" | "running" | "done" | "failed" | "cancelled";
    jobId: string | null;
    result: any | null;
    error: string | null;
  };
  export: {
    pdf: {
      status: "none" | "pending" | "running" | "done" | "failed";
      jobId: string | null;
      error: string | null;
    };
  };
  artifacts: {
    compareHtmlUrl: string;
    comparePdfUrl: string | null;
  };
  errors: Array<{ message: string }>;
};

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(env("MAX_UPLOAD_MB", "20")) * 1024 * 1024 }
});

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "../public")));

app.post("/api/compare", upload.fields([{ name: "leftFile", maxCount: 1 }, { name: "rightFile", maxCount: 1 }]), async (req, res) => {
  try {
    const left = (req.files as any)?.leftFile?.[0];
    const right = (req.files as any)?.rightFile?.[0];
    if (!left || !right) return res.status(400).send("missing files");

    const aiMode = (req.body?.aiMode ?? env("AI_MODE_DEFAULT", "async")) as "none" | "async";
    const ignoreSectionNumber = String(req.body?.ignoreSectionNumber ?? "1").trim() !== "0";
    const chunkLevel = String(req.body?.chunkLevel ?? "2").trim() === "1" ? 1 : 2;
    const compareId = `cmp_${crypto.randomUUID().replace(/-/g, "")}`;
    const artifacts = await ensureArtifacts(compareId);

    const [leftHtml, rightHtml] = await Promise.all([
      bufferToSafeHtml({ buffer: left.buffer, mimeType: left.mimetype, fileName: left.originalname }),
      bufferToSafeHtml({ buffer: right.buffer, mimeType: right.mimetype, fileName: right.originalname })
    ]);
    const leftBlocks = buildBlocksFromHtml(leftHtml, chunkLevel);
    const rightBlocks = buildBlocksFromHtml(rightHtml, chunkLevel);
    const rows = alignBlocks(leftBlocks, rightBlocks, { ignoreSectionNumber });
    const sectionNumberChangedRows = ignoreSectionNumber ? rows.filter((r) => r.meta?.sectionNumberChanged).length : 0;

    const leftMap = new Map(leftBlocks.map((b) => [b.blockId, b]));
    const rightMap = new Map(rightBlocks.map((b) => [b.blockId, b]));

    let modifiedCount = 0;
    for (const row of rows) {
      if (row.kind !== "modified") continue;
      const lb = row.leftBlockId ? leftMap.get(row.leftBlockId) : undefined;
      const rb = row.rightBlockId ? rightMap.get(row.rightBlockId) : undefined;
      if (!lb || !rb) continue;

      const d = inlineDiffHtml(lb.text, rb.text, { lineLookahead: 10, ignoreSectionNumber });
      row.diff = { leftDiffHtmlFragment: `<p>${d.leftHtml}</p>`, rightDiffHtmlFragment: `<p>${d.rightHtml}</p>` };
      modifiedCount++;
    }

    const htmlDoc = renderCompareHtml({
      leftBlocks,
      rightBlocks,
      rows,
      title: `${left.originalname} vs ${right.originalname}`
    });

    const aiPayloadMaxRows = (() => {
      const raw = String(env("AI_PAYLOAD_MAX_ROWS", "120")).trim();
      const n = Number.parseInt(raw, 10);
      if (!Number.isFinite(n) || n <= 0) return 120;
      return Math.max(10, Math.min(500, n));
    })();

    const aiPayloadMaxTextLen = (() => {
      const raw = String(env("AI_PAYLOAD_MAX_TEXT_LEN", "1600")).trim();
      const n = Number.parseInt(raw, 10);
      if (!Number.isFinite(n) || n <= 0) return 1600;
      return Math.max(120, Math.min(10_000, n));
    })();

    const compactPayloadText = (s: string | null): string | null => {
      const x = normalizeText(s ?? "");
      if (!x) return null;
      if (x.length <= aiPayloadMaxTextLen) return x;
      return x.slice(0, aiPayloadMaxTextLen);
    };

    const aiPayloadRows = rows
      .filter((r) => r.kind === "modified" || r.kind === "inserted" || r.kind === "deleted")
      .map((r) => {
        const lb = r.leftBlockId ? leftMap.get(r.leftBlockId) : undefined;
        const rb = r.rightBlockId ? rightMap.get(r.rightBlockId) : undefined;
        const blockId = (rb?.blockId ?? lb?.blockId ?? "") as string;
        return {
          rowId: r.rowId,
          kind: r.kind as "modified" | "inserted" | "deleted",
          blockId,
          beforeText: compactPayloadText(lb?.text ?? null),
          afterText: compactPayloadText(rb?.text ?? null)
        };
      })
      .filter((x) => normalizeText((x.beforeText ?? "") + (x.afterText ?? "")).length > 0)
      .slice(0, aiPayloadMaxRows);

    for (const r of rows) r.ai = { status: aiMode === "async" ? "pending" : "none" };

    const analyzeJobId = aiMode === "async" ? `${compareId}:analyze` : null;
    const compareJson: CompareJsonV1 = {
      compareId,
      status: "done",
      createdAt: new Date().toISOString(),
      document: {
        left: { fileName: left.originalname, sha256: sha256(left.buffer), mimeType: left.mimetype },
        right: { fileName: right.originalname, sha256: sha256(right.buffer), mimeType: right.mimetype }
      },
      diff: {
        anchorStrategy: {
          kind: "data-attr",
          rowAttr: "data-row-id",
          blockAttr: "data-block-id",
          insAttr: "data-ins-id",
          delAttr: "data-del-id"
        },
        summary: summarizeRows(rows),
        meta: { sectionNumberChangedRows },
        rows,
        leftBlocks,
        rightBlocks
      },
      ai: {
        mode: aiMode === "async" ? "async" : "none",
        status: aiMode === "async" ? "pending" : "none",
        jobId: analyzeJobId,
        result: null,
        error: null
      },
      export: {
        pdf: {
          status: "none",
          jobId: null,
          error: null
        }
      },
      artifacts: {
        compareHtmlUrl: `/api/compare/${compareId}/artifact/html`,
        comparePdfUrl: null
      },
      errors: []
    };

    await Promise.all([writeJson(artifacts.jsonPath, compareJson), fsWrite(artifacts.htmlPath, htmlDoc)]);

    if (aiMode === "async") {
      await aiQueue.add(
        "analyze",
        { compareId },
        {
          jobId: analyzeJobId ?? undefined,
          attempts: 3,
          backoff: { type: "exponential", delay: 2_000 }
        }
      );
      res.json({
        compareId,
        status: compareJson.status,
        diff: { diffHtml: extractBody(htmlDoc), meta: compareJson.diff.meta },
        ai: {
          mode: compareJson.ai.mode,
          status: compareJson.ai.status,
          jobId: compareJson.ai.jobId,
          pollUrl: compareJson.ai.jobId ? `/api/ai/jobs/${compareJson.ai.jobId}?compareId=${compareId}` : null
        },
        artifacts: compareJson.artifacts,
        export: compareJson.export
      });
      return;
    }

    const aiResult = await analyzeRisks({ compareId, rows: aiPayloadRows });
    compareJson.ai.result = aiResult;
    compareJson.ai.status = "done";
    await writeJson(artifacts.jsonPath, compareJson);

    res.json({
      compareId,
      status: compareJson.status,
      diff: { diffHtml: extractBody(htmlDoc), meta: compareJson.diff.meta },
      ai: {
        mode: "none",
        status: "done",
        jobId: null,
        pollUrl: null
      },
      artifacts: compareJson.artifacts,
      export: compareJson.export
    });
  } catch (e: any) {
    res.status(500).send(e?.message ?? String(e));
  }
});

app.get("/api/compare/:compareId", async (req, res) => {
  const compareId = req.params.compareId;
  const artifacts = await ensureArtifacts(compareId);
  if (!(await fileExists(artifacts.jsonPath))) return res.status(404).send("not found");
  const json = await readJson<CompareJsonV1>(artifacts.jsonPath);
  res.json(json);
});

app.get("/api/compare/:compareId/artifact/html", async (req, res) => {
  const compareId = req.params.compareId;
  const artifacts = await ensureArtifacts(compareId);
  if (!(await fileExists(artifacts.htmlPath))) return res.status(404).send("not found");
  res.type("text/html").sendFile(artifacts.htmlPath);
});

app.get("/api/compare/:compareId/artifact/pdf", async (req, res) => {
  const compareId = req.params.compareId;
  const artifacts = await ensureArtifacts(compareId);
  if (!(await fileExists(artifacts.pdfPath))) return res.status(404).send("not found");
  res.type("application/pdf").sendFile(artifacts.pdfPath);
});

app.post("/api/compare/:compareId/ai/block", async (req, res) => {
  try {
    const compareId = req.params.compareId;
    const blockId = String(req.body?.blockId ?? "").trim();
    const focusText = typeof req.body?.focusText === "string" ? req.body.focusText : null;
    const aiApiKey = typeof req.body?.aiApiKey === "string" ? req.body.aiApiKey : null;
    if (!blockId) return res.status(400).send("missing blockId");

    const artifacts = await ensureArtifacts(compareId);
    if (!(await fileExists(artifacts.jsonPath))) return res.status(404).send("not found");
    const json = await readJson<CompareJsonV1>(artifacts.jsonPath);

    const row = (json.diff?.rows ?? []).find((r) => r.leftBlockId === blockId || r.rightBlockId === blockId);
    if (!row) return res.status(404).send("row not found");
    if (row.kind !== "modified" && row.kind !== "inserted" && row.kind !== "deleted") return res.status(400).send("row kind not supported");

    const leftMap = new Map((json.diff?.leftBlocks ?? []).map((b) => [b.blockId, b]));
    const rightMap = new Map((json.diff?.rightBlocks ?? []).map((b) => [b.blockId, b]));
    const lb = row.leftBlockId ? leftMap.get(row.leftBlockId) : undefined;
    const rb = row.rightBlockId ? rightMap.get(row.rightBlockId) : undefined;

    const result = await analyzeSnippet({
      compareId,
      rowId: row.rowId,
      kind: row.kind,
      beforeText: lb?.text ?? null,
      afterText: rb?.text ?? null,
      focusText,
      aiApiKey
    });

    res.json(result);
  } catch (e: any) {
    res.status(500).send(e?.message ?? String(e));
  }
});

app.post("/api/compare/:compareId/ai/snippet", async (req, res) => {
  try {
    const compareId = req.params.compareId;
    const rowId = String(req.body?.rowId ?? "").trim();
    const focusText = typeof req.body?.focusText === "string" ? req.body.focusText : null;
    const aiApiKey = typeof req.body?.aiApiKey === "string" ? req.body.aiApiKey : null;
    if (!rowId) return res.status(400).send("missing rowId");

    const artifacts = await ensureArtifacts(compareId);
    if (!(await fileExists(artifacts.jsonPath))) return res.status(404).send("not found");
    const json = await readJson<CompareJsonV1>(artifacts.jsonPath);

    const row = (json.diff?.rows ?? []).find((r) => r.rowId === rowId);
    if (!row) return res.status(404).send("row not found");
    if (row.kind !== "modified" && row.kind !== "inserted" && row.kind !== "deleted") return res.status(400).send("row kind not supported");

    const leftMap = new Map((json.diff?.leftBlocks ?? []).map((b) => [b.blockId, b]));
    const rightMap = new Map((json.diff?.rightBlocks ?? []).map((b) => [b.blockId, b]));
    const lb = row.leftBlockId ? leftMap.get(row.leftBlockId) : undefined;
    const rb = row.rightBlockId ? rightMap.get(row.rightBlockId) : undefined;

    const result = await analyzeSnippet({
      compareId,
      rowId,
      kind: row.kind,
      beforeText: lb?.text ?? null,
      afterText: rb?.text ?? null,
      focusText,
      aiApiKey
    });

    res.json(result);
  } catch (e: any) {
    res.status(500).send(e?.message ?? String(e));
  }
});

app.post("/api/compare/:compareId/export/pdf", async (req, res) => {
  try {
    const compareId = req.params.compareId;
    const artifacts = await ensureArtifacts(compareId);
    if (!(await fileExists(artifacts.jsonPath))) return res.status(404).send("not found");

    const json = await readJson<CompareJsonV1>(artifacts.jsonPath);
    if (!json.export) {
      json.export = { pdf: { status: "none", jobId: null, error: null } };
    }
    if (!json.export.pdf) {
      json.export.pdf = { status: "none", jobId: null, error: null };
    }
    if (json.export?.pdf?.status === "pending" || json.export?.pdf?.status === "running") {
      return res.status(202).json({ compareId, status: json.export.pdf.status, jobId: json.export.pdf.jobId, url: json.artifacts.comparePdfUrl });
    }
    if (json.export?.pdf?.status === "done" && json.artifacts.comparePdfUrl) {
      return res.status(200).json({ compareId, status: "done", jobId: json.export.pdf.jobId, url: json.artifacts.comparePdfUrl });
    }

    const exportJobId = `${compareId}:exportPdf`;
    await aiQueue.add("exportPdf", { compareId }, { jobId: exportJobId, attempts: 3, backoff: { type: "exponential", delay: 2_000 } });
    json.export.pdf.status = "pending";
    json.export.pdf.jobId = exportJobId;
    json.export.pdf.error = null;
    await writeJson(artifacts.jsonPath, json);

    res.status(202).json({ compareId, status: "pending", jobId: exportJobId, url: null });
  } catch (e: any) {
    res.status(500).send(e?.message ?? String(e));
  }
});

app.get("/api/ai/jobs/:jobId", async (req, res) => {
  try {
    const jobId = req.params.jobId;
    const compareId = String(req.query.compareId ?? "");
    if (compareId) {
      const artifacts = await ensureArtifacts(compareId);
      if (await fileExists(artifacts.jsonPath)) {
        const json = await readJson<CompareJsonV1>(artifacts.jsonPath);
        const ai = (json.ai ??= { mode: "async", status: "pending", jobId: null, result: null, error: null });
        const isTerminal = ai.status === "done" || ai.status === "failed" || ai.status === "cancelled";

        if (!isTerminal) {
          const job = await aiQueue.getJob(jobId);
          if (job) {
            const state = await job.getState();
            if (state === "failed") {
              ai.status = "failed";
              ai.error = job.failedReason ?? "failed";
              await writeJson(artifacts.jsonPath, json);
            }
          }
        }

        return res.json({ jobId, status: ai.status, result: ai.result, error: ai.error });
      }
    }

    const job = await aiQueue.getJob(jobId);
    if (!job) return res.status(404).send("not found");
    const state = await job.getState();
    res.json({ jobId, status: state });
  } catch (e: any) {
    res.status(500).send(e?.message ?? String(e));
  }
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {});

function summarizeRows(rows: AlignmentRow[]) {
  let matched = 0;
  let modified = 0;
  let inserted = 0;
  let deleted = 0;
  for (const r of rows) {
    if (r.kind === "matched") matched++;
    if (r.kind === "modified") modified++;
    if (r.kind === "inserted") inserted++;
    if (r.kind === "deleted") deleted++;
  }
  return { rows: rows.length, matched, modified, inserted, deleted };
}

function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function parsePositiveInt(s: string): number | null {
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return null;
  return n;
}

async function fsWrite(filePath: string, content: string): Promise<void> {
  const fs = await import("node:fs/promises");
  await fs.writeFile(filePath, content, "utf8");
}

function extractBody(html: string): string {
  const m = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  if (!m) return html;
  return m[1];
}

async function bufferToSafeHtml(params: { buffer: Buffer; mimeType: string; fileName: string }): Promise<string> {
  const mt = String(params.mimeType ?? "").toLowerCase();
  const ext = String(params.fileName ?? "").toLowerCase();
  if (mt.includes("pdf") || ext.endsWith(".pdf")) return pdfBufferToSafeHtml(params.buffer);
  if (mt.includes("wordprocessingml") || mt.includes("msword") || ext.endsWith(".docx")) return docxBufferToSafeHtml(params.buffer);
  throw new Error(`Unsupported file type: ${params.mimeType} (${params.fileName})`);
}

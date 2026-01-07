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
          beforeText: lb?.text ?? null,
          afterText: rb?.text ?? null
        };
      })
      .filter((x) => normalizeText((x.beforeText ?? "") + (x.afterText ?? "")).length > 0);

    for (const r of rows) r.ai = { status: aiMode === "async" ? "pending" : "none" };

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
        jobId: null,
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
      const job = await aiQueue.add("analyze", { compareId, rows: aiPayloadRows });
      compareJson.ai.jobId = String(job.id);
      await writeJson(artifacts.jsonPath, compareJson);
    }

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

    const job = await aiQueue.add("exportPdf", { compareId });
    json.export.pdf.status = "pending";
    json.export.pdf.jobId = String(job.id);
    json.export.pdf.error = null;
    await writeJson(artifacts.jsonPath, json);

    res.status(202).json({ compareId, status: "pending", jobId: String(job.id), url: null });
  } catch (e: any) {
    res.status(500).send(e?.message ?? String(e));
  }
});

app.get("/api/ai/jobs/:jobId", async (req, res) => {
  const compareId = String(req.query.compareId ?? "");
  if (compareId) {
    const artifacts = await ensureArtifacts(compareId);
    if (await fileExists(artifacts.jsonPath)) {
      const json = await readJson<CompareJsonV1>(artifacts.jsonPath);
      return res.json({ jobId: req.params.jobId, status: json.ai.status, result: json.ai.result, error: json.ai.error });
    }
  }
  const job = await aiQueue.getJob(req.params.jobId);
  if (!job) return res.status(404).send("not found");
  const state = await job.getState();
  res.json({ jobId: req.params.jobId, status: state });
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

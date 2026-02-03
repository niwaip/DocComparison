import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import multer from "multer";
import sanitizeHtml from "sanitize-html";
import { docBufferToSafeHtml, docxBufferToSafeHtml, docxBufferToSafeHtmlMammoth } from "./lib/docx";
import { pdfBufferToSafeHtml } from "./lib/pdfInput";
import { buildBlocksFromHtml } from "./lib/blocks";
import { alignBlocks } from "./lib/align";
import { inlineDiffHtml } from "./lib/inlineDiff";
import { renderCompareHtml } from "./lib/render";
import {
  ensureArtifacts,
  fileExists,
  getStandardContractFilePathFromMeta,
  getStandardContractMetaPath,
  readJson,
  readStandardContractFile,
  readStandardContractMeta,
  readStandardContractRules,
  writeJson,
  writeStandardContractRules
} from "./lib/storage";
import { escapeHtml, normalizeText } from "./lib/text";
import { aiQueue } from "./lib/queue";
import { analyzeRisks, analyzeSnippet } from "./lib/ai/analyze";
import { runStandardConfirm } from "./lib/confirm";
import { AlignmentRow, Block } from "./lib/types";
import { env, envOptional } from "./lib/env";

type CompareJsonV1 = {
  compareId: string;
  status: "done";
  createdAt: string;
  standard?: null | { typeId: string; name: string };
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
  confirm?: {
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
      diffOnly?: boolean;
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

// CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "../public")));

function getStandardContractTypes(): Array<{ id: string; name: string }> {
  const raw = String(process.env.STANDARD_CONTRACT_TYPES_JSON ?? "").trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const out = [];
        for (const x of parsed) {
          const id = String(x?.id ?? "").trim();
          const name = String(x?.name ?? "").trim();
          if (!id || !name) continue;
          out.push({ id, name });
        }
        if (out.length) return out.slice(0, 20);
      }
    } catch {}
  }
  return [
    { id: "sales", name: "买卖合同（销售）" },
    { id: "service_procurement_onsite", name: "技术服务合同（采购）（现场人员服务）" },
    { id: "service_procurement", name: "技术服务合同（采购）" },
    { id: "service_sales", name: "技术服务合同（销售）" },
    { id: "purchase", name: "买卖合同（采购）" }
  ];
}

app.get("/api/standard-contracts/types", async (req, res) => {
  try {
    const types = getStandardContractTypes();
    const out = [];
    for (const t of types) {
      const meta = await readStandardContractMeta(t.id);
      let hasTemplate = false;
      if (meta) {
        try {
          const fp = await getStandardContractFilePathFromMeta(meta);
          hasTemplate = await fileExists(fp);
        } catch {
          hasTemplate = false;
        }
      }
      out.push({ id: t.id, name: t.name, hasTemplate, updatedAt: meta?.updatedAt ?? null });
    }
    res.json({ types: out });
  } catch (e: any) {
    res.status(500).send(e?.message ?? String(e));
  }
});

app.get("/api/standard-contracts/:typeId/rules", async (req, res) => {
  try {
    const typeId = String(req.params.typeId ?? "").trim();
    const rules = await readStandardContractRules(typeId);
    if (!rules) return res.status(404).send("not found");
    res.json({ typeId, rules });
  } catch (e: any) {
    res.status(500).send(e?.message ?? String(e));
  }
});

app.post("/api/standard-contracts/:typeId/rules", async (req, res) => {
  try {
    const typeId = String(req.params.typeId ?? "").trim();
    const rules = req.body?.rules ?? req.body ?? null;
    await writeStandardContractRules(typeId, rules);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).send(e?.message ?? String(e));
  }
});

app.post("/api/standard-contracts/:typeId/template", upload.single("file"), async (req, res) => {
  try {
    const typeId = String(req.params.typeId ?? "").trim();
    const f = (req as any).file as any;
    if (!f?.buffer) return res.status(400).send("missing file");
    const types = getStandardContractTypes();
    const t = types.find((x) => x.id === typeId);
    if (!t) return res.status(400).send("unknown standardTypeId");
    const ext = String(path.extname(f.originalname || "") || "").toLowerCase();
    if (ext !== ".doc" && ext !== ".docx") return res.status(400).send("only .doc/.docx supported");

    const meta = {
      schemaVersion: "1" as const,
      typeId,
      name: t.name,
      fileName: String(f.originalname || `${typeId}${ext}`),
      mimeType: String(
        f.mimetype ||
          (ext === ".doc"
            ? "application/msword"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
      ),
      sha256: sha256(f.buffer),
      updatedAt: new Date().toISOString()
    };
    const metaPath = await getStandardContractMetaPath(typeId);
    const filePath = await getStandardContractFilePathFromMeta(meta as any);
    const fs = await import("node:fs/promises");
    await fs.writeFile(filePath, f.buffer);
    await writeJson(metaPath, meta);
    res.json({ meta });
  } catch (e: any) {
    res.status(500).send(e?.message ?? String(e));
  }
});

app.get("/api/standard-contracts/:typeId/template/preview", async (req, res) => {
  try {
    const typeId = String(req.params.typeId ?? "").trim();
    const types = getStandardContractTypes();
    const t = types.find((x) => x.id === typeId);
    if (!t) return res.status(400).send("unknown standardTypeId");

    const chunkLevelRaw = String(req.query?.chunkLevel ?? "2").trim();
    const chunkLevel = chunkLevelRaw === "1" ? 1 : 2;

    const standard = await readStandardContractFile(typeId);
    const html = await bufferToSafeHtml({ buffer: standard.buffer, mimeType: standard.meta.mimeType, fileName: standard.meta.fileName });
    const blocks = buildBlocksFromHtml(html, chunkLevel).slice(0, 1200);

    res.json({
      typeId,
      name: t.name,
      updatedAt: standard.meta.updatedAt ?? null,
      template: { fileName: standard.meta.fileName, mimeType: standard.meta.mimeType, sha256: standard.meta.sha256 },
      blocks: blocks.map((b) => ({
        blockId: b.blockId,
        kind: b.kind,
        stableKey: b.stableKey,
        structurePath: b.structurePath,
        htmlFragment: b.htmlFragment,
        text: b.text,
        meta: b.meta
      }))
    });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    if (/standard contract not found/i.test(String(msg))) return res.status(404).send("standard contract not found");
    res.status(500).send(msg);
  }
});

app.post(
  "/api/standard/confirm",
  upload.fields([{ name: "leftFile", maxCount: 1 }, { name: "rightFile", maxCount: 1 }]),
  async (req, res) => {
    try {
      const typeId = String(req.body?.standardTypeId ?? "").trim();
      if (!typeId) return res.status(400).send("missing standardTypeId");

      const types = getStandardContractTypes();
      const type = types.find((x) => x.id === typeId);
      if (!type) return res.status(400).send("unknown standardTypeId");

      const templateFile = (req.files as any)?.leftFile?.[0];
      const contractFile = (req.files as any)?.rightFile?.[0];
      if (!contractFile) return res.status(400).send("missing files");

      const templateFromStorage = !templateFile ? await readStandardContractFile(typeId) : null;
      const templateBuffer = (templateFile?.buffer as Buffer | undefined) ?? templateFromStorage?.buffer;
      const templateMimeType = String(templateFile?.mimetype ?? templateFromStorage?.meta?.mimeType ?? "");
      const templateFileName = String(templateFile?.originalname ?? templateFromStorage?.meta?.fileName ?? "");
      if (!templateBuffer || !templateMimeType || !templateFileName) return res.status(400).send("missing template");

      const confirmMode = (req.body?.aiMode ?? env("CONFIRM_MODE_DEFAULT", "async")) as "none" | "async";
      const ignoreSectionNumber = String(req.body?.ignoreSectionNumber ?? "1").trim() !== "0";
      const chunkLevel = String(req.body?.chunkLevel ?? "2").trim() === "1" ? 1 : 2;
      const compareId = `cmp_${crypto.randomUUID().replace(/-/g, "")}`;
      const artifacts = await ensureArtifacts(compareId);

      const [leftHtml, rightHtml] = await Promise.all([
        bufferToSafeHtml({ buffer: templateBuffer, mimeType: templateMimeType, fileName: templateFileName }),
        bufferToSafeHtml({ buffer: contractFile.buffer, mimeType: contractFile.mimetype, fileName: contractFile.originalname })
      ]);
      const leftBlocks = buildBlocksFromHtml(leftHtml, chunkLevel);
      const rightBlocks = buildBlocksFromHtml(rightHtml, chunkLevel);
      const rows = alignBlocks(leftBlocks, rightBlocks, { ignoreSectionNumber });
      const sectionNumberChangedRows = ignoreSectionNumber ? rows.filter((r) => r.meta?.sectionNumberChanged).length : 0;

      const leftMap = new Map(leftBlocks.map((b) => [b.blockId, b]));
      const rightMap = new Map(rightBlocks.map((b) => [b.blockId, b]));

      for (const row of rows) {
        if (row.kind !== "modified") continue;
        const lb = row.leftBlockId ? leftMap.get(row.leftBlockId) : undefined;
        const rb = row.rightBlockId ? rightMap.get(row.rightBlockId) : undefined;
        if (!lb || !rb) continue;

        const hasUnderline =
          /<u\b/i.test(lb.htmlFragment ?? "") ||
          /<u\b/i.test(rb.htmlFragment ?? "") ||
          /text-decoration\s*:\s*underline/i.test(lb.htmlFragment ?? "") ||
          /text-decoration\s*:\s*underline/i.test(rb.htmlFragment ?? "");

        if (lb.kind === "table" || rb.kind === "table" || hasUnderline) {
          row.diff = { leftDiffHtmlFragment: lb.htmlFragment, rightDiffHtmlFragment: rb.htmlFragment };
        } else {
          const d = inlineDiffHtml(lb.text, rb.text, { lineLookahead: 10, ignoreSectionNumber });
          row.diff = { leftDiffHtmlFragment: `<p>${d.leftHtml}</p>`, rightDiffHtmlFragment: `<p>${d.rightHtml}</p>` };
        }
      }

      const htmlDoc = renderCompareHtml({
        leftBlocks,
        rightBlocks,
        rows,
        title: `标准确认：${type.name} vs ${contractFile.originalname}`
      });

      for (const r of rows) r.ai = { status: "none" };

      const confirmJobId = confirmMode === "async" ? `${compareId}__confirmStandard` : null;
      const confirmState: NonNullable<CompareJsonV1["confirm"]> = {
        mode: confirmMode === "async" ? "async" : "none",
        status: confirmMode === "async" ? "pending" : "none",
        jobId: confirmJobId,
        result: null,
        error: null
      };
      const compareJson: CompareJsonV1 = {
        compareId,
        status: "done",
        createdAt: new Date().toISOString(),
        standard: { typeId: type.id, name: type.name },
        document: {
          left: { fileName: templateFileName, sha256: sha256(templateBuffer), mimeType: templateMimeType },
          right: { fileName: contractFile.originalname, sha256: sha256(contractFile.buffer), mimeType: contractFile.mimetype }
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
          mode: "none",
          status: "none",
          jobId: null,
          result: null,
          error: null
        },
        confirm: confirmState,
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

      if (confirmMode !== "async") {
        const rules = await readStandardContractRules(typeId);
        const rulesObj =
          rules && typeof rules === "object"
            ? (rules as any)
            : typeId === "purchase"
              ? ({
                  schemaVersion: "1",
                  heading: { enabled: true, maxLevel: 2 },
                  placeholder: { enabled: true },
                  deletedClause: { enabled: true },
                  purchaseContract: {
                    enabled: true,
                    signingDate: { enabled: true, minPrecision: "month" },
                    buyerName: { enabled: true, companySuffix: "公司" },
                    section1Items: {
                      enabled: true,
                      requiredKeywords: ["产品名称", "单价", "数量", "总价", "合计金额"],
                      requireUpperLowerAmount: true
                    },
                    deliveryAddress: { enabled: true, requiredKeywords: ["交货地址", "联系人"] },
                    deliveryDate: { enabled: true, minPrecision: "month" },
                    endUserName: { enabled: true, companySuffix: "公司" },
                    section4Payment: { enabled: true, requireCurrency: true, requireUpperLowerAmount: true },
                    termMax: { enabled: true, max: 10 },
                    section8Term: { enabled: true },
                    copiesCount: { enabled: true }
                  }
                } as any)
              : null;
        const confirmResult = await runStandardConfirm({
          compareId,
          rows,
          leftBlocks,
          rightBlocks,
          enableAi: false,
          rules: rulesObj
        });
        confirmState.status = "done";
        confirmState.result = confirmResult;
      }

      await Promise.all([writeJson(artifacts.jsonPath, compareJson), fsWrite(artifacts.htmlPath, htmlDoc)]);

      if (confirmMode === "async") {
        await aiQueue.add(
          "confirmStandard",
          { compareId },
          {
            jobId: confirmJobId ?? undefined
          }
        );
      }

      res.json({
        compareId,
        status: compareJson.status,
        diff: { diffHtml: extractBody(htmlDoc), meta: compareJson.diff.meta },
        confirm: {
          mode: confirmState.mode,
          status: confirmState.status,
          jobId: confirmState.jobId,
          result: confirmState.result,
          error: confirmState.error
        },
        artifacts: compareJson.artifacts,
        export: compareJson.export
      });
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      if (/standard contract not found/i.test(String(msg))) return res.status(404).send("standard contract not found");
      res.status(500).send(msg);
    }
  }
);

app.post("/api/standard/compare", upload.fields([{ name: "rightFile", maxCount: 1 }]), async (req, res) => {
  try {
    const typeId = String(req.body?.standardTypeId ?? "").trim();
    if (!typeId) return res.status(400).send("missing standardTypeId");
    const types = getStandardContractTypes();
    const type = types.find((x) => x.id === typeId);
    if (!type) return res.status(400).send("unknown standardTypeId");

    const right = (req.files as any)?.rightFile?.[0];
    if (!right) return res.status(400).send("missing files");

    const standard = await readStandardContractFile(typeId);

    const aiMode = (req.body?.aiMode ?? env("AI_MODE_DEFAULT", "async")) as "none" | "async";
    const ignoreSectionNumber = String(req.body?.ignoreSectionNumber ?? "1").trim() !== "0";
    const chunkLevel = String(req.body?.chunkLevel ?? "2").trim() === "1" ? 1 : 2;
    const compareId = `cmp_${crypto.randomUUID().replace(/-/g, "")}`;
    const artifacts = await ensureArtifacts(compareId);

    const [leftHtml, rightHtml] = await Promise.all([
      bufferToSafeHtml({ buffer: standard.buffer, mimeType: standard.meta.mimeType, fileName: standard.meta.fileName }),
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

      const hasUnderline =
        /<u\b/i.test(lb.htmlFragment ?? "") ||
        /<u\b/i.test(rb.htmlFragment ?? "") ||
        /text-decoration\s*:\s*underline/i.test(lb.htmlFragment ?? "") ||
        /text-decoration\s*:\s*underline/i.test(rb.htmlFragment ?? "");

      if (lb.kind === "table" || rb.kind === "table" || hasUnderline) {
        row.diff = { leftDiffHtmlFragment: lb.htmlFragment, rightDiffHtmlFragment: rb.htmlFragment };
      } else {
        const d = inlineDiffHtml(lb.text, rb.text, { lineLookahead: 10, ignoreSectionNumber });
        row.diff = { leftDiffHtmlFragment: `<p>${d.leftHtml}</p>`, rightDiffHtmlFragment: `<p>${d.rightHtml}</p>` };
      }
      modifiedCount++;
    }

    const htmlDoc = renderCompareHtml({
      leftBlocks,
      rightBlocks,
      rows,
      title: `标准对比：${type.name} vs ${right.originalname}`
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

    const analyzeJobId = aiMode === "async" ? `${compareId}__analyze` : null;
    const compareJson: CompareJsonV1 = {
      compareId,
      status: "done",
      createdAt: new Date().toISOString(),
      standard: { typeId: type.id, name: type.name },
      document: {
        left: { fileName: standard.meta.fileName, sha256: standard.meta.sha256, mimeType: standard.meta.mimeType },
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
          jobId: analyzeJobId ?? undefined
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

    if (aiMode === "none") {
      res.json({
        compareId,
        status: compareJson.status,
        diff: { diffHtml: extractBody(htmlDoc), meta: compareJson.diff.meta },
        ai: {
          mode: "none",
          status: "none",
          jobId: null,
          pollUrl: null
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
    const msg = e?.message ?? String(e);
    if (/standard contract not found/i.test(String(msg))) return res.status(404).send("standard contract not found");
    res.status(500).send(msg);
  }
});

app.post("/api/compare", upload.fields([{ name: "leftFile", maxCount: 1 }, { name: "rightFile", maxCount: 1 }]), async (req, res) => {
  try {
    const left = (req.files as any)?.leftFile?.[0];
    const right = (req.files as any)?.rightFile?.[0];
    if (!left || !right) return res.status(400).send("missing files");

    const aiModeRaw = (req.body?.aiMode ?? env("AI_MODE_DEFAULT", "async")) as "none" | "async";
    const standardTypeId = String(req.body?.standardTypeId ?? "").trim();
    const standardTypes = getStandardContractTypes();
    const standardType = standardTypeId ? standardTypes.find((t) => t.id === standardTypeId) ?? null : null;
    if (standardTypeId && !standardType) return res.status(400).send("unknown standardTypeId");

    const aiMode = standardType ? "none" : aiModeRaw;
    const confirmMode = standardType ? (aiModeRaw as "none" | "async") : "none";
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

      const hasUnderline =
        /<u\b/i.test(lb.htmlFragment ?? "") ||
        /<u\b/i.test(rb.htmlFragment ?? "") ||
        /text-decoration\s*:\s*underline/i.test(lb.htmlFragment ?? "") ||
        /text-decoration\s*:\s*underline/i.test(rb.htmlFragment ?? "");

      if (lb.kind === "table" || rb.kind === "table" || hasUnderline) {
        row.diff = { leftDiffHtmlFragment: lb.htmlFragment, rightDiffHtmlFragment: rb.htmlFragment };
      } else {
        const d = inlineDiffHtml(lb.text, rb.text, { lineLookahead: 10, ignoreSectionNumber });
        row.diff = { leftDiffHtmlFragment: `<p>${d.leftHtml}</p>`, rightDiffHtmlFragment: `<p>${d.rightHtml}</p>` };
      }
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

    const analyzeJobId = aiMode === "async" ? `${compareId}__analyze` : null;
    const confirmJobId = standardType && confirmMode === "async" ? `${compareId}__confirmStandard` : null;
    const confirmState: NonNullable<CompareJsonV1["confirm"]> | null = standardType
      ? {
          mode: confirmMode === "async" ? "async" : "none",
          status: confirmMode === "async" ? "pending" : "none",
          jobId: confirmJobId,
          result: null,
          error: null
        }
      : null;
    const compareJson: CompareJsonV1 = {
      compareId,
      status: "done",
      createdAt: new Date().toISOString(),
      standard: standardType ? { typeId: standardType.id, name: standardType.name } : null,
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
      confirm: confirmState ?? undefined,
      export: {
        pdf: {
          status: "none",
          jobId: null,
          error: null,
          diffOnly: false
        }
      },
      artifacts: {
        compareHtmlUrl: `/api/compare/${compareId}/artifact/html`,
        comparePdfUrl: null
      },
      errors: []
    };

    if (standardType && confirmMode !== "async") {
      const rules = await readStandardContractRules(standardType.id);
      const rulesObj =
        rules && typeof rules === "object"
          ? (rules as any)
          : standardType.id === "purchase"
            ? ({
                schemaVersion: "1",
                heading: { enabled: true, maxLevel: 2 },
                placeholder: { enabled: true },
                deletedClause: { enabled: true },
                purchaseContract: {
                  enabled: true,
                  signingDate: { enabled: true, minPrecision: "month" },
                  buyerName: { enabled: true, companySuffix: "公司" },
                  section1Items: {
                    enabled: true,
                    requiredKeywords: ["产品名称", "单价", "数量", "总价", "合计金额"],
                    requireUpperLowerAmount: true
                  },
                  deliveryAddress: { enabled: true, requiredKeywords: ["交货地址", "联系人"] },
                  deliveryDate: { enabled: true, minPrecision: "month" },
                  endUserName: { enabled: true, companySuffix: "公司" },
                  section4Payment: { enabled: true, requireCurrency: true, requireUpperLowerAmount: true },
                  termMax: { enabled: true, max: 10 },
                  section8Term: { enabled: true },
                  copiesCount: { enabled: true }
                }
              } as any)
            : null;
      const confirmResult = await runStandardConfirm({
        compareId,
        rows,
        leftBlocks,
        rightBlocks,
        enableAi: false,
        rules: rulesObj
      });
      if (confirmState) {
        confirmState.status = "done";
        confirmState.result = confirmResult;
      }
    }

    await Promise.all([writeJson(artifacts.jsonPath, compareJson), fsWrite(artifacts.htmlPath, htmlDoc)]);

    if (aiMode === "async") {
      await aiQueue.add(
        "analyze",
        { compareId },
        {
          jobId: analyzeJobId ?? undefined
        }
      );
      if (standardType && confirmMode === "async") {
        await aiQueue.add(
          "confirmStandard",
          { compareId },
          {
            jobId: confirmJobId ?? undefined
          }
        );
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
        confirm: confirmState
          ? {
              mode: confirmState.mode,
              status: confirmState.status,
              jobId: confirmState.jobId,
              pollUrl: confirmState.jobId ? `/api/ai/jobs/${confirmState.jobId}?compareId=${compareId}` : null
            }
          : undefined,
        artifacts: compareJson.artifacts,
        export: compareJson.export
      });
      return;
    }

    if (aiMode === "none") {
      if (standardType && confirmMode === "async") {
        await aiQueue.add(
          "confirmStandard",
          { compareId },
          {
            jobId: confirmJobId ?? undefined
          }
        );
      }
      res.json({
        compareId,
        status: compareJson.status,
        diff: { diffHtml: extractBody(htmlDoc), meta: compareJson.diff.meta },
        ai: {
          mode: "none",
          status: "none",
          jobId: null,
          pollUrl: null
        },
        confirm: confirmState
          ? {
              mode: confirmState.mode,
              status: confirmState.status,
              jobId: confirmState.jobId,
              pollUrl: confirmState.jobId ? `/api/ai/jobs/${confirmState.jobId}?compareId=${compareId}` : null,
              result: confirmState.result
            }
          : undefined,
        artifacts: compareJson.artifacts,
        export: compareJson.export
      });
      return;
    }

    const aiResult = await analyzeRisks({ compareId, rows: aiPayloadRows });
    compareJson.ai.result = aiResult;
    compareJson.ai.status = "done";
    await writeJson(artifacts.jsonPath, compareJson);

    if (standardType && confirmMode === "async") {
      await aiQueue.add(
        "confirmStandard",
        { compareId },
        {
          jobId: confirmJobId ?? undefined
        }
      );
    }
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
      confirm: confirmState
        ? {
            mode: confirmState.mode,
            status: confirmState.status,
            jobId: confirmState.jobId,
            pollUrl: confirmState.jobId ? `/api/ai/jobs/${confirmState.jobId}?compareId=${compareId}` : null,
            result: confirmState.result
          }
        : undefined,
      artifacts: compareJson.artifacts,
      export: compareJson.export
    });
  } catch (e: any) {
    res.status(500).send(e?.message ?? String(e));
  }
});

app.get("/api/compare/:compareId", async (req, res) => {
  const compareId = await resolveCompareId(req.params.compareId);
  const artifacts = await ensureArtifacts(compareId);
  if (!(await fileExists(artifacts.jsonPath))) return res.status(404).send("not found");
  const json = await readJson<CompareJsonV1>(artifacts.jsonPath);

  let changed = false;

  const reconcile = async (key: "ai" | "confirm") => {
    const st = (json as any)?.[key]?.status as string | undefined;
    const jobId = (json as any)?.[key]?.jobId as string | null | undefined;
    const isTerminal = st === "done" || st === "failed" || st === "cancelled" || st === "none";
    if (isTerminal) return;
    if (!jobId) return;

    const job = await aiQueue.getJob(jobId);
    if (!job) {
      (json as any)[key].status = "failed";
      (json as any)[key].error = "job not found";
      changed = true;
      return;
    }
    const state = await job.getState();

    if (state === "failed") {
      (json as any)[key].status = "failed";
      (json as any)[key].error = job.failedReason ?? "failed";
      changed = true;
      return;
    }

    if (state === "completed") {
      const hasResult = Boolean((json as any)?.[key]?.result);
      if (!hasResult) {
        (json as any)[key].status = "failed";
        (json as any)[key].error = "job completed but result missing";
        changed = true;
        return;
      }
      (json as any)[key].status = "done";
      changed = true;
    }
  };

  try {
    await Promise.all([reconcile("ai"), reconcile("confirm")]);
  } catch {}

  if (changed) await writeJson(artifacts.jsonPath, json);
  res.json(json);
});

app.get("/api/compare/:compareId/artifact/html", async (req, res) => {
  const compareId = await resolveCompareId(req.params.compareId);
  const artifacts = await ensureArtifacts(compareId);
  if (!(await fileExists(artifacts.htmlPath))) return res.status(404).send("not found");
  res.type("text/html").sendFile(artifacts.htmlPath);
});

app.get("/api/compare/:compareId/artifact/pdf", async (req, res) => {
  const compareId = await resolveCompareId(req.params.compareId);
  const artifacts = await ensureArtifacts(compareId);
  const diffOnly = String(req.query?.diffOnly ?? "").trim() === "1";
  const pdfPath = diffOnly ? artifacts.diffPdfPath : artifacts.pdfPath;
  if (!(await fileExists(pdfPath))) return res.status(404).send("not found");
  res.type("application/pdf").sendFile(pdfPath);
});

app.post("/api/compare/:compareId/ai/block", async (req, res) => {
  try {
    const compareId = await resolveCompareId(req.params.compareId);
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
    const compareId = await resolveCompareId(req.params.compareId);
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
    const compareId = await resolveCompareId(req.params.compareId);
    const diffOnly = Boolean(req.body?.diffOnly);
    const artifacts = await ensureArtifacts(compareId);
    if (!(await fileExists(artifacts.jsonPath))) return res.status(404).send("not found");

    const json = await readJson<CompareJsonV1>(artifacts.jsonPath);
    if (!json.export) {
      json.export = { pdf: { status: "none", jobId: null, error: null, diffOnly: false } };
    }
    if (!json.export.pdf) {
      json.export.pdf = { status: "none", jobId: null, error: null, diffOnly: false };
    }
    if (
      (json.export?.pdf?.status === "pending" || json.export?.pdf?.status === "running") &&
      Boolean(json.export?.pdf?.diffOnly) === diffOnly
    ) {
      return res.status(202).json({
        compareId,
        status: json.export.pdf.status,
        jobId: json.export.pdf.jobId,
        url: json.artifacts.comparePdfUrl
      });
    }
    if (json.export?.pdf?.status === "done" && json.artifacts.comparePdfUrl && Boolean(json.export?.pdf?.diffOnly) === diffOnly) {
      return res.status(200).json({ compareId, status: "done", jobId: json.export.pdf.jobId, url: json.artifacts.comparePdfUrl });
    }

    const exportJobId = `${compareId}__exportPdf__${diffOnly ? "diff" : "full"}`;
    await aiQueue.add("exportPdf", { compareId, diffOnly }, { jobId: exportJobId, attempts: 3, backoff: { type: "exponential", delay: 2_000 } });
    json.export.pdf.status = "pending";
    json.export.pdf.jobId = exportJobId;
    json.export.pdf.error = null;
    json.export.pdf.diffOnly = diffOnly;
    json.artifacts.comparePdfUrl = null;
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

async function resolveCompareId(raw: string): Promise<string> {
  const reqId = String(raw ?? "").trim();
  if (!reqId) return reqId;

  const artifacts = await ensureArtifacts(reqId);
  if (await fileExists(artifacts.jsonPath)) return reqId;

  const suffix = reqId.replace(/^cmp_/i, "");
  if (!/^[a-f0-9]{8}$/i.test(suffix) && !/^[a-f0-9]{16,}$/i.test(suffix)) return reqId;

  const fsP = await import("node:fs/promises");
  const pathP = await import("node:path");
  const baseFromEnv = envOptional("ARTIFACTS_DIR");
  const bases = Array.from(new Set([baseFromEnv, "./artifacts"].filter(Boolean))) as string[];

  const matches: Array<{ id: string; mtime: number }> = [];
  for (const base of bases) {
    try {
      const names = await fsP.readdir(base);
      for (const name0 of names) {
        const name = String(name0 ?? "");
        if (!name.startsWith("cmp_")) continue;
        if (!name.toLowerCase().endsWith(suffix.toLowerCase())) continue;
        const dirPath = pathP.join(base, name);
        const stDir = await fsP.stat(dirPath).catch(() => null);
        if (!stDir || !stDir.isDirectory()) continue;
        try {
          const st = await fsP.stat(pathP.join(dirPath, "compare.json"));
          matches.push({ id: name, mtime: Number(st.mtimeMs) || 0 });
        } catch {}
      }
    } catch {}
  }
  matches.sort((a, b) => b.mtime - a.mtime);
  return matches[0]?.id ?? reqId;
}

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
  const parserProvider = String(envOptional("PARSER_PROVIDER") ?? "unstructured").trim().toLowerCase();
  const mt = String(params.mimeType ?? "").toLowerCase();
  const name = String(params.fileName ?? "");
  const lower = name.toLowerCase();
  if (parserProvider === "unstructured") {
    const isPdf = mt.includes("pdf") || lower.endsWith(".pdf");
    const isDocx = mt.includes("wordprocessingml") || lower.endsWith(".docx");
    const isDoc = (!isDocx && mt.includes("msword")) || lower.endsWith(".doc");

    let html = "";
    try {
      html = await unstructuredBufferToSafeHtml({
        buffer: params.buffer,
        fileName: name,
        mimeType: params.mimeType
      });
    } catch {
      if (isPdf) return pdfBufferToSafeHtml(params.buffer);
      if (isDocx) {
        try {
          const html2 = await docxBufferToSafeHtmlMammoth(params.buffer);
          if (html2) return html2;
        } catch {}
        // Fallback to soffice only if configured, otherwise fail gracefully or return empty
        if (process.env.SOFFICE_BIN) {
             return docxBufferToSafeHtml(params.buffer);
        }
        throw new Error("Docx parsing failed (mammoth returned empty, and SOFFICE_BIN not set)");
      }
      if (isDoc) return docBufferToSafeHtml(params.buffer);
      throw new Error(`unstructured failed for: ${params.mimeType} (${params.fileName})`);
    }
    if (isDocx && !/<\s*table\b/i.test(html)) {
      const text = normalizeText(html.replace(/<[^>]+>/g, " "));
      try {
        const html2 = await docxBufferToSafeHtmlMammoth(params.buffer);
        if (/<\s*table\b/i.test(html2)) return html2;
        const t2 = normalizeText(html2.replace(/<[^>]+>/g, " "));
        if (!text && t2) return html2;
      } catch {}
      if (/(产品名称|规格|型号|数量|单价|总价|合计金额|备注|产地|商标)/.test(text)) {
        return await docxBufferToSafeHtml(params.buffer);
      }
    }
    if (isDoc && !/<\s*table\b/i.test(html)) {
      const text = normalizeText(html.replace(/<[^>]+>/g, " "));
      if (/(产品名称|规格|型号|数量|单价|总价|合计金额|备注|产地|商标)/.test(text)) {
        try {
          return await docBufferToSafeHtml(params.buffer);
        } catch {}
      }
    }
    return html;
  }
  if (mt.includes("pdf") || lower.endsWith(".pdf")) return pdfBufferToSafeHtml(params.buffer);
  if (mt.includes("wordprocessingml") || lower.endsWith(".docx")) return docxBufferToSafeHtml(params.buffer);
  if (mt.includes("msword") || lower.endsWith(".doc")) return docBufferToSafeHtml(params.buffer);
  throw new Error(`Unsupported file type: ${params.mimeType} (${params.fileName})`);
}

let unstructuredTail: Promise<void> = Promise.resolve();

async function withUnstructuredLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => await fn();
  const p = unstructuredTail.then(run, run);
  unstructuredTail = p.then(
    () => undefined,
    () => undefined
  );
  return p;
}

const unstructuredSanitizeCfg: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "br",
    "ul",
    "ol",
    "li",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "blockquote",
    "hr",
    "span"
  ],
  allowedAttributes: {
    span: ["style"],
    p: ["style"],
    table: ["style"],
    td: ["style"],
    th: ["style"],
    "*": []
  },
  allowedStyles: {
    "*": {
      "text-align": [/^left$|^right$|^center$|^justify$/],
      "font-weight": [/^\d+$/],
      "font-style": [/^italic$/],
      "text-decoration": [/^underline$/]
    }
  }
};

function stripMarkdownFences(html: string): string {
  let s = String(html ?? "");
  s = s.replace(/^\s*```(?:html)?\s*/i, "");
  s = s.replace(/\s*```\s*$/i, "");
  return s.trim();
}

function tableHtmlFromTabText(text: string): string | null {
  const raw = String(text ?? "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  if (!raw.trim()) return null;

  const lines = raw
    .split("\n")
    .map((x) => String(x ?? ""))
    .filter((x) => x.replace(/[ \t]/g, "").length > 0 || x.includes("\t"));
  if (lines.length < 2) return null;

  const parseCells = (line: string): string[] => {
    if (line.includes("\t")) return line.split("\t").map((x) => String(x ?? "").trim());
    const trimmed = line.trim();
    if (!trimmed) return [""];
    return trimmed.split(/[ ]{2,}/g).map((x) => String(x ?? "").trim());
  };

  let rows = lines.map(parseCells);
  const colN = rows.reduce((m, r) => Math.max(m, r.length), 0);
  if (colN < 2) return null;

  rows = rows.map((r) => {
    const out = r.slice(0, colN);
    while (out.length < colN) out.push("");
    return out;
  });

  const htmlRows = rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("");
  return `<table><tbody>${htmlRows}</tbody></table>`;
}

function unstructuredElementsToHtml(elements: any[]): string {
  const out: string[] = [];
  let listItems: string[] = [];
  const flushList = () => {
    if (!listItems.length) return;
    out.push(`<ul>${listItems.join("")}</ul>`);
    listItems = [];
  };
  for (const el of elements) {
    const type = String(el?.type ?? el?.category ?? "").trim();
    const rawText0 = String(el?.text ?? "").replace(/\u0000/g, "");
    const text = normalizeText(rawText0);
    const meta = (el?.metadata ?? {}) as any;
    const textAsHtml = meta?.text_as_html ?? el?.text_as_html ?? "";
    const isTable = /table/i.test(type);
    const isListItem = /listitem/i.test(type);
    const isTitle = type === "Title" || /title/i.test(type);

    const htmlCandidate = textAsHtml ? stripMarkdownFences(String(textAsHtml)) : "";
    if (htmlCandidate && /<\s*table\b/i.test(htmlCandidate)) {
      flushList();
      out.push(htmlCandidate);
      continue;
    }
    if (isTable) {
      const html2 = tableHtmlFromTabText(rawText0);
      if (html2) {
        flushList();
        out.push(html2);
        continue;
      }
    }
    if (!text) {
      flushList();
      continue;
    }

    if (isTitle && text.length <= 120) {
      flushList();
      out.push(`<h2>${escapeHtml(text)}</h2>`);
      continue;
    }
    if (isListItem) {
      listItems.push(`<li>${escapeHtml(text)}</li>`);
      continue;
    }
    flushList();
    out.push(`<p>${escapeHtml(text).replace(/\n/g, "<br/>")}</p>`);
  }
  flushList();
  return out.join("");
}

async function unstructuredBufferToSafeHtml(params: { buffer: Buffer; mimeType: string; fileName: string }): Promise<string> {
  const inDocker = (() => {
    try {
      return fs.existsSync("/.dockerenv");
    } catch {
      return false;
    }
  })();

  const rewriteUrlForDocker = (raw: string): string => {
    const t = String(raw ?? "").trim();
    if (!t || !inDocker) return t;
    try {
      const u = new URL(t);
      if (u.hostname === "localhost" || u.hostname === "127.0.0.1") u.hostname = "host.docker.internal";
      return u.toString();
    } catch {
      return t;
    }
  };

  const url = rewriteUrlForDocker(String(envOptional("UNSTRUCTURED_URL") ?? "http://parser:8000/general/v0/general").trim());
  if (!url) throw new Error("UNSTRUCTURED_URL is empty");

  const timeoutMsRaw = String(envOptional("UNSTRUCTURED_TIMEOUT_MS") ?? "180000").trim();
  const timeoutMs = Number.parseInt(timeoutMsRaw, 10);
  const finalTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 180_000;

  return await withUnstructuredLock(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), finalTimeoutMs);
    try {
      const FormDataCtor = (globalThis as any).FormData;
      const BlobCtor = (globalThis as any).Blob;
      if (!FormDataCtor || !BlobCtor) throw new Error("FormData/Blob not available in runtime");

      const form = new FormDataCtor();
      form.set(
        "files",
        new BlobCtor([params.buffer], { type: params.mimeType || "application/octet-stream" }),
        params.fileName || "file"
      );
      form.set("output_format", "application/json");
      form.set("strategy", "auto");
      form.set("pdf_infer_table_structure", "true");
      form.set("skip_infer_table_types", "[]");

      const apiKey = String(envOptional("UNSTRUCTURED_API_KEY") ?? "").trim();
      const res = await fetch(url, {
        method: "POST",
        headers: apiKey ? ({ "unstructured-api-key": apiKey } as any) : undefined,
        body: form as any,
        signal: controller.signal
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        const head = String(t ?? "").slice(0, 1200);
        throw new Error(`unstructured failed: ${res.status} ${head}`.trim());
      }
      const json: any = await res.json();
      const elements: any[] = Array.isArray(json) ? json : Array.isArray(json?.elements) ? json.elements : [];
      const html = unstructuredElementsToHtml(elements);
      const sanitized = sanitizeHtml(html, unstructuredSanitizeCfg);
      return sanitized || "<p></p>";
    } catch (e: any) {
      if (e?.name === "AbortError") throw new Error("unstructured timeout");
      throw e;
    } finally {
      clearTimeout(timer);
    }
  });
}

import { Worker } from "bullmq";
import { aiQueueName, redisUrl } from "./lib/queue";
import { ensureArtifacts, readJson, readStandardContractRules, writeJson } from "./lib/storage";
import { analyzeRisks } from "./lib/ai/analyze";
import { runStandardConfirm } from "./lib/confirm";
import { renderPdfFromHtmlFile } from "./lib/pdf";
import { renderCompareHtml } from "./lib/render";
import { normalizeText } from "./lib/text";
import fs from "node:fs/promises";

type CompareJsonV1 = any;

const worker = new Worker(
  aiQueueName,
  async (job) => {
    if (job.name === "analyze") {
      const compareId = job.data?.compareId as string;
      const artifacts = await ensureArtifacts(compareId);
      const json = await readJson<CompareJsonV1>(artifacts.jsonPath);
      if (!json.ai) json.ai = { mode: "async", status: "pending", jobId: null, result: null, error: null };
      if (!json.ai.jobId) json.ai.jobId = String(job.id);
      json.ai.status = "running";
      await writeJson(artifacts.jsonPath, json);

      const rowsFromJob = (job.data?.rows ?? null) as
        | Array<{
            rowId: string;
            kind: "modified" | "inserted" | "deleted";
            blockId: string;
            beforeText: string | null;
            afterText: string | null;
          }>
        | null;

      const rows =
        Array.isArray(rowsFromJob) && rowsFromJob.length > 0
          ? rowsFromJob
          : (() => {
              const leftBlocks = (json.diff?.leftBlocks ?? []) as Array<{ blockId: string; text: string }>;
              const rightBlocks = (json.diff?.rightBlocks ?? []) as Array<{ blockId: string; text: string }>;
              const leftMap = new Map(leftBlocks.map((b) => [b.blockId, b]));
              const rightMap = new Map(rightBlocks.map((b) => [b.blockId, b]));
              const diffRows = (json.diff?.rows ?? []) as Array<{
                rowId: string;
                kind: string;
                leftBlockId?: string | null;
                rightBlockId?: string | null;
              }>;
              return diffRows
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
            })();

      await job.updateProgress(1);
      const result = await analyzeRisks({
        compareId,
        rows,
        onProgress: async (info) => {
          const pct = Math.max(1, Math.min(99, Math.floor((info.completed / Math.max(1, info.total)) * 100)));
          await job.updateProgress(pct);
        }
      });
      await job.updateProgress(100);

      json.ai.status = "done";
      json.ai.result = result;
      json.ai.error = null;
      for (const r of json.diff?.rows ?? []) {
        if (r?.ai) r.ai.status = "done";
      }
      await writeJson(artifacts.jsonPath, json);
      return;
    }

    if (job.name === "confirmStandard") {
      const compareId = job.data?.compareId as string;
      const artifacts = await ensureArtifacts(compareId);
      const json = await readJson<CompareJsonV1>(artifacts.jsonPath);

      if (!json.confirm) json.confirm = { mode: "async", status: "pending", jobId: null, result: null, error: null };
      if (!json.confirm.jobId) json.confirm.jobId = String(job.id);
      json.confirm.status = "running";
      await writeJson(artifacts.jsonPath, json);

      await job.updateProgress(1);
      const typeId = String((json as any)?.standard?.typeId ?? "").trim();
      const rules = typeId ? await readStandardContractRules(typeId) : null;
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
      const result = await runStandardConfirm({
        compareId,
        rows: (json.diff?.rows ?? []) as any,
        leftBlocks: (json.diff?.leftBlocks ?? []) as any,
        rightBlocks: (json.diff?.rightBlocks ?? []) as any,
        enableAi: String(json.confirm?.mode ?? "none") === "async",
        rules: rulesObj
      });
      await job.updateProgress(100);

      json.confirm.status = "done";
      json.confirm.result = result;
      json.confirm.error = null;
      await writeJson(artifacts.jsonPath, json);
      return;
    }

    if (job.name === "exportPdf") {
      const compareId = job.data?.compareId as string;
      const diffOnly = Boolean(job.data?.diffOnly);
      const artifacts = await ensureArtifacts(compareId);
      const json = await readJson<CompareJsonV1>(artifacts.jsonPath);

      if (!json.export) json.export = { pdf: { status: "none", jobId: null, error: null, diffOnly: false } };
      if (!json.export.pdf) json.export.pdf = { status: "none", jobId: null, error: null, diffOnly: false };
      if (!json.export.pdf.jobId) json.export.pdf.jobId = String(job.id);
      json.export.pdf.status = "running";
      json.export.pdf.diffOnly = diffOnly;
      await writeJson(artifacts.jsonPath, json);

      const htmlPath = diffOnly ? artifacts.diffHtmlPath : artifacts.htmlPath;
      const pdfPath = diffOnly ? artifacts.diffPdfPath : artifacts.pdfPath;

      if (diffOnly) {
        const html = renderCompareHtml({
          leftBlocks: (json.diff?.leftBlocks ?? []) as any,
          rightBlocks: (json.diff?.rightBlocks ?? []) as any,
          rows: (json.diff?.rows ?? []) as any,
          title: "合同对比（仅差异）",
          diffOnly: true
        });
        await fs.writeFile(htmlPath, html, "utf8");
      }

      await renderPdfFromHtmlFile({ htmlPath, pdfPath });

      json.export.pdf.status = "done";
      json.export.pdf.error = null;
      json.artifacts.comparePdfUrl = `/api/compare/${compareId}/artifact/pdf${diffOnly ? "?diffOnly=1" : ""}`;
      await writeJson(artifacts.jsonPath, json);
      return;
    }
  },
  { connection: { url: redisUrl } }
);

worker.on("failed", async (job, err) => {
  try {
    const compareId = (job?.data as any)?.compareId as string;
    if (!compareId) return;
    const artifacts = await ensureArtifacts(compareId);
    const json = await readJson<CompareJsonV1>(artifacts.jsonPath);
    const attempts = typeof (job as any)?.opts?.attempts === "number" ? (job as any).opts.attempts : 1;
    const attemptsMade = typeof (job as any)?.attemptsMade === "number" ? (job as any).attemptsMade : attempts;
    const willRetry = attemptsMade < attempts;
    if (job?.name === "exportPdf") {
      if (!json.export) json.export = { pdf: { status: "none", jobId: null, error: null, diffOnly: false } };
      if (!json.export.pdf) json.export.pdf = { status: "none", jobId: null, error: null, diffOnly: false };
      if (!json.export.pdf.jobId) json.export.pdf.jobId = String(job.id);
      json.export.pdf.status = willRetry ? "pending" : "failed";
      json.export.pdf.error = err?.message ?? String(err);
      json.export.pdf.diffOnly = Boolean((job as any)?.data?.diffOnly);
    } else if (job?.name === "confirmStandard") {
      if (!json.confirm) json.confirm = { mode: "async", status: "pending", jobId: null, result: null, error: null };
      if (!json.confirm.jobId) json.confirm.jobId = String(job?.id ?? "");
      json.confirm.status = willRetry ? "pending" : "failed";
      json.confirm.error = err?.message ?? String(err);
    } else {
      if (!json.ai) json.ai = { mode: "async", status: "pending", jobId: null, result: null, error: null };
      if (!json.ai.jobId) json.ai.jobId = String(job?.id ?? "");
      json.ai.status = willRetry ? "pending" : "failed";
      json.ai.error = err?.message ?? String(err);
    }
    await writeJson(artifacts.jsonPath, json);
  } catch {}
});

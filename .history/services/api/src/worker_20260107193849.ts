import { Worker } from "bullmq";
import { aiQueueName, redisUrl } from "./lib/queue";
import { ensureArtifacts, readJson, writeJson } from "./lib/storage";
import { analyzeRisks } from "./lib/ai/analyze";
import { renderPdfFromHtmlFile } from "./lib/pdf";
import { normalizeText } from "./lib/text";

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

    if (job.name === "exportPdf") {
      const compareId = job.data?.compareId as string;
      const artifacts = await ensureArtifacts(compareId);
      const json = await readJson<CompareJsonV1>(artifacts.jsonPath);

      if (!json.export) json.export = { pdf: { status: "none", jobId: null, error: null } };
      if (!json.export.pdf) json.export.pdf = { status: "none", jobId: null, error: null };
      if (!json.export.pdf.jobId) json.export.pdf.jobId = String(job.id);
      json.export.pdf.status = "running";
      await writeJson(artifacts.jsonPath, json);

      await renderPdfFromHtmlFile({ htmlPath: artifacts.htmlPath, pdfPath: artifacts.pdfPath });

      json.export.pdf.status = "done";
      json.export.pdf.error = null;
      json.artifacts.comparePdfUrl = `/api/compare/${compareId}/artifact/pdf`;
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
    if (job?.name === "exportPdf") {
      if (!json.export) json.export = { pdf: { status: "none", jobId: null, error: null } };
      if (!json.export.pdf) json.export.pdf = { status: "none", jobId: null, error: null };
      if (!json.export.pdf.jobId) json.export.pdf.jobId = String(job.id);
      json.export.pdf.status = "failed";
      json.export.pdf.error = err?.message ?? String(err);
    } else {
      if (!json.ai) json.ai = { mode: "async", status: "pending", jobId: null, result: null, error: null };
      if (!json.ai.jobId) json.ai.jobId = String(job?.id ?? "");
      json.ai.status = "failed";
      json.ai.error = err?.message ?? String(err);
    }
    await writeJson(artifacts.jsonPath, json);
  } catch {}
});

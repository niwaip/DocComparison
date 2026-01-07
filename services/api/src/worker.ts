import { Worker } from "bullmq";
import { aiQueueName, redisUrl } from "./lib/queue";
import { ensureArtifacts, readJson, writeJson } from "./lib/storage";
import { analyzeRisks } from "./lib/ai/analyze";
import { renderPdfFromHtmlFile } from "./lib/pdf";

type CompareJsonV1 = any;

const worker = new Worker(
  aiQueueName,
  async (job) => {
    if (job.name === "analyze") {
      const compareId = job.data?.compareId as string;
      const rows = (job.data?.rows ?? []) as Array<{
        rowId: string;
        kind: "modified" | "inserted" | "deleted";
        blockId: string;
        beforeText: string | null;
        afterText: string | null;
      }>;

      const artifacts = await ensureArtifacts(compareId);
      const json = await readJson<CompareJsonV1>(artifacts.jsonPath);
      json.ai.status = "running";
      await writeJson(artifacts.jsonPath, json);

      const result = await analyzeRisks({ compareId, rows });

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
      json.export.pdf.status = "failed";
      json.export.pdf.error = err?.message ?? String(err);
    } else {
      json.ai.status = "failed";
      json.ai.error = err?.message ?? String(err);
    }
    await writeJson(artifacts.jsonPath, json);
  } catch {}
});

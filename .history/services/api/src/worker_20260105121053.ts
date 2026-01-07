import { Worker } from "bullmq";
import { aiQueueName, redisUrl } from "./lib/queue";
import { ensureArtifacts, readJson, writeJson } from "./lib/storage";
import { analyzeRisks } from "./lib/ai/analyze";

type CompareJsonV1 = any;

const worker = new Worker(
  aiQueueName,
  async (job) => {
    if (job.name !== "analyze") return;
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
  },
  { connection: { url: redisUrl } }
);

worker.on("failed", async (job, err) => {
  try {
    const compareId = (job?.data as any)?.compareId as string;
    if (!compareId) return;
    const artifacts = await ensureArtifacts(compareId);
    const json = await readJson<CompareJsonV1>(artifacts.jsonPath);
    json.ai.status = "failed";
    json.ai.error = err?.message ?? String(err);
    await writeJson(artifacts.jsonPath, json);
  } catch {}
});

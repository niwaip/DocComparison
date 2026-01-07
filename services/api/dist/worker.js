"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const queue_1 = require("./lib/queue");
const storage_1 = require("./lib/storage");
const analyze_1 = require("./lib/ai/analyze");
const pdf_1 = require("./lib/pdf");
const text_1 = require("./lib/text");
const worker = new bullmq_1.Worker(queue_1.aiQueueName, async (job) => {
    if (job.name === "analyze") {
        const compareId = job.data?.compareId;
        const artifacts = await (0, storage_1.ensureArtifacts)(compareId);
        const json = await (0, storage_1.readJson)(artifacts.jsonPath);
        if (!json.ai)
            json.ai = { mode: "async", status: "pending", jobId: null, result: null, error: null };
        if (!json.ai.jobId)
            json.ai.jobId = String(job.id);
        json.ai.status = "running";
        await (0, storage_1.writeJson)(artifacts.jsonPath, json);
        const rowsFromJob = (job.data?.rows ?? null);
        const rows = Array.isArray(rowsFromJob) && rowsFromJob.length > 0
            ? rowsFromJob
            : (() => {
                const leftBlocks = (json.diff?.leftBlocks ?? []);
                const rightBlocks = (json.diff?.rightBlocks ?? []);
                const leftMap = new Map(leftBlocks.map((b) => [b.blockId, b]));
                const rightMap = new Map(rightBlocks.map((b) => [b.blockId, b]));
                const diffRows = (json.diff?.rows ?? []);
                return diffRows
                    .filter((r) => r.kind === "modified" || r.kind === "inserted" || r.kind === "deleted")
                    .map((r) => {
                    const lb = r.leftBlockId ? leftMap.get(r.leftBlockId) : undefined;
                    const rb = r.rightBlockId ? rightMap.get(r.rightBlockId) : undefined;
                    const blockId = (rb?.blockId ?? lb?.blockId ?? "");
                    return {
                        rowId: r.rowId,
                        kind: r.kind,
                        blockId,
                        beforeText: lb?.text ?? null,
                        afterText: rb?.text ?? null
                    };
                })
                    .filter((x) => (0, text_1.normalizeText)((x.beforeText ?? "") + (x.afterText ?? "")).length > 0);
            })();
        await job.updateProgress(1);
        const result = await (0, analyze_1.analyzeRisks)({
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
            if (r?.ai)
                r.ai.status = "done";
        }
        await (0, storage_1.writeJson)(artifacts.jsonPath, json);
        return;
    }
    if (job.name === "exportPdf") {
        const compareId = job.data?.compareId;
        const artifacts = await (0, storage_1.ensureArtifacts)(compareId);
        const json = await (0, storage_1.readJson)(artifacts.jsonPath);
        if (!json.export)
            json.export = { pdf: { status: "none", jobId: null, error: null } };
        if (!json.export.pdf)
            json.export.pdf = { status: "none", jobId: null, error: null };
        if (!json.export.pdf.jobId)
            json.export.pdf.jobId = String(job.id);
        json.export.pdf.status = "running";
        await (0, storage_1.writeJson)(artifacts.jsonPath, json);
        await (0, pdf_1.renderPdfFromHtmlFile)({ htmlPath: artifacts.htmlPath, pdfPath: artifacts.pdfPath });
        json.export.pdf.status = "done";
        json.export.pdf.error = null;
        json.artifacts.comparePdfUrl = `/api/compare/${compareId}/artifact/pdf`;
        await (0, storage_1.writeJson)(artifacts.jsonPath, json);
        return;
    }
}, { connection: { url: queue_1.redisUrl } });
worker.on("failed", async (job, err) => {
    try {
        const compareId = job?.data?.compareId;
        if (!compareId)
            return;
        const artifacts = await (0, storage_1.ensureArtifacts)(compareId);
        const json = await (0, storage_1.readJson)(artifacts.jsonPath);
        const attempts = typeof job?.opts?.attempts === "number" ? job.opts.attempts : 1;
        const attemptsMade = typeof job?.attemptsMade === "number" ? job.attemptsMade : attempts;
        const willRetry = attemptsMade < attempts;
        if (job?.name === "exportPdf") {
            if (!json.export)
                json.export = { pdf: { status: "none", jobId: null, error: null } };
            if (!json.export.pdf)
                json.export.pdf = { status: "none", jobId: null, error: null };
            if (!json.export.pdf.jobId)
                json.export.pdf.jobId = String(job.id);
            json.export.pdf.status = willRetry ? "pending" : "failed";
            json.export.pdf.error = err?.message ?? String(err);
        }
        else {
            if (!json.ai)
                json.ai = { mode: "async", status: "pending", jobId: null, result: null, error: null };
            if (!json.ai.jobId)
                json.ai.jobId = String(job?.id ?? "");
            json.ai.status = willRetry ? "pending" : "failed";
            json.ai.error = err?.message ?? String(err);
        }
        await (0, storage_1.writeJson)(artifacts.jsonPath, json);
    }
    catch { }
});

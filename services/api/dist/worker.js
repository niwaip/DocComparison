"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const queue_1 = require("./lib/queue");
const storage_1 = require("./lib/storage");
const analyze_1 = require("./lib/ai/analyze");
const pdf_1 = require("./lib/pdf");
const worker = new bullmq_1.Worker(queue_1.aiQueueName, async (job) => {
    if (job.name === "analyze") {
        const compareId = job.data?.compareId;
        const rows = (job.data?.rows ?? []);
        const artifacts = await (0, storage_1.ensureArtifacts)(compareId);
        const json = await (0, storage_1.readJson)(artifacts.jsonPath);
        json.ai.status = "running";
        await (0, storage_1.writeJson)(artifacts.jsonPath, json);
        const result = await (0, analyze_1.analyzeRisks)({ compareId, rows });
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
        if (job?.name === "exportPdf") {
            if (!json.export)
                json.export = { pdf: { status: "none", jobId: null, error: null } };
            if (!json.export.pdf)
                json.export.pdf = { status: "none", jobId: null, error: null };
            json.export.pdf.status = "failed";
            json.export.pdf.error = err?.message ?? String(err);
        }
        else {
            json.ai.status = "failed";
            json.ai.error = err?.message ?? String(err);
        }
        await (0, storage_1.writeJson)(artifacts.jsonPath, json);
    }
    catch { }
});

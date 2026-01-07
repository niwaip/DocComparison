"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_path_1 = __importDefault(require("node:path"));
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const docx_1 = require("./lib/docx");
const pdfInput_1 = require("./lib/pdfInput");
const blocks_1 = require("./lib/blocks");
const align_1 = require("./lib/align");
const inlineDiff_1 = require("./lib/inlineDiff");
const render_1 = require("./lib/render");
const storage_1 = require("./lib/storage");
const text_1 = require("./lib/text");
const queue_1 = require("./lib/queue");
const analyze_1 = require("./lib/ai/analyze");
const env_1 = require("./lib/env");
const app = (0, express_1.default)();
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: Number((0, env_1.env)("MAX_UPLOAD_MB", "20")) * 1024 * 1024 }
});
app.use(express_1.default.json({ limit: "2mb" }));
app.use(express_1.default.static(node_path_1.default.join(__dirname, "../public")));
app.post("/api/compare", upload.fields([{ name: "leftFile", maxCount: 1 }, { name: "rightFile", maxCount: 1 }]), async (req, res) => {
    try {
        const left = req.files?.leftFile?.[0];
        const right = req.files?.rightFile?.[0];
        if (!left || !right)
            return res.status(400).send("missing files");
        const aiMode = (req.body?.aiMode ?? (0, env_1.env)("AI_MODE_DEFAULT", "async"));
        const ignoreSectionNumber = String(req.body?.ignoreSectionNumber ?? "1").trim() !== "0";
        const chunkLevel = String(req.body?.chunkLevel ?? "2").trim() === "1" ? 1 : 2;
        const compareId = `cmp_${node_crypto_1.default.randomUUID().replace(/-/g, "")}`;
        const artifacts = await (0, storage_1.ensureArtifacts)(compareId);
        const [leftHtml, rightHtml] = await Promise.all([
            bufferToSafeHtml({ buffer: left.buffer, mimeType: left.mimetype, fileName: left.originalname }),
            bufferToSafeHtml({ buffer: right.buffer, mimeType: right.mimetype, fileName: right.originalname })
        ]);
        const leftBlocks = (0, blocks_1.buildBlocksFromHtml)(leftHtml, chunkLevel);
        const rightBlocks = (0, blocks_1.buildBlocksFromHtml)(rightHtml, chunkLevel);
        const rows = (0, align_1.alignBlocks)(leftBlocks, rightBlocks, { ignoreSectionNumber });
        const sectionNumberChangedRows = ignoreSectionNumber ? rows.filter((r) => r.meta?.sectionNumberChanged).length : 0;
        const leftMap = new Map(leftBlocks.map((b) => [b.blockId, b]));
        const rightMap = new Map(rightBlocks.map((b) => [b.blockId, b]));
        let modifiedCount = 0;
        for (const row of rows) {
            if (row.kind !== "modified")
                continue;
            const lb = row.leftBlockId ? leftMap.get(row.leftBlockId) : undefined;
            const rb = row.rightBlockId ? rightMap.get(row.rightBlockId) : undefined;
            if (!lb || !rb)
                continue;
            const d = (0, inlineDiff_1.inlineDiffHtml)(lb.text, rb.text, { lineLookahead: 10, ignoreSectionNumber });
            row.diff = { leftDiffHtmlFragment: `<p>${d.leftHtml}</p>`, rightDiffHtmlFragment: `<p>${d.rightHtml}</p>` };
            modifiedCount++;
        }
        const htmlDoc = (0, render_1.renderCompareHtml)({
            leftBlocks,
            rightBlocks,
            rows,
            title: `${left.originalname} vs ${right.originalname}`
        });
        const aiPayloadMaxRows = (() => {
            const raw = String((0, env_1.env)("AI_PAYLOAD_MAX_ROWS", "120")).trim();
            const n = Number.parseInt(raw, 10);
            if (!Number.isFinite(n) || n <= 0)
                return 120;
            return Math.max(10, Math.min(500, n));
        })();
        const aiPayloadMaxTextLen = (() => {
            const raw = String((0, env_1.env)("AI_PAYLOAD_MAX_TEXT_LEN", "1600")).trim();
            const n = Number.parseInt(raw, 10);
            if (!Number.isFinite(n) || n <= 0)
                return 1600;
            return Math.max(120, Math.min(10_000, n));
        })();
        const compactPayloadText = (s) => {
            const x = (0, text_1.normalizeText)(s ?? "");
            if (!x)
                return null;
            if (x.length <= aiPayloadMaxTextLen)
                return x;
            return x.slice(0, aiPayloadMaxTextLen);
        };
        const aiPayloadRows = rows
            .filter((r) => r.kind === "modified" || r.kind === "inserted" || r.kind === "deleted")
            .map((r) => {
            const lb = r.leftBlockId ? leftMap.get(r.leftBlockId) : undefined;
            const rb = r.rightBlockId ? rightMap.get(r.rightBlockId) : undefined;
            const blockId = (rb?.blockId ?? lb?.blockId ?? "");
            return {
                rowId: r.rowId,
                kind: r.kind,
                blockId,
                beforeText: compactPayloadText(lb?.text ?? null),
                afterText: compactPayloadText(rb?.text ?? null)
            };
        })
            .filter((x) => (0, text_1.normalizeText)((x.beforeText ?? "") + (x.afterText ?? "")).length > 0)
            .slice(0, aiPayloadMaxRows);
        for (const r of rows)
            r.ai = { status: aiMode === "async" ? "pending" : "none" };
        const analyzeJobId = aiMode === "async" ? `${compareId}__analyze` : null;
        const compareJson = {
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
        await Promise.all([(0, storage_1.writeJson)(artifacts.jsonPath, compareJson), fsWrite(artifacts.htmlPath, htmlDoc)]);
        if (aiMode === "async") {
            await queue_1.aiQueue.add("analyze", { compareId }, {
                jobId: analyzeJobId ?? undefined,
                attempts: 3,
                backoff: { type: "exponential", delay: 2_000 }
            });
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
        const aiResult = await (0, analyze_1.analyzeRisks)({ compareId, rows: aiPayloadRows });
        compareJson.ai.result = aiResult;
        compareJson.ai.status = "done";
        await (0, storage_1.writeJson)(artifacts.jsonPath, compareJson);
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
    }
    catch (e) {
        res.status(500).send(e?.message ?? String(e));
    }
});
app.get("/api/compare/:compareId", async (req, res) => {
    const compareId = req.params.compareId;
    const artifacts = await (0, storage_1.ensureArtifacts)(compareId);
    if (!(await (0, storage_1.fileExists)(artifacts.jsonPath)))
        return res.status(404).send("not found");
    const json = await (0, storage_1.readJson)(artifacts.jsonPath);
    res.json(json);
});
app.get("/api/compare/:compareId/artifact/html", async (req, res) => {
    const compareId = req.params.compareId;
    const artifacts = await (0, storage_1.ensureArtifacts)(compareId);
    if (!(await (0, storage_1.fileExists)(artifacts.htmlPath)))
        return res.status(404).send("not found");
    res.type("text/html").sendFile(artifacts.htmlPath);
});
app.get("/api/compare/:compareId/artifact/pdf", async (req, res) => {
    const compareId = req.params.compareId;
    const artifacts = await (0, storage_1.ensureArtifacts)(compareId);
    if (!(await (0, storage_1.fileExists)(artifacts.pdfPath)))
        return res.status(404).send("not found");
    res.type("application/pdf").sendFile(artifacts.pdfPath);
});
app.post("/api/compare/:compareId/ai/block", async (req, res) => {
    try {
        const compareId = req.params.compareId;
        const blockId = String(req.body?.blockId ?? "").trim();
        const focusText = typeof req.body?.focusText === "string" ? req.body.focusText : null;
        const aiApiKey = typeof req.body?.aiApiKey === "string" ? req.body.aiApiKey : null;
        if (!blockId)
            return res.status(400).send("missing blockId");
        const artifacts = await (0, storage_1.ensureArtifacts)(compareId);
        if (!(await (0, storage_1.fileExists)(artifacts.jsonPath)))
            return res.status(404).send("not found");
        const json = await (0, storage_1.readJson)(artifacts.jsonPath);
        const row = (json.diff?.rows ?? []).find((r) => r.leftBlockId === blockId || r.rightBlockId === blockId);
        if (!row)
            return res.status(404).send("row not found");
        if (row.kind !== "modified" && row.kind !== "inserted" && row.kind !== "deleted")
            return res.status(400).send("row kind not supported");
        const leftMap = new Map((json.diff?.leftBlocks ?? []).map((b) => [b.blockId, b]));
        const rightMap = new Map((json.diff?.rightBlocks ?? []).map((b) => [b.blockId, b]));
        const lb = row.leftBlockId ? leftMap.get(row.leftBlockId) : undefined;
        const rb = row.rightBlockId ? rightMap.get(row.rightBlockId) : undefined;
        const result = await (0, analyze_1.analyzeSnippet)({
            compareId,
            rowId: row.rowId,
            kind: row.kind,
            beforeText: lb?.text ?? null,
            afterText: rb?.text ?? null,
            focusText,
            aiApiKey
        });
        res.json(result);
    }
    catch (e) {
        res.status(500).send(e?.message ?? String(e));
    }
});
app.post("/api/compare/:compareId/ai/snippet", async (req, res) => {
    try {
        const compareId = req.params.compareId;
        const rowId = String(req.body?.rowId ?? "").trim();
        const focusText = typeof req.body?.focusText === "string" ? req.body.focusText : null;
        const aiApiKey = typeof req.body?.aiApiKey === "string" ? req.body.aiApiKey : null;
        if (!rowId)
            return res.status(400).send("missing rowId");
        const artifacts = await (0, storage_1.ensureArtifacts)(compareId);
        if (!(await (0, storage_1.fileExists)(artifacts.jsonPath)))
            return res.status(404).send("not found");
        const json = await (0, storage_1.readJson)(artifacts.jsonPath);
        const row = (json.diff?.rows ?? []).find((r) => r.rowId === rowId);
        if (!row)
            return res.status(404).send("row not found");
        if (row.kind !== "modified" && row.kind !== "inserted" && row.kind !== "deleted")
            return res.status(400).send("row kind not supported");
        const leftMap = new Map((json.diff?.leftBlocks ?? []).map((b) => [b.blockId, b]));
        const rightMap = new Map((json.diff?.rightBlocks ?? []).map((b) => [b.blockId, b]));
        const lb = row.leftBlockId ? leftMap.get(row.leftBlockId) : undefined;
        const rb = row.rightBlockId ? rightMap.get(row.rightBlockId) : undefined;
        const result = await (0, analyze_1.analyzeSnippet)({
            compareId,
            rowId,
            kind: row.kind,
            beforeText: lb?.text ?? null,
            afterText: rb?.text ?? null,
            focusText,
            aiApiKey
        });
        res.json(result);
    }
    catch (e) {
        res.status(500).send(e?.message ?? String(e));
    }
});
app.post("/api/compare/:compareId/export/pdf", async (req, res) => {
    try {
        const compareId = req.params.compareId;
        const artifacts = await (0, storage_1.ensureArtifacts)(compareId);
        if (!(await (0, storage_1.fileExists)(artifacts.jsonPath)))
            return res.status(404).send("not found");
        const json = await (0, storage_1.readJson)(artifacts.jsonPath);
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
        const exportJobId = `${compareId}__exportPdf`;
        await queue_1.aiQueue.add("exportPdf", { compareId }, { jobId: exportJobId, attempts: 3, backoff: { type: "exponential", delay: 2_000 } });
        json.export.pdf.status = "pending";
        json.export.pdf.jobId = exportJobId;
        json.export.pdf.error = null;
        await (0, storage_1.writeJson)(artifacts.jsonPath, json);
        res.status(202).json({ compareId, status: "pending", jobId: exportJobId, url: null });
    }
    catch (e) {
        res.status(500).send(e?.message ?? String(e));
    }
});
app.get("/api/ai/jobs/:jobId", async (req, res) => {
    try {
        const jobId = req.params.jobId;
        const compareId = String(req.query.compareId ?? "");
        if (compareId) {
            const artifacts = await (0, storage_1.ensureArtifacts)(compareId);
            if (await (0, storage_1.fileExists)(artifacts.jsonPath)) {
                const json = await (0, storage_1.readJson)(artifacts.jsonPath);
                const ai = (json.ai ??= { mode: "async", status: "pending", jobId: null, result: null, error: null });
                const isTerminal = ai.status === "done" || ai.status === "failed" || ai.status === "cancelled";
                if (!isTerminal) {
                    const job = await queue_1.aiQueue.getJob(jobId);
                    if (job) {
                        const state = await job.getState();
                        if (state === "failed") {
                            ai.status = "failed";
                            ai.error = job.failedReason ?? "failed";
                            await (0, storage_1.writeJson)(artifacts.jsonPath, json);
                        }
                    }
                }
                return res.json({ jobId, status: ai.status, result: ai.result, error: ai.error });
            }
        }
        const job = await queue_1.aiQueue.getJob(jobId);
        if (!job)
            return res.status(404).send("not found");
        const state = await job.getState();
        res.json({ jobId, status: state });
    }
    catch (e) {
        res.status(500).send(e?.message ?? String(e));
    }
});
const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => { });
function summarizeRows(rows) {
    let matched = 0;
    let modified = 0;
    let inserted = 0;
    let deleted = 0;
    for (const r of rows) {
        if (r.kind === "matched")
            matched++;
        if (r.kind === "modified")
            modified++;
        if (r.kind === "inserted")
            inserted++;
        if (r.kind === "deleted")
            deleted++;
    }
    return { rows: rows.length, matched, modified, inserted, deleted };
}
function sha256(buf) {
    return node_crypto_1.default.createHash("sha256").update(buf).digest("hex");
}
function parsePositiveInt(s) {
    const n = Number.parseInt(s, 10);
    if (!Number.isFinite(n))
        return null;
    if (n <= 0)
        return null;
    return n;
}
async function fsWrite(filePath, content) {
    const fs = await Promise.resolve().then(() => __importStar(require("node:fs/promises")));
    await fs.writeFile(filePath, content, "utf8");
}
function extractBody(html) {
    const m = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
    if (!m)
        return html;
    return m[1];
}
async function bufferToSafeHtml(params) {
    const mt = String(params.mimeType ?? "").toLowerCase();
    const ext = String(params.fileName ?? "").toLowerCase();
    if (mt.includes("pdf") || ext.endsWith(".pdf"))
        return (0, pdfInput_1.pdfBufferToSafeHtml)(params.buffer);
    if (mt.includes("wordprocessingml") || mt.includes("msword") || ext.endsWith(".docx"))
        return (0, docx_1.docxBufferToSafeHtml)(params.buffer);
    throw new Error(`Unsupported file type: ${params.mimeType} (${params.fileName})`);
}

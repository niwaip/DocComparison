"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeRisks = analyzeRisks;
exports.analyzeSnippet = analyzeSnippet;
const heuristic_1 = require("./heuristic");
const openai_1 = require("./openai");
const env_1 = require("../env");
const text_1 = require("../text");
async function analyzeRisks(params) {
    const cfg = (0, openai_1.getLlmConfig)();
    const firstLevelSectionLabel = (beforeText, afterText) => {
        const sample = (0, text_1.normalizeText)(afterText ?? beforeText ?? "");
        const label = (0, text_1.getLeadingSectionLabel)(sample);
        if (!label)
            return "unknown";
        if (/^\d+(?:\.\d+)*$/.test(label))
            return label.split(".")[0] ?? label;
        return label;
    };
    const llmMaxTextLen = (() => {
        const raw = (0, env_1.envOptional)("LLM_MAX_TEXT_LEN");
        if (!raw)
            return 420;
        const n = Number.parseInt(raw, 10);
        if (!Number.isFinite(n) || n <= 60)
            return 420;
        return Math.max(60, Math.min(1600, n));
    })();
    const compact = (s) => {
        const x = (0, text_1.normalizeText)(s ?? "");
        const y = x.length > llmMaxTextLen ? x.slice(0, llmMaxTextLen) : x;
        return y;
    };
    const withSection = params.rows
        .map((r) => {
        const sectionLabel = firstLevelSectionLabel(r.beforeText, r.afterText);
        const before = compact(r.beforeText);
        const after = compact(r.afterText);
        const keyBefore = (0, text_1.stripSectionNoise)(before).toLowerCase();
        const keyAfter = (0, text_1.stripSectionNoise)(after).toLowerCase();
        const hasText = Boolean((keyBefore + keyAfter).trim());
        return { ...r, sectionLabel, beforeText: before || null, afterText: after || null, hasText };
    })
        .filter((x) => x.hasText);
    const sectionLabels = Array.from(new Set(withSection.map((x) => x.sectionLabel))).filter(Boolean);
    const sectionMaxChanges = (() => {
        const raw = (0, env_1.envOptional)("LLM_SECTION_MAX_CHANGES");
        if (!raw)
            return 60;
        const n = Number.parseInt(raw, 10);
        if (!Number.isFinite(n) || n <= 0)
            return 60;
        return Math.max(10, Math.min(200, n));
    })();
    if (!cfg) {
        const overall = {
            summary: `共检测到 ${withSection.length} 处变更，覆盖 ${sectionLabels.length} 个一级章节。建议优先复核：责任、付款、终止、争议解决、数据合规等高风险条款。`,
            keyRisks: [],
            suggestions: ["先通读变更汇总，再逐章核对关键条款与定义", "对涉及金额/期限/责任上限/争议管辖的变更做重点标注与复核"],
            changedSectionLabels: sectionLabels
        };
        const sections = sectionLabels.map((label) => {
            const items = withSection.filter((x) => x.sectionLabel === label);
            const relatedRowIds = items.slice(0, sectionMaxChanges).map((x) => x.rowId);
            const relatedBlockIds = items.slice(0, sectionMaxChanges).map((x) => x.blockId);
            return {
                sectionLabel: label,
                summary: `该一级章节共 ${items.length} 处变更，建议按条款逐项复核。`,
                keyRisks: [],
                suggestions: ["核对变更是否影响权利义务边界、触发条件与责任承担"],
                relatedRowIds,
                relatedBlockIds
            };
        });
        return { schemaVersion: "2", compareId: params.compareId, overall, sections, meta: { provider: "heuristic" } };
    }
    const minIntervalMs = (() => {
        const raw = (0, env_1.envOptional)("LLM_MIN_INTERVAL_MS");
        if (!raw)
            return 900;
        const n = Number.parseInt(raw, 10);
        if (!Number.isFinite(n) || n < 0)
            return 900;
        return Math.max(0, Math.min(30_000, n));
    })();
    const maxRetries = (() => {
        const raw = (0, env_1.envOptional)("LLM_MAX_RETRIES");
        if (!raw)
            return 4;
        const n = Number.parseInt(raw, 10);
        if (!Number.isFinite(n) || n < 0)
            return 4;
        return Math.max(0, Math.min(10, n));
    })();
    const baseBackoffMs = (() => {
        const raw = (0, env_1.envOptional)("LLM_RETRY_BASE_MS");
        if (!raw)
            return 800;
        const n = Number.parseInt(raw, 10);
        if (!Number.isFinite(n) || n <= 0)
            return 800;
        return Math.max(200, Math.min(15_000, n));
    })();
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let lastCallAt = 0;
    const callJsonControlled = async (system, user) => {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const now = Date.now();
            const waitMs = minIntervalMs - (now - lastCallAt);
            if (waitMs > 0)
                await sleep(waitMs);
            try {
                lastCallAt = Date.now();
                return await (0, openai_1.callLlmJson)({ cfg, system, user });
            }
            catch (e) {
                const msg = String(e?.message ?? e ?? "");
                const is429 = /\b429\b/.test(msg) || /rate\s*limit/i.test(msg) || /too\s*many\s*requests/i.test(msg);
                if (!is429 || attempt >= maxRetries)
                    throw e;
                const backoff = Math.min(20_000, baseBackoffMs * Math.pow(2, attempt));
                const jitter = Math.floor(Math.random() * 250);
                await sleep(backoff + jitter);
            }
        }
        throw new Error("LLM retry exhausted");
    };
    const parseNumLabel = (label) => {
        const m = /^\d+$/.exec(String(label ?? "").trim());
        if (!m)
            return null;
        const n = Number.parseInt(m[0], 10);
        if (!Number.isFinite(n))
            return null;
        return n;
    };
    const orderedSectionLabels = [...sectionLabels].sort((a, b) => {
        const na = parseNumLabel(a);
        const nb = parseNumLabel(b);
        if (na !== null && nb !== null)
            return na - nb;
        if (na !== null)
            return -1;
        if (nb !== null)
            return 1;
        return String(a).localeCompare(String(b), "zh-Hans-CN");
    });
    const sectionMap = new Map();
    for (const label of orderedSectionLabels)
        sectionMap.set(label, []);
    for (const it of withSection) {
        const arr = sectionMap.get(it.sectionLabel) ?? [];
        arr.push(it);
        sectionMap.set(it.sectionLabel, arr);
    }
    const totalSteps = 1 + orderedSectionLabels.length;
    let completedSteps = 0;
    const heuristicOverall = {
        summary: `共检测到 ${withSection.length} 处变更，覆盖 ${sectionLabels.length} 个一级章节。建议优先复核：责任、付款、终止、争议解决、数据合规等高风险条款。`,
        keyRisks: [],
        suggestions: ["先通读变更汇总，再逐章核对关键条款与定义", "对涉及金额/期限/责任上限/争议管辖的变更做重点标注与复核"],
        changedSectionLabels: sectionLabels
    };
    const overallSystem = [
        "你是一名资深法务审核助手。你将生成一份“合同变更评估报告”的整体说明与建议。",
        "请严格输出 JSON，不要 markdown，不要多余字段。",
        "schemaVersion 固定为 2。",
        "overall.summary 请用类似：'总体评估：...\\n\\n核心建议：...' 的格式。",
        "overall.keyRisks 输出 3-8 条最重要的风险点。",
        "overall.suggestions 输出 3-8 条可执行建议。",
        "overall.changedSectionLabels 必须与输入一致（可排序，但不要新增/删除）。"
    ].join("\n");
    const overallMaxChanges = (() => {
        const raw = (0, env_1.envOptional)("LLM_OVERALL_MAX_CHANGES");
        if (!raw)
            return 80;
        const n = Number.parseInt(raw, 10);
        if (!Number.isFinite(n) || n <= 0)
            return 80;
        return Math.max(10, Math.min(240, n));
    })();
    const overallUser = JSON.stringify({
        schemaVersion: "2",
        compareId: params.compareId,
        changedSectionLabels: orderedSectionLabels,
        changes: withSection.slice(0, overallMaxChanges).map((x) => ({
            rowId: x.rowId,
            blockId: x.blockId,
            kind: x.kind,
            sectionLabel: x.sectionLabel,
            beforeText: x.beforeText,
            afterText: x.afterText
        }))
    }, null, 2);
    let succeededCalls = 0;
    let overall = { ...heuristicOverall, changedSectionLabels: orderedSectionLabels };
    try {
        const overallRaw = await callJsonControlled(overallSystem, overallUser);
        const overallAny = overallRaw?.overall && typeof overallRaw?.overall === "object" ? overallRaw.overall : overallRaw;
        overall = {
            summary: String(overallAny?.summary ?? ""),
            keyRisks: Array.isArray(overallAny?.keyRisks) ? overallAny.keyRisks.map((x) => String(x)) : [],
            suggestions: Array.isArray(overallAny?.suggestions) ? overallAny.suggestions.map((x) => String(x)) : [],
            changedSectionLabels: Array.isArray(overallAny?.changedSectionLabels)
                ? overallAny.changedSectionLabels.map((x) => String(x))
                : orderedSectionLabels
        };
        succeededCalls++;
    }
    catch { }
    completedSteps++;
    if (params.onProgress)
        await params.onProgress({ completed: completedSteps, total: totalSteps, phase: "overall" });
    if (!overall.summary.trim())
        overall.summary = heuristicOverall.summary;
    if (overall.suggestions.length === 0)
        overall.suggestions = heuristicOverall.suggestions;
    const sectionSystem = [
        "你是一名资深法务审核助手。你将针对一个“一级章节”的变更生成评估与建议。",
        "请严格输出 JSON，不要 markdown，不要多余字段。",
        "输出必须是一个对象，字段：sectionLabel,summary,keyRisks,suggestions,relatedRowIds,relatedBlockIds。",
        "summary 请用类似：'摘要：...\\n评估：...\\n建议：...' 的结构。",
        "relatedRowIds/relatedBlockIds 只能从输入 changes 中选择，不要编造。"
    ].join("\n");
    const sections = [];
    for (const label of orderedSectionLabels) {
        const items = sectionMap.get(label) ?? [];
        const take = items.slice(0, sectionMaxChanges).map((x) => ({
            rowId: x.rowId,
            blockId: x.blockId,
            kind: x.kind,
            beforeText: x.beforeText,
            afterText: x.afterText
        }));
        if (take.length === 0) {
            sections.push({
                sectionLabel: label,
                summary: "",
                keyRisks: [],
                suggestions: [],
                relatedRowIds: [],
                relatedBlockIds: []
            });
            completedSteps++;
            if (params.onProgress)
                await params.onProgress({ completed: completedSteps, total: totalSteps, phase: "section", sectionLabel: label });
            continue;
        }
        const sectionUser = JSON.stringify({
            compareId: params.compareId,
            sectionLabel: label,
            changes: take
        }, null, 2);
        try {
            const raw = await callJsonControlled(sectionSystem, sectionUser);
            const section = {
                sectionLabel: String(raw?.sectionLabel ?? label),
                summary: String(raw?.summary ?? ""),
                keyRisks: Array.isArray(raw?.keyRisks) ? raw.keyRisks.map((x) => String(x)) : [],
                suggestions: Array.isArray(raw?.suggestions) ? raw.suggestions.map((x) => String(x)) : [],
                relatedRowIds: Array.isArray(raw?.relatedRowIds) ? raw.relatedRowIds.map((x) => String(x)) : take.map((x) => x.rowId),
                relatedBlockIds: Array.isArray(raw?.relatedBlockIds) ? raw?.relatedBlockIds.map((x) => String(x)) : take.map((x) => x.blockId)
            };
            if (!section.summary.trim() && section.keyRisks.length === 0 && section.suggestions.length === 0) {
                section.summary = `该一级章节共 ${items.length} 处变更，建议按条款逐项复核。`;
                section.suggestions = ["核对变更是否影响权利义务边界、触发条件与责任承担"];
            }
            sections.push(section);
            succeededCalls++;
        }
        catch {
            sections.push({
                sectionLabel: label,
                summary: `该一级章节共 ${items.length} 处变更，建议按条款逐项复核。`,
                keyRisks: [],
                suggestions: ["核对变更是否影响权利义务边界、触发条件与责任承担"],
                relatedRowIds: items.slice(0, sectionMaxChanges).map((x) => x.rowId),
                relatedBlockIds: items.slice(0, sectionMaxChanges).map((x) => x.blockId)
            });
        }
        completedSteps++;
        if (params.onProgress)
            await params.onProgress({ completed: completedSteps, total: totalSteps, phase: "section", sectionLabel: label });
    }
    const providerMeta = succeededCalls > 0 ? cfg.provider : "heuristic";
    return {
        schemaVersion: "2",
        compareId: params.compareId,
        overall,
        sections,
        meta: providerMeta === "heuristic" ? { provider: "heuristic" } : { provider: cfg.provider, model: cfg.model }
    };
}
async function analyzeSnippet(params) {
    const overrideKey = typeof params.aiApiKey === "string" ? params.aiApiKey.trim() : "";
    const cfg = (0, openai_1.getLlmConfig)() ??
        (overrideKey
            ? {
                provider: "siliconflow",
                apiKey: overrideKey,
                model: (0, env_1.envOptional)("SILICONFLOW_MODEL") ?? "Qwen/Qwen2.5-72B-Instruct",
                baseUrl: (0, env_1.envOptional)("SILICONFLOW_BASE_URL") ?? "https://api.siliconflow.cn/v1"
            }
            : null);
    const before = (0, text_1.normalizeText)(params.beforeText ?? "");
    const after = (0, text_1.normalizeText)(params.afterText ?? "");
    const focus = (0, text_1.normalizeText)(params.focusText ?? "");
    if (!cfg) {
        const h = (0, heuristic_1.analyzeRiskHeuristic)({
            blockId: `row:${params.rowId}`,
            beforeText: before || null,
            afterText: after || null,
            blockSelector: ""
        });
        return {
            schemaVersion: "1",
            compareId: params.compareId,
            rowId: params.rowId,
            summary: h?.summary ?? "建议人工复核该处变更。",
            keyPoints: [],
            risks: h ? [h.analysis] : [],
            suggestions: h?.recommendations ?? [],
            meta: { provider: "heuristic" }
        };
    }
    const system = [
        "你是资深法务审核助手。请对选定条款的差异进行快速解析，并输出 JSON。",
        "输出必须是严格 JSON，不要 markdown，不要多余字段。",
        "schemaVersion 固定为 1。",
        "输出字段：schemaVersion,compareId,rowId,summary,keyPoints,risks,suggestions。"
    ].join("\n");
    const user = JSON.stringify({
        schemaVersion: "1",
        compareId: params.compareId,
        rowId: params.rowId,
        kind: params.kind,
        focusText: focus || null,
        beforeText: before || null,
        afterText: after || null
    }, null, 2);
    try {
        const raw = await (0, openai_1.callLlmJson)({ cfg, system, user });
        return {
            schemaVersion: "1",
            compareId: params.compareId,
            rowId: params.rowId,
            summary: String(raw?.summary ?? ""),
            keyPoints: Array.isArray(raw?.keyPoints) ? raw.keyPoints.map((x) => String(x)) : [],
            risks: Array.isArray(raw?.risks) ? raw.risks.map((x) => String(x)) : [],
            suggestions: Array.isArray(raw?.suggestions) ? raw.suggestions.map((x) => String(x)) : [],
            meta: { provider: cfg.provider, model: cfg.model }
        };
    }
    catch {
        const h = (0, heuristic_1.analyzeRiskHeuristic)({
            blockId: `row:${params.rowId}`,
            beforeText: before || null,
            afterText: after || null,
            blockSelector: ""
        });
        return {
            schemaVersion: "1",
            compareId: params.compareId,
            rowId: params.rowId,
            summary: h?.summary ?? "建议人工复核该处变更。",
            keyPoints: [],
            risks: h ? [h.analysis] : [],
            suggestions: h?.recommendations ?? [],
            meta: { provider: "heuristic" }
        };
    }
}

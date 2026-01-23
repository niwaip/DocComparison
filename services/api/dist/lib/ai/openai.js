"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLlmConfig = getLlmConfig;
exports.callLlmJson = callLlmJson;
exports.getOpenAiConfig = getOpenAiConfig;
exports.callOpenAiJson = callOpenAiJson;
const env_1 = require("../env");
function getLlmConfig() {
    const providerRaw = ((0, env_1.envOptional)("LLM_PROVIDER") ?? "").trim().toLowerCase();
    const sfKey = (0, env_1.envOptional)("SILICONFLOW_API_KEY");
    const oaKey = (0, env_1.envOptional)("OPENAI_API_KEY");
    const oaBaseUrl = ((0, env_1.envOptional)("OPENAI_BASE_URL") ?? "").trim();
    const provider = providerRaw === "siliconflow" || providerRaw === "openai" ? providerRaw : "";
    if (provider === "siliconflow" || (!provider && sfKey)) {
        if (!sfKey)
            return null;
        const model = (0, env_1.envOptional)("SILICONFLOW_MODEL") ?? "Qwen/Qwen2.5-72B-Instruct";
        const baseUrl = (0, env_1.envOptional)("SILICONFLOW_BASE_URL") ?? "https://api.siliconflow.cn/v1";
        return { provider: "siliconflow", apiKey: sfKey, model, baseUrl };
    }
    if (provider === "openai" || (!provider && oaKey)) {
        if (!oaKey)
            return null;
        const model = (0, env_1.envOptional)("OPENAI_MODEL") ?? "gpt-4.1-mini";
        return { provider: "openai", apiKey: oaKey, model, baseUrl: oaBaseUrl || undefined };
    }
    return null;
}
async function callLlmJson(params) {
    const timeoutMs = (() => {
        const raw = ((0, env_1.envOptional)("LLM_HTTP_TIMEOUT_MS") ?? "").trim();
        if (!raw)
            return 90_000;
        const n = Number.parseInt(raw, 10);
        if (!Number.isFinite(n) || n <= 0)
            return 90_000;
        return Math.max(5_000, Math.min(240_000, n));
    })();
    const fetchWithTimeout = async (url, init) => {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(url, { ...init, signal: controller.signal });
        }
        finally {
            clearTimeout(t);
        }
    };
    const parseModelJson = (rawText) => {
        const stripFences = (s) => {
            const t = s.trim();
            const m = /^```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n```$/.exec(t);
            return (m ? m[1] : t).trim();
        };
        const extractFirstJson = (s) => {
            const text = s.trim();
            const startObj = text.indexOf("{");
            const startArr = text.indexOf("[");
            const start = startObj === -1 ? startArr : startArr === -1 ? startObj : Math.min(startObj, startArr);
            if (start === -1)
                return null;
            const open = text[start];
            const close = open === "{" ? "}" : "]";
            let depth = 0;
            let inString = false;
            let escaping = false;
            for (let i = start; i < text.length; i++) {
                const ch = text[i];
                if (inString) {
                    if (escaping) {
                        escaping = false;
                        continue;
                    }
                    if (ch === "\\") {
                        escaping = true;
                        continue;
                    }
                    if (ch === "\"")
                        inString = false;
                    continue;
                }
                if (ch === "\"") {
                    inString = true;
                    continue;
                }
                if (ch === open)
                    depth++;
                if (ch === close)
                    depth--;
                if (depth === 0)
                    return text.slice(start, i + 1);
            }
            return null;
        };
        const text = stripFences(rawText);
        try {
            return JSON.parse(text);
        }
        catch { }
        const extracted = extractFirstJson(text);
        if (extracted) {
            try {
                return JSON.parse(extracted);
            }
            catch { }
        }
        const head = text.slice(0, 500).replace(/\s+/g, " ").trim();
        throw new Error(`LLM returned non-JSON output: ${head}`);
    };
    if (params.cfg.provider === "openai") {
        const baseUrl = (params.cfg.baseUrl ?? "").trim().replace(/\/+$/, "");
        const apiStyleRaw = ((0, env_1.envOptional)("OPENAI_API_STYLE") ?? "").trim().toLowerCase();
        const apiStyle = apiStyleRaw === "responses" || apiStyleRaw === "chat" || apiStyleRaw === "chat_completions"
            ? apiStyleRaw
            : "";
        if (baseUrl && (apiStyle === "chat" || apiStyle === "chat_completions" || (!apiStyle && !/api\.openai\.com/i.test(baseUrl)))) {
            const res = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${params.cfg.apiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: params.cfg.model,
                    messages: [
                        { role: "system", content: params.system },
                        { role: "user", content: params.user }
                    ],
                    response_format: { type: "json_object" },
                    temperature: 0.2
                })
            });
            if (!res.ok) {
                const t = await res.text();
                throw new Error(`OpenAI-compatible error: ${res.status} ${t}`);
            }
            const json = await res.json();
            const text = String(json?.choices?.[0]?.message?.content ?? "").trim();
            if (!text)
                throw new Error("OpenAI-compatible returned empty message.content");
            return parseModelJson(text);
        }
        const endpoint = baseUrl ? `${baseUrl}/responses` : "https://api.openai.com/v1/responses";
        const res = await fetchWithTimeout(endpoint, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${params.cfg.apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: params.cfg.model,
                input: [
                    { role: "system", content: params.system },
                    { role: "user", content: params.user }
                ],
                response_format: { type: "json_object" },
                temperature: 0.2
            })
        });
        if (!res.ok) {
            const t = await res.text();
            throw new Error(`OpenAI error: ${res.status} ${t}`);
        }
        const json = await res.json();
        const text = String(json?.output_text ?? "").trim();
        if (!text)
            throw new Error("OpenAI returned empty output_text");
        return parseModelJson(text);
    }
    const baseUrl = (params.cfg.baseUrl ?? "https://api.siliconflow.cn/v1").replace(/\/+$/, "");
    const res = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${params.cfg.apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: params.cfg.model,
            messages: [
                { role: "system", content: params.system },
                { role: "user", content: params.user }
            ],
            response_format: { type: "json_object" },
            temperature: 0.2
        })
    });
    if (!res.ok) {
        const t = await res.text();
        throw new Error(`SiliconFlow error: ${res.status} ${t}`);
    }
    const json = await res.json();
    const text = String(json?.choices?.[0]?.message?.content ?? "").trim();
    if (!text)
        throw new Error("SiliconFlow returned empty message.content");
    return parseModelJson(text);
}
function getOpenAiConfig() {
    const cfg = getLlmConfig();
    if (!cfg || cfg.provider !== "openai")
        return null;
    return { apiKey: cfg.apiKey, model: cfg.model };
}
async function callOpenAiJson(params) {
    return callLlmJson({ cfg: { provider: "openai", apiKey: params.apiKey, model: params.model }, system: params.system, user: params.user });
}

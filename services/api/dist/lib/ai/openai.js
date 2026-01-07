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
        return { provider: "openai", apiKey: oaKey, model };
    }
    return null;
}
async function callLlmJson(params) {
    if (params.cfg.provider === "openai") {
        const res = await fetch("https://api.openai.com/v1/responses", {
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
        return JSON.parse(text);
    }
    const baseUrl = (params.cfg.baseUrl ?? "https://api.siliconflow.cn/v1").replace(/\/+$/, "");
    const res = await fetch(`${baseUrl}/chat/completions`, {
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
    return JSON.parse(text);
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

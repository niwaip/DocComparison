import fs from "node:fs";
import { envOptional } from "../env";

export type LlmProvider = "openai" | "siliconflow";

export type LlmConfig = {
  provider: LlmProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
};

export function getLlmConfig(): LlmConfig | null {
  const normalizeEnvText = (s: string | undefined | null): string => {
    const t = String(s ?? "").trim();
    if (!t) return "";
    const m = /^([`'"])([\s\S]*)\1$/.exec(t);
    return (m ? m[2] : t).trim();
  };

  const providerRaw = (envOptional("LLM_PROVIDER") ?? "").trim().toLowerCase();
  const sfKey = envOptional("SILICONFLOW_API_KEY");
  const oaKey = envOptional("OPENAI_API_KEY");
  const oaBaseUrl = normalizeEnvText(envOptional("OPENAI_BASE_URL"));

  const provider: LlmProvider | "" =
    providerRaw === "siliconflow" || providerRaw === "openai" ? (providerRaw as LlmProvider) : "";

  if (provider === "siliconflow" || (!provider && sfKey)) {
    if (!sfKey) return null;
    const model = envOptional("SILICONFLOW_MODEL") ?? "Qwen/Qwen2.5-72B-Instruct";
    const baseUrl = normalizeEnvText(envOptional("SILICONFLOW_BASE_URL")) || "https://api.siliconflow.cn/v1";
    return { provider: "siliconflow", apiKey: sfKey, model, baseUrl };
  }

  if (provider === "openai" || (!provider && oaKey)) {
    if (!oaKey && !oaBaseUrl) return null;
    const model = envOptional("OPENAI_MODEL") ?? "gpt-4.1-mini";
    return { provider: "openai", apiKey: oaKey ?? "", model, baseUrl: oaBaseUrl || undefined };
  }

  return null;
}

export async function callLlmJson(params: {
  cfg: LlmConfig;
  system: string;
  user: string;
}): Promise<unknown> {
  const debug = (() => {
    const raw = String(envOptional("LLM_DEBUG") ?? "").trim().toLowerCase();
    return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
  })();

  const inDocker = (() => {
    try {
      return fs.existsSync("/.dockerenv");
    } catch {
      return false;
    }
  })();

  const truncate = (s: string, max: number) => {
    const t = String(s ?? "");
    if (t.length <= max) return t;
    return `${t.slice(0, Math.max(0, max - 12))}…(truncated)`;
  };

  const safeJsonPreview = (x: unknown, max = 1800) => {
    try {
      return truncate(JSON.stringify(x), max);
    } catch {
      return truncate(String(x ?? ""), max);
    }
  };

  const rewriteBaseUrlForDocker = (raw: string): string => {
    const t = String(raw ?? "").trim();
    if (!t || !inDocker) return t;
    try {
      const u = new URL(t);
      if (u.hostname === "localhost" || u.hostname === "127.0.0.1") u.hostname = "host.docker.internal";
      return u.toString().replace(/\/+$/, "");
    } catch {
      return t;
    }
  };

  const timeoutMs = (() => {
    const raw = (envOptional("LLM_HTTP_TIMEOUT_MS") ?? "").trim();
    if (!raw) return 90_000;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) return 90_000;
    return Math.max(5_000, Math.min(240_000, n));
  })();

  const fetchWithTimeout = async (url: string, init: RequestInit): Promise<Response> => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(t);
    }
  };

  const fetchWithTimeoutDetailed = async (url: string, init: RequestInit): Promise<Response> => {
    try {
      return await fetchWithTimeout(url, init);
    } catch (e: any) {
      const msg = String(e?.message ?? e ?? "");
      const name = String(e?.name ?? "");
      const reason = name ? `${name}: ${msg}` : msg;
      const err = new Error(`LLM HTTP request failed (${url}): ${reason}`);
      if (debug) console.error("[llm] fetch failed", { url, method: init.method, timeoutMs, reason });
      throw err;
    }
  };

  const parseModelJson = (rawText: string): unknown => {
    const stripFences = (s: string): string => {
      const t = s.trim();
      const m = /^```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n```$/.exec(t);
      return (m ? m[1] : t).trim();
    };

    const extractFirstJson = (s: string): string | null => {
      const text = s.trim();
      const startObj = text.indexOf("{");
      const startArr = text.indexOf("[");
      const start =
        startObj === -1 ? startArr : startArr === -1 ? startObj : Math.min(startObj, startArr);
      if (start === -1) return null;
      const open = text[start];
      const close = open === "{" ? "}" : "]";
      let depth = 0;
      let inString = false;
      let escaping = false;
      for (let i = start; i < text.length; i++) {
        const ch = text[i]!;
        if (inString) {
          if (escaping) {
            escaping = false;
            continue;
          }
          if (ch === "\\") {
            escaping = true;
            continue;
          }
          if (ch === "\"") inString = false;
          continue;
        }
        if (ch === "\"") {
          inString = true;
          continue;
        }
        if (ch === open) depth++;
        if (ch === close) depth--;
        if (depth === 0) return text.slice(start, i + 1);
      }
      return null;
    };

    const text = stripFences(rawText);
    try {
      return JSON.parse(text);
    } catch {}

    const extracted = extractFirstJson(text);
    if (extracted) {
      try {
        return JSON.parse(extracted);
      } catch {}
    }

    const head = text.slice(0, 500).replace(/\s+/g, " ").trim();
    throw new Error(`LLM returned non-JSON output: ${head}`);
  };

  const authHeaders = (apiKey: string): Record<string, string> => {
    const k = String(apiKey ?? "").trim();
    return k ? { Authorization: `Bearer ${k}` } : {};
  };

  const extractChatContent = (json: any): unknown => {
    const c0 = json?.choices?.[0];
    const v = c0?.message?.content ?? c0?.delta?.content ?? c0?.text ?? null;
    if (v && typeof v === "object" && !Array.isArray(v)) return v;
    if (Array.isArray(v)) {
      const parts = v
        .map((p: any) => {
          if (typeof p === "string") return p;
          if (p && typeof p === "object") {
            if (typeof p.text === "string") return p.text;
            if (p.type === "text" && typeof p?.text === "string") return p.text;
            if (typeof p?.content === "string") return p.content;
          }
          return "";
        })
        .join("");
      return parts;
    }
    if (typeof v === "string") return v;
    if (typeof c0?.message === "string") return c0.message;
    return "";
  };

  if (params.cfg.provider === "openai") {
    const baseUrl = rewriteBaseUrlForDocker((params.cfg.baseUrl ?? "").trim()).replace(/\/+$/, "");
    const apiStyleRaw = (envOptional("OPENAI_API_STYLE") ?? "").trim().toLowerCase();
    const apiStyle =
      apiStyleRaw === "responses" || apiStyleRaw === "chat" || apiStyleRaw === "chat_completions"
        ? apiStyleRaw
        : "";

    if (baseUrl && (apiStyle === "chat" || apiStyle === "chat_completions" || (!apiStyle && !/api\.openai\.com/i.test(baseUrl)))) {
      const url = `${baseUrl}/chat/completions`;
      if (debug) console.log("[llm] request", { provider: "openai-compatible", url, model: params.cfg.model, timeoutMs });
      const res = await fetchWithTimeoutDetailed(url, {
        method: "POST",
        headers: {
          ...authHeaders(params.cfg.apiKey),
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
        const preview = truncate(t, 2000);
        console.error("[llm] response not ok", { provider: "openai-compatible", url, status: res.status, bodyPreview: preview });
        throw new Error(`OpenAI-compatible error (${url}): ${res.status} ${preview}`);
      }
      const json: any = await res.json();
      const content = extractChatContent(json);
      if (content && typeof content === "object") return content;
      const text = String(content ?? "").trim();
      if (!text) {
        const preview = safeJsonPreview(json);
        console.error("[llm] empty chat content", { provider: "openai-compatible", url, model: params.cfg.model, jsonPreview: preview });
        throw new Error(`OpenAI-compatible returned empty message.content (${url}). response=${preview}`);
      }
      try {
        return parseModelJson(text);
      } catch (e: any) {
        const head = truncate(text.replace(/\s+/g, " ").trim(), 900);
        const preview = safeJsonPreview(json, 900);
        throw new Error(`OpenAI-compatible returned non-JSON content (${url}). contentHead=${head} response=${preview}`);
      }
    }

    const endpoint = baseUrl ? `${baseUrl}/responses` : "https://api.openai.com/v1/responses";
    if (debug) console.log("[llm] request", { provider: "openai", url: endpoint, model: params.cfg.model, timeoutMs });
    const res = await fetchWithTimeoutDetailed(endpoint, {
      method: "POST",
      headers: {
        ...authHeaders(params.cfg.apiKey),
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
      const preview = truncate(t, 2000);
      console.error("[llm] response not ok", { provider: "openai", url: endpoint, status: res.status, bodyPreview: preview });
      throw new Error(`OpenAI error (${endpoint}): ${res.status} ${preview}`);
    }
    const json: any = await res.json();
    const outputText = String(json?.output_text ?? "").trim();
    const text = outputText;
    if (!text) {
      const preview = safeJsonPreview(json);
      console.error("[llm] empty output_text", { provider: "openai", url: endpoint, model: params.cfg.model, jsonPreview: preview });
      throw new Error(`OpenAI returned empty output_text (${endpoint}). response=${preview}`);
    }
    try {
      return parseModelJson(text);
    } catch {
      const head = truncate(text.replace(/\s+/g, " ").trim(), 900);
      const preview = safeJsonPreview(json, 900);
      throw new Error(`OpenAI returned non-JSON output_text (${endpoint}). contentHead=${head} response=${preview}`);
    }
  }

  const baseUrl = rewriteBaseUrlForDocker((params.cfg.baseUrl ?? "https://api.siliconflow.cn/v1")).replace(/\/+$/, "");
  const url = `${baseUrl}/chat/completions`;
  if (debug) console.log("[llm] request", { provider: "siliconflow", url, model: params.cfg.model, timeoutMs });
  const res = await fetchWithTimeoutDetailed(url, {
    method: "POST",
    headers: {
      ...authHeaders(params.cfg.apiKey),
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
    const preview = truncate(t, 2000);
    console.error("[llm] response not ok", { provider: "siliconflow", url, status: res.status, bodyPreview: preview });
    throw new Error(`SiliconFlow error (${url}): ${res.status} ${preview}`);
  }
  const json: any = await res.json();
  const content = extractChatContent(json);
  if (content && typeof content === "object") return content;
  const text = String(content ?? "").trim();
  if (!text) {
    const preview = safeJsonPreview(json);
    console.error("[llm] empty chat content", { provider: "siliconflow", url, model: params.cfg.model, jsonPreview: preview });
    throw new Error(`SiliconFlow returned empty message.content (${url}). response=${preview}`);
  }
  try {
    return parseModelJson(text);
  } catch {
    const head = truncate(text.replace(/\s+/g, " ").trim(), 900);
    const preview = safeJsonPreview(json, 900);
    throw new Error(`SiliconFlow returned non-JSON content (${url}). contentHead=${head} response=${preview}`);
  }
}

export type OpenAiConfig = {
  apiKey: string;
  model: string;
};

export function getOpenAiConfig(): OpenAiConfig | null {
  const cfg = getLlmConfig();
  if (!cfg || cfg.provider !== "openai") return null;
  return { apiKey: cfg.apiKey, model: cfg.model };
}

export async function callOpenAiJson(params: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
}): Promise<unknown> {
  return callLlmJson({ cfg: { provider: "openai", apiKey: params.apiKey, model: params.model }, system: params.system, user: params.user });
}

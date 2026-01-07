import { envOptional } from "../env";

export type LlmProvider = "openai" | "siliconflow";

export type LlmConfig = {
  provider: LlmProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
};

export function getLlmConfig(): LlmConfig | null {
  const providerRaw = (envOptional("LLM_PROVIDER") ?? "").trim().toLowerCase();
  const sfKey = envOptional("SILICONFLOW_API_KEY");
  const oaKey = envOptional("OPENAI_API_KEY");

  const provider: LlmProvider | "" =
    providerRaw === "siliconflow" || providerRaw === "openai" ? (providerRaw as LlmProvider) : "";

  if (provider === "siliconflow" || (!provider && sfKey)) {
    if (!sfKey) return null;
    const model = envOptional("SILICONFLOW_MODEL") ?? "Qwen/Qwen2.5-72B-Instruct";
    const baseUrl = envOptional("SILICONFLOW_BASE_URL") ?? "https://api.siliconflow.cn/v1";
    return { provider: "siliconflow", apiKey: sfKey, model, baseUrl };
  }

  if (provider === "openai" || (!provider && oaKey)) {
    if (!oaKey) return null;
    const model = envOptional("OPENAI_MODEL") ?? "gpt-4.1-mini";
    return { provider: "openai", apiKey: oaKey, model };
  }

  return null;
}

export async function callLlmJson(params: {
  cfg: LlmConfig;
  system: string;
  user: string;
}): Promise<unknown> {
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

  if (params.cfg.provider === "openai") {
    const res = await fetchWithTimeout("https://api.openai.com/v1/responses", {
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
    const json: any = await res.json();
    const text = String(json?.output_text ?? "").trim();
    if (!text) throw new Error("OpenAI returned empty output_text");
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
  const json: any = await res.json();
  const text = String(json?.choices?.[0]?.message?.content ?? "").trim();
  if (!text) throw new Error("SiliconFlow returned empty message.content");
  return parseModelJson(text);
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

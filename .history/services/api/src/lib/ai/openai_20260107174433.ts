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
    const json: any = await res.json();
    const text = String(json?.output_text ?? "").trim();
    if (!text) throw new Error("OpenAI returned empty output_text");
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
  const json: any = await res.json();
  const text = String(json?.choices?.[0]?.message?.content ?? "").trim();
  if (!text) throw new Error("SiliconFlow returned empty message.content");
  return JSON.parse(text);
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

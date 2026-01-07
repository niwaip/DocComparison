import { envOptional } from "../env";

export type OpenAiConfig = {
  apiKey: string;
  model: string;
};

export function getOpenAiConfig(): OpenAiConfig | null {
  const apiKey = envOptional("OPENAI_API_KEY");
  if (!apiKey) return null;
  const model = envOptional("OPENAI_MODEL") ?? "gpt-4.1-mini";
  return { apiKey, model };
}

export async function callOpenAiJson(params: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
}): Promise<unknown> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: params.model,
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

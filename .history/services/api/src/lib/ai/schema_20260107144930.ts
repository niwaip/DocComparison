import { RiskItemV1 } from "../types";

export type AiJobResult = {
  schemaVersion: "1";
  compareId: string;
  items: RiskItemV1[];
  meta: {
    provider: "heuristic" | "openai" | "siliconflow";
    model?: string;
  };
};

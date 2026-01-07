import { RiskItemV1 } from "../types";

export type AiJobResultV1 = {
  schemaVersion: "1";
  compareId: string;
  items: RiskItemV1[];
  meta: {
    provider: "heuristic" | "openai" | "siliconflow";
    model?: string;
  };
};

export type AiSectionReportV2 = {
  sectionLabel: string;
  summary: string;
  keyRisks: string[];
  suggestions: string[];
  relatedRowIds: string[];
  relatedBlockIds: string[];
};

export type AiJobResultV2 = {
  schemaVersion: "2";
  compareId: string;
  overall: {
    summary: string;
    keyRisks: string[];
    suggestions: string[];
    changedSectionLabels: string[];
  };
  sections: AiSectionReportV2[];
  meta: {
    provider: "heuristic" | "openai" | "siliconflow";
    model?: string;
  };
};

export type AiSnippetResultV1 = {
  schemaVersion: "1";
  compareId: string;
  rowId: string;
  summary: string;
  keyPoints: string[];
  risks: string[];
  suggestions: string[];
  meta: {
    provider: "heuristic" | "openai" | "siliconflow";
    model?: string;
  };
};

export type AiJobResult = AiJobResultV1 | AiJobResultV2;

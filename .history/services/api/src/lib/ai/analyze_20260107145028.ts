import { AiJobResult, AiJobResultV2, AiSnippetResultV1 } from "./schema";
import { analyzeRiskHeuristic } from "./heuristic";
import { callLlmJson, getLlmConfig } from "./openai";
import { getLeadingSectionLabel, normalizeText, stripSectionNoise } from "../text";

export async function analyzeRisks(params: {
  compareId: string;
  rows: Array<{
    rowId: string;
    kind: "modified" | "inserted" | "deleted";
    blockId: string;
    beforeText: string | null;
    afterText: string | null;
  }>;
}): Promise<AiJobResult> {
  const cfg = getLlmConfig();

  const firstLevelSectionLabel = (beforeText: string | null, afterText: string | null): string => {
    const sample = normalizeText(afterText ?? beforeText ?? "");
    const label = getLeadingSectionLabel(sample);
    if (!label) return "unknown";
    if (/^\d+(?:\.\d+)*$/.test(label)) return label.split(".")[0] ?? label;
    return label;
  };

  const compact = (s: string | null): string => {
    const x = normalizeText(s ?? "");
    const y = x.length > 800 ? x.slice(0, 800) : x;
    return y;
  };

  const withSection = params.rows
    .map((r) => {
      const sectionLabel = firstLevelSectionLabel(r.beforeText, r.afterText);
      const before = compact(r.beforeText);
      const after = compact(r.afterText);
      const keyBefore = stripSectionNoise(before).toLowerCase();
      const keyAfter = stripSectionNoise(after).toLowerCase();
      const hasText = Boolean((keyBefore + keyAfter).trim());
      return { ...r, sectionLabel, beforeText: before || null, afterText: after || null, hasText };
    })
    .filter((x) => x.hasText);

  const sectionLabels = Array.from(new Set(withSection.map((x) => x.sectionLabel))).filter(Boolean);

  if (!cfg) {
    const overall: AiJobResultV2["overall"] = {
      summary: `共检测到 ${withSection.length} 处变更，覆盖 ${sectionLabels.length} 个一级章节。建议优先复核：责任、付款、终止、争议解决、数据合规等高风险条款。`,
      keyRisks: [],
      suggestions: ["先通读变更汇总，再逐章核对关键条款与定义", "对涉及金额/期限/责任上限/争议管辖的变更做重点标注与复核"],
      changedSectionLabels: sectionLabels
    };
    const sections = sectionLabels.map((label) => {
      const items = withSection.filter((x) => x.sectionLabel === label);
      const relatedRowIds = items.slice(0, 60).map((x) => x.rowId);
      const relatedBlockIds = items.slice(0, 60).map((x) => x.blockId);
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

  const system = [
    "你是资深法务审核助手。请对文档变更进行整体与一级章节维度的风险分析，并输出 JSON。",
    "输出必须是严格 JSON，不要 markdown，不要多余字段。",
    "schemaVersion 固定为 2。",
    "整体分析输出 overall：summary/keyRisks/suggestions/changedSectionLabels。",
    "一级章节分析输出 sections 数组，每项含 sectionLabel/summary/keyRisks/suggestions/relatedRowIds/relatedBlockIds。",
    "relatedRowIds/relatedBlockIds 只能从输入中选择，不要编造 id。"
  ].join("\n");

  const user = JSON.stringify(
    {
      schemaVersion: "2",
      compareId: params.compareId,
      input: withSection
    },
    null,
    2
  );

  const raw = await callLlmJson({ cfg, system, user });

  return {
    schemaVersion: "2",
    compareId: params.compareId,
    overall: (raw as any)?.overall ?? { summary: "", keyRisks: [], suggestions: [], changedSectionLabels: [] },
    sections: (raw as any)?.sections ?? [],
    meta: { provider: cfg.provider, model: cfg.model }
  };
}

export async function analyzeSnippet(params: {
  compareId: string;
  rowId: string;
  kind: "modified" | "inserted" | "deleted";
  beforeText: string | null;
  afterText: string | null;
  focusText?: string | null;
}): Promise<AiSnippetResultV1> {
  const cfg = getLlmConfig();
  const before = normalizeText(params.beforeText ?? "");
  const after = normalizeText(params.afterText ?? "");
  const focus = normalizeText(params.focusText ?? "");

  if (!cfg) {
    const h = analyzeRiskHeuristic({
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

  const user = JSON.stringify(
    {
      schemaVersion: "1",
      compareId: params.compareId,
      rowId: params.rowId,
      kind: params.kind,
      focusText: focus || null,
      beforeText: before || null,
      afterText: after || null
    },
    null,
    2
  );

  const raw = await callLlmJson({ cfg, system, user });
  return {
    schemaVersion: "1",
    compareId: params.compareId,
    rowId: params.rowId,
    summary: String((raw as any)?.summary ?? ""),
    keyPoints: Array.isArray((raw as any)?.keyPoints) ? (raw as any).keyPoints.map((x: any) => String(x)) : [],
    risks: Array.isArray((raw as any)?.risks) ? (raw as any).risks.map((x: any) => String(x)) : [],
    suggestions: Array.isArray((raw as any)?.suggestions) ? (raw as any).suggestions.map((x: any) => String(x)) : [],
    meta: { provider: cfg.provider, model: cfg.model }
  };
}

import { normalizeText } from "../text";
import { RiskItemV1 } from "../types";

export function analyzeRiskHeuristic(params: {
  blockId: string;
  beforeText: string | null;
  afterText: string | null;
  blockSelector: string;
}): RiskItemV1 | null {
  const before = normalizeText(params.beforeText ?? "");
  const after = normalizeText(params.afterText ?? "");
  const merged = `${before}\n${after}`.toLowerCase();

  const clauseType = detectClauseType(merged);
  const tags = tagsForClauseType(clauseType);
  const level = estimateLevel(before, after, clauseType);
  const summary = buildSummary(before, after, clauseType, level);
  const analysis = buildAnalysis(before, after, clauseType);
  const recommendations = buildRecommendations(clauseType);
  const questionsForReview = buildQuestions(clauseType);

  return {
    schemaVersion: "1",
    blockId: params.blockId,
    clauseType,
    level,
    tags,
    confidence: clauseType === "unknown" ? 0.5 : 0.75,
    summary,
    analysis,
    recommendations,
    questionsForReview,
    citations: {
      beforeText: params.beforeText,
      afterText: params.afterText,
      anchors: { blockSelector: params.blockSelector }
    }
  };
}

function detectClauseType(text: string): string {
  if (/(付款|支付|结算|发票|账期|预付款|尾款)/.test(text)) return "payment_terms";
  if (/(责任|赔偿|违约金|上限|限额|免责)/.test(text)) return "liability";
  if (/(终止|解除|违约|通知|到期|续期)/.test(text)) return "termination";
  if (/(保密|泄露|商业秘密|披露)/.test(text)) return "confidentiality";
  if (/(争议|仲裁|诉讼|管辖|法院|适用法律)/.test(text)) return "dispute_resolution";
  if (/(知识产权|著作权|专利|许可|使用权)/.test(text)) return "ip";
  return "unknown";
}

function tagsForClauseType(clauseType: string): string[] {
  const base: Record<string, string[]> = {
    payment_terms: ["payment", "cashflow"],
    liability: ["liability", "damages"],
    termination: ["termination", "breach"],
    confidentiality: ["confidentiality", "data"],
    dispute_resolution: ["dispute", "jurisdiction"],
    ip: ["ip", "license"],
    unknown: ["review"]
  };
  return base[clauseType] ?? ["review"];
}

function estimateLevel(before: string, after: string, clauseType: string): "high" | "medium" | "low" {
  if (!before && after) return "medium";
  if (before && !after) return "high";
  if (clauseType === "payment_terms") {
    const n1 = extractDays(before);
    const n2 = extractDays(after);
    if (n1 !== null && n2 !== null && n2 > n1) return "high";
  }
  if (clauseType === "liability") {
    if (/不限/.test(after) || /不设上限/.test(after)) return "high";
  }
  return "medium";
}

function extractDays(s: string): number | null {
  const m = /(\d{1,3})\s*(日|天)/.exec(s);
  if (!m) return null;
  return Number(m[1]);
}

function buildSummary(before: string, after: string, clauseType: string, level: string): string {
  if (!before && after) return `新增条款（${clauseType}），建议重点复核可执行性与风险边界。`;
  if (before && !after) return `删除条款（${clauseType}），可能削弱权利保障或风险控制。`;
  if (clauseType === "payment_terms") return "付款条件发生变化，可能影响回款节奏与现金流风险。";
  if (clauseType === "liability") return "责任与赔偿条款发生变化，可能影响风险暴露范围。";
  if (clauseType === "termination") return "解除/终止条款发生变化，可能影响退出成本与争议风险。";
  if (clauseType === "dispute_resolution") return "争议解决与管辖条款发生变化，可能影响维权成本与可预期性。";
  if (clauseType === "confidentiality") return "保密条款发生变化，可能影响信息保护义务与违约责任。";
  if (clauseType === "ip") return "知识产权/许可条款发生变化，可能影响权属与使用边界。";
  return level === "high" ? "关键条款修改，建议优先复核。" : "条款存在变更，建议结合业务背景复核。";
}

function buildAnalysis(before: string, after: string, clauseType: string): string {
  if (clauseType === "unknown") return "建议由法务结合业务背景判断该变更的实质影响，并确认是否需要补充定义、条件或责任边界。";
  if (clauseType === "payment_terms") return "请重点核对付款触发条件、期限、对账/验收节点与逾期责任，避免账期延长或条件模糊导致回款不确定。";
  if (clauseType === "liability") return "请核对责任范围、赔偿口径、间接损失排除、责任上限/限额及免责条件，避免风险暴露扩大。";
  if (clauseType === "termination") return "请核对解除条件、通知期限、违约补救期、已履行费用结算与资料交付义务，避免退出成本不可控。";
  if (clauseType === "dispute_resolution") return "请核对适用法律、管辖/仲裁机构与地点，评估维权成本、证据与执行便利性。";
  if (clauseType === "confidentiality") return "请核对保密范围、例外、期限、违约责任与泄露补救机制，避免信息保护不足或义务过重。";
  if (clauseType === "ip") return "请核对权属归属、许可范围、地域/期限、衍生成果与侵权责任，避免使用边界不清。";
  return "条款变更可能影响双方权利义务边界，请结合项目交付与履约场景进行复核。";
}

function buildRecommendations(clauseType: string): string[] {
  if (clauseType === "payment_terms") return ["明确验收/开票节点与付款条件", "补充逾期利息/违约金与追偿机制", "必要时引入预付款或分期付款"];
  if (clauseType === "liability") return ["明确责任上限与排除间接损失", "对重大违约/数据泄露设定专项责任", "补充保险/担保等风险分担措施"];
  if (clauseType === "termination") return ["补充违约补救期与通知要求", "明确终止后的费用结算与资料返还", "约定终止后的保密/知识产权存续义务"];
  if (clauseType === "dispute_resolution") return ["选择更有利的管辖/仲裁地", "明确证据、送达与语言条款", "评估对方资产所在地与执行可行性"];
  if (clauseType === "confidentiality") return ["明确保密信息定义与范围", "补充泄露事件通知与补救义务", "约定合理的违约责任与举证口径"];
  if (clauseType === "ip") return ["明确成果权属与许可范围", "补充侵权担保与补救责任", "约定开源/第三方组件合规要求"];
  return ["要求对变更条款提供书面解释与依据", "补充定义、条件与责任边界", "对关键条款保留人工复核结论"];
}

function buildQuestions(clauseType: string): string[] {
  if (clauseType === "payment_terms") return ["对方付款信用与历史回款情况如何？", "是否需要担保/保证金或更严格的对账机制？"];
  if (clauseType === "liability") return ["是否存在不可接受的无限责任或高额赔偿？", "责任上限是否与合同金额匹配？"];
  if (clauseType === "termination") return ["解除条件是否过于宽松导致对方可随意退出？", "终止后的结算与交付义务是否清晰？"];
  if (clauseType === "dispute_resolution") return ["管辖/仲裁地是否显著增加维权成本？", "判决/裁决在对方资产所在地是否易执行？"];
  if (clauseType === "confidentiality") return ["保密范围是否覆盖关键数据与商业秘密？", "违约责任是否具有可执行性与震慑力？"];
  if (clauseType === "ip") return ["成果权属是否影响后续复用与商业化？", "是否存在第三方权利风险或开源合规风险？"];
  return ["该变更是否改变双方主要权利义务？", "是否需要补充配套条款以避免争议？"];
}

import { envOptional } from "./env";
import { normalizeText } from "./text";
import { analyzeSnippet } from "./ai/analyze";
import { AlignmentRow, Block } from "./types";

export type ConfirmItemStatus = "pass" | "fail" | "warn" | "manual";
export type ConfirmSeverity = "high" | "medium" | "low";

export type ConfirmItemV1 = {
  schemaVersion: "1";
  pointId: string;
  title: string;
  description: string;
  severity: ConfirmSeverity;
  required: boolean;
  tags: string[];
  status: ConfirmItemStatus;
  reason: string;
  evidence: {
    rowId: string | null;
    templateBlockId: string | null;
    contractBlockId: string | null;
    templateText: string | null;
    contractText: string | null;
  };
  ai: null | {
    status: "done" | "failed";
    result: unknown | null;
    error: string | null;
  };
};

export type ConfirmResultV1 = {
  schemaVersion: "1";
  compareId: string;
  overall: {
    summary: string;
    pass: number;
    fail: number;
    warn: number;
    manual: number;
  };
  items: ConfirmItemV1[];
  meta: {
    mode: "rule-only" | "rule+ai";
  };
};

export type ConfirmRulesV1 = {
  schemaVersion?: "1";
  heading?: { enabled?: boolean; maxLevel?: number };
  placeholder?: { enabled?: boolean; regex?: string };
  deletedClause?: { enabled?: boolean };
  purchaseContract?: {
    enabled?: boolean;
    signingDate?: { enabled?: boolean; minPrecision?: "month" | "day" };
    buyerName?: { enabled?: boolean; companySuffix?: string };
    section1Items?: { enabled?: boolean; requiredKeywords?: string[]; requireUpperLowerAmount?: boolean };
    deliveryAddress?: { enabled?: boolean; requiredKeywords?: string[] };
    deliveryDate?: { enabled?: boolean; minPrecision?: "month" | "day" };
    endUserName?: { enabled?: boolean; companySuffix?: string };
    section4Payment?: { enabled?: boolean; requireCurrency?: boolean; requireUpperLowerAmount?: boolean };
    termMax?: { enabled?: boolean; max?: number };
    section8Term?: { enabled?: boolean };
    copiesCount?: { enabled?: boolean };
  };
};

const defaultPlaceholderPattern = "_{3,}|【[^】]{0,30}】|\\[[^\\]]{0,30}\\]|（[^）]{0,30}填写[^）]{0,30}）|<[^>]{0,30}>|\\{\\{[^}]{0,30}\\}\\}";

function firstLine(s: string): string {
  const x = String(s ?? "").trim();
  const i = x.indexOf("\n");
  return i === -1 ? x : x.slice(0, i).trim();
}

function truncate(s: string | null, max: number): string | null {
  const t = normalizeText(s ?? "");
  if (!t) return null;
  if (t.length <= max) return t;
  return t.slice(0, Math.max(0, max - 12)) + "…(truncated)";
}

function hasPlaceholder(s: string, re: RegExp): boolean {
  const t = String(s ?? "");
  re.lastIndex = 0;
  return re.test(t);
}

function findBestBlock(params: { blocks: Block[]; keywords: string[] }): Block | null {
  const kws = params.keywords.map((k) => normalizeText(k)).filter(Boolean);
  if (!kws.length) return null;
  let best: { score: number; block: Block } | null = null;
  for (const b of params.blocks) {
    const t = normalizeText(b.text);
    if (!t) continue;
    let score = 0;
    for (const k of kws) {
      if (t.includes(k)) score += 1;
    }
    if (score <= 0) continue;
    if (!best || score > best.score) best = { score, block: b };
  }
  return best?.block ?? null;
}

function monthPrecisionDateIn(text: string): string | null {
  const t = String(text ?? "");
  const re =
    /((?:19|20)\d{2})\s*(?:年|[-/.])\s*(0?[1-9]|1[0-2])\s*(?:月|[-/.])?(?:\s*(0?[1-9]|[12]\d|3[01])\s*(?:日)?)?/g;
  re.lastIndex = 0;
  const m = re.exec(t);
  if (!m) return null;
  const yyyy = m[1] ?? "";
  const mm = m[2] ?? "";
  const dd = m[3] ?? "";
  return dd ? `${yyyy}-${mm}-${dd}` : `${yyyy}-${mm}`;
}

function hasCompanySuffixNear(text: string, anchor: string, suffix: string): boolean {
  const t = String(text ?? "");
  const a = String(anchor ?? "").trim();
  const s = String(suffix ?? "").trim();
  if (!a || !s) return false;
  const re = new RegExp(`${a}[^\\n。]{0,60}${s}`);
  return re.test(t);
}

function hasAllKeywords(text: string, keywords: string[]): { ok: boolean; missing: string[] } {
  const t = normalizeText(text ?? "");
  const missing: string[] = [];
  for (const k of keywords) {
    const kk = normalizeText(k);
    if (!kk) continue;
    if (!t.includes(kk)) missing.push(k);
  }
  return { ok: missing.length === 0, missing };
}

function extractFirstNumberAfter(text: string, anchor: string): number | null {
  const t = String(text ?? "");
  const a = String(anchor ?? "").trim();
  if (!a) return null;
  const idx = t.indexOf(a);
  const slice = idx >= 0 ? t.slice(idx, idx + 120) : t;
  const m = /(\d{1,3})/.exec(slice);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  if (!Number.isFinite(n)) return null;
  return n;
}

function stablePointId(prefix: string, b: Block | null): string {
  if (b?.blockId) return `${prefix}:${b.blockId}`;
  return `${prefix}:${Math.random().toString(16).slice(2)}`;
}

function makeItem(params: Omit<ConfirmItemV1, "schemaVersion">): ConfirmItemV1 {
  return { schemaVersion: "1", ...params };
}

function summarize(items: ConfirmItemV1[]): ConfirmResultV1["overall"] {
  let pass = 0;
  let fail = 0;
  let warn = 0;
  let manual = 0;
  for (const it of items) {
    if (it.status === "pass") pass++;
    if (it.status === "fail") fail++;
    if (it.status === "warn") warn++;
    if (it.status === "manual") manual++;
  }
  const summary = `确认点 ${items.length} 项：通过 ${pass}，失败 ${fail}，警告 ${warn}，待复核 ${manual}。`;
  return { summary, pass, fail, warn, manual };
}

function autoPoints(params: { rows: AlignmentRow[]; leftBlocks: Block[]; rightBlocks: Block[]; rules?: ConfirmRulesV1 | null }): ConfirmItemV1[] {
  const leftMap = new Map(params.leftBlocks.map((b) => [b.blockId, b]));
  const rightMap = new Map(params.rightBlocks.map((b) => [b.blockId, b]));
  const rowByLeft = new Map<string, AlignmentRow>();
  const rowByRight = new Map<string, AlignmentRow>();
  for (const r of params.rows) {
    if (r.leftBlockId) rowByLeft.set(r.leftBlockId, r);
    if (r.rightBlockId) rowByRight.set(r.rightBlockId, r);
  }

  const items: ConfirmItemV1[] = [];
  const rules = params.rules ?? null;
  const headingEnabled = rules?.heading?.enabled !== false;
  const headingMaxLevel = (() => {
    const n = Number(rules?.heading?.maxLevel);
    if (!Number.isFinite(n) || n <= 0) return 2;
    return Math.max(1, Math.min(6, Math.floor(n)));
  })();
  const placeholderEnabled = rules?.placeholder?.enabled !== false;
  const placeholderRe = (() => {
    const p = String(rules?.placeholder?.regex ?? "").trim();
    const pattern = p || defaultPlaceholderPattern;
    try {
      return new RegExp(pattern, "g");
    } catch {
      return new RegExp(defaultPlaceholderPattern, "g");
    }
  })();
  const deletedEnabled = rules?.deletedClause?.enabled !== false;

  if (headingEnabled) {
    for (const b of params.leftBlocks) {
      if (b.kind !== "heading") continue;
      const lvl = typeof b.meta?.headingLevel === "number" ? b.meta.headingLevel : 99;
      if (lvl > headingMaxLevel) continue;
      const row = rowByLeft.get(b.blockId);
      const right = row?.rightBlockId ? rightMap.get(row.rightBlockId) : null;
      const ok = Boolean(right && normalizeText(right.text).length > 0);
      items.push(
        makeItem({
          pointId: stablePointId("heading", b),
          title: `标题存在：${firstLine(b.text) || "（空）"}`,
          description: "模板中的标题在实际合同中必须存在，便于完整性校验与定位。",
          severity: "high",
          required: true,
          tags: ["结构", "标题"],
          status: ok ? "pass" : "fail",
          reason: ok ? "已找到对应标题。" : "未找到对应标题或标题为空。",
          evidence: {
            rowId: row?.rowId ?? null,
            templateBlockId: b.blockId ?? null,
            contractBlockId: right?.blockId ?? null,
            templateText: truncate(b.text, 420),
            contractText: truncate(right?.text ?? null, 420)
          },
          ai: null
        })
      );
    }
  }

  if (placeholderEnabled) {
    for (const r of params.rows) {
      const lb = r.leftBlockId ? leftMap.get(r.leftBlockId) : null;
      if (!lb) continue;
      if (!hasPlaceholder(lb.text, placeholderRe)) continue;
      const rb = r.rightBlockId ? rightMap.get(r.rightBlockId) : null;
      const contractText = normalizeText(rb?.text ?? "");
      const ok = Boolean(rb && contractText && !hasPlaceholder(rb.text, placeholderRe));
      items.push(
        makeItem({
          pointId: stablePointId("placeholder", lb),
          title: `占位符已填写：${firstLine(lb.text) || "（空）"}`,
          description: "模板中的占位符必须在实际合同中被填写替换。",
          severity: "high",
          required: true,
          tags: ["字段", "占位符", "填写"],
          status: ok ? "pass" : "fail",
          reason: ok ? "占位符已被填写替换。" : "占位符未被填写替换或对应条款缺失。",
          evidence: {
            rowId: r.rowId ?? null,
            templateBlockId: lb.blockId ?? null,
            contractBlockId: rb?.blockId ?? null,
            templateText: truncate(lb.text, 520),
            contractText: truncate(rb?.text ?? null, 520)
          },
          ai: null
        })
      );
    }
  }

  if (deletedEnabled) {
    for (const r of params.rows) {
      if (r.kind !== "deleted") continue;
      const lb = r.leftBlockId ? leftMap.get(r.leftBlockId) : null;
      if (!lb) continue;
      if (lb.kind === "heading") continue;
      items.push(
        makeItem({
          pointId: stablePointId("deleted", lb),
          title: `模板条款缺失：${firstLine(lb.text) || "（空）"}`,
          description: "模板条款在实际合同中缺失，建议复核是否允许删除或需要补回。",
          severity: "medium",
          required: false,
          tags: ["完整性", "缺失"],
          status: "warn",
          reason: "该模板条款在实际合同中未找到对应内容（对齐结果为 deleted）。",
          evidence: {
            rowId: r.rowId ?? null,
            templateBlockId: lb.blockId ?? null,
            contractBlockId: null,
            templateText: truncate(lb.text, 520),
            contractText: null
          },
          ai: null
        })
      );
    }
  }

  const purchaseEnabled = rules?.purchaseContract?.enabled === true;
  if (purchaseEnabled) {
    const contractAllText = params.rightBlocks.map((b) => b.text).join("\n");
    const companySuffix = String(rules?.purchaseContract?.buyerName?.companySuffix || rules?.purchaseContract?.endUserName?.companySuffix || "公司").trim() || "公司";
    const minPrecision1 = rules?.purchaseContract?.signingDate?.minPrecision ?? "month";
    const minPrecision2 = rules?.purchaseContract?.deliveryDate?.minPrecision ?? "month";
    const requiredItems = rules?.purchaseContract?.section1Items?.requiredKeywords ?? ["产品名称", "单价", "数量", "总价", "合计金额"];
    const requireUpperLower1 = rules?.purchaseContract?.section1Items?.requireUpperLowerAmount !== false;
    const deliveryKeywords = rules?.purchaseContract?.deliveryAddress?.requiredKeywords ?? ["交货地址", "联系人"];
    const requireCurrency = rules?.purchaseContract?.section4Payment?.requireCurrency !== false;
    const requireUpperLower2 = rules?.purchaseContract?.section4Payment?.requireUpperLowerAmount !== false;
    const termMax = (() => {
      const raw = Number(rules?.purchaseContract?.termMax?.max);
      if (!Number.isFinite(raw) || raw <= 0) return 10;
      return Math.max(1, Math.min(3650, Math.floor(raw)));
    })();

    const add = (p: {
      pointId: string;
      title: string;
      description: string;
      severity: ConfirmSeverity;
      required: boolean;
      tags: string[];
      status: ConfirmItemStatus;
      reason: string;
      evidence: { rowId: string | null; contractBlockId: string | null; contractText: string | null };
    }) => {
      items.push(
        makeItem({
          pointId: p.pointId,
          title: p.title,
          description: p.description,
          severity: p.severity,
          required: p.required,
          tags: p.tags,
          status: p.status,
          reason: p.reason,
          evidence: {
            rowId: p.evidence.rowId,
            templateBlockId: null,
            contractBlockId: p.evidence.contractBlockId,
            templateText: null,
            contractText: p.evidence.contractText
          },
          ai: null
        })
      );
    };

    const findEvidence = (keywords: string[]) => {
      const b = findBestBlock({ blocks: params.rightBlocks, keywords });
      const rowId = b?.blockId ? rowByRight.get(b.blockId)?.rowId ?? null : null;
      return { block: b, rowId };
    };

    if (rules?.purchaseContract?.signingDate?.enabled !== false) {
      const ev = findEvidence(["签订日期"]);
      const t = ev.block?.text ?? contractAllText;
      const dt = monthPrecisionDateIn(t);
      const ok = Boolean(dt && (minPrecision1 === "month" ? true : dt.split("-").length >= 3));
      add({
        pointId: "purchase:signingDate",
        title: "签订日期填写（至少精确到月）",
        description: "签订日期缺失或精度不足会影响合同生效与履约节点。",
        severity: "high",
        required: true,
        tags: ["采购合同", "日期", "必填"],
        status: ok ? "pass" : "fail",
        reason: ok ? `已识别日期：${dt}` : "未识别到包含月份的签订日期。",
        evidence: { rowId: ev.rowId, contractBlockId: ev.block?.blockId ?? null, contractText: truncate(ev.block?.text ?? null, 520) }
      });
    }

    if (rules?.purchaseContract?.buyerName?.enabled !== false) {
      const ev = findEvidence(["买方", "名称"]);
      const t = ev.block?.text ?? contractAllText;
      const ok = hasCompanySuffixNear(t, "买方", companySuffix) || hasCompanySuffixNear(t, "购方", companySuffix);
      add({
        pointId: "purchase:buyerName",
        title: `买方名称完整填写（含“${companySuffix}”后缀）`,
        description: "买方主体信息不完整可能影响签署主体与责任承担。",
        severity: "high",
        required: true,
        tags: ["采购合同", "主体", "必填"],
        status: ok ? "pass" : "fail",
        reason: ok ? "已检测到买方名称包含公司后缀。" : "未检测到买方名称包含公司后缀或买方信息缺失。",
        evidence: { rowId: ev.rowId, contractBlockId: ev.block?.blockId ?? null, contractText: truncate(ev.block?.text ?? null, 520) }
      });
    }

    if (rules?.purchaseContract?.section1Items?.enabled !== false) {
      const ev = findEvidence(requiredItems);
      const t = ev.block?.text ?? contractAllText;
      const kw = hasAllKeywords(t, requiredItems);
      const hasPlaceholders = hasPlaceholder(t, placeholderRe);
      const hasUpperLower = /大写/.test(t) && /小写/.test(t);
      const ok = kw.ok && !hasPlaceholders && (!requireUpperLower1 || hasUpperLower);
      add({
        pointId: "purchase:section1Items",
        title: "一：标的与金额信息填写完整",
        description: `需包含：${requiredItems.join("、")}，并确保金额大小写齐全且一致。`,
        severity: "high",
        required: true,
        tags: ["采购合同", "金额", "必填"],
        status: ok ? "pass" : kw.ok && !hasPlaceholders ? "fail" : "fail",
        reason: ok
          ? "已检测到关键字段且未发现占位符。"
          : kw.ok
            ? hasPlaceholders
              ? "检测到占位符未被填写替换。"
              : requireUpperLower1 && !hasUpperLower
                ? "未检测到金额大小写同时出现。"
                : "字段填写不完整。"
            : `缺失字段：${kw.missing.join("、")}`,
        evidence: { rowId: ev.rowId, contractBlockId: ev.block?.blockId ?? null, contractText: truncate(ev.block?.text ?? null, 520) }
      });
    }

    if (rules?.purchaseContract?.deliveryAddress?.enabled !== false) {
      const ev = findEvidence(deliveryKeywords);
      const t = ev.block?.text ?? contractAllText;
      const kw = hasAllKeywords(t, deliveryKeywords);
      const ok = kw.ok && !hasPlaceholder(t, placeholderRe);
      add({
        pointId: "purchase:deliveryAddress",
        title: "二/2：交货地址与联系人信息填写",
        description: `需包含：${deliveryKeywords.join("、")}。`,
        severity: "high",
        required: true,
        tags: ["采购合同", "交付", "必填"],
        status: ok ? "pass" : "fail",
        reason: ok ? "已检测到交货信息且未发现占位符。" : kw.ok ? "检测到占位符未被填写替换。" : `缺失字段：${kw.missing.join("、")}`,
        evidence: { rowId: ev.rowId, contractBlockId: ev.block?.blockId ?? null, contractText: truncate(ev.block?.text ?? null, 520) }
      });
    }

    if (rules?.purchaseContract?.deliveryDate?.enabled !== false) {
      const ev = findEvidence(["交货日期"]);
      const t = ev.block?.text ?? contractAllText;
      const dt = monthPrecisionDateIn(t);
      const ok = Boolean(dt && (minPrecision2 === "month" ? true : dt.split("-").length >= 3));
      add({
        pointId: "purchase:deliveryDate",
        title: "二/3：交货日期填写（至少精确到月）",
        description: "交货日期缺失或精度不足会影响履约与违约判断。",
        severity: "high",
        required: true,
        tags: ["采购合同", "交付", "日期"],
        status: ok ? "pass" : "fail",
        reason: ok ? `已识别日期：${dt}` : "未识别到包含月份的交货日期。",
        evidence: { rowId: ev.rowId, contractBlockId: ev.block?.blockId ?? null, contractText: truncate(ev.block?.text ?? null, 520) }
      });
    }

    if (rules?.purchaseContract?.endUserName?.enabled !== false) {
      const ev = findEvidence(["最终用户"]);
      const t = ev.block?.text ?? contractAllText;
      const ok = hasCompanySuffixNear(t, "最终用户", companySuffix);
      add({
        pointId: "purchase:endUserName",
        title: `二/4：最终用户名称完整填写（含“${companySuffix}”后缀）`,
        description: "最终用户信息不完整可能影响交付与验收主体。",
        severity: "medium",
        required: true,
        tags: ["采购合同", "主体", "必填"],
        status: ok ? "pass" : "fail",
        reason: ok ? "已检测到最终用户名称包含公司后缀。" : "未检测到最终用户名称包含公司后缀或最终用户信息缺失。",
        evidence: { rowId: ev.rowId, contractBlockId: ev.block?.blockId ?? null, contractText: truncate(ev.block?.text ?? null, 520) }
      });
    }

    if (rules?.purchaseContract?.section4Payment?.enabled !== false) {
      const ev = findEvidence(["金额", "大写"]);
      const t = ev.block?.text ?? contractAllText;
      const dt = monthPrecisionDateIn(t);
      const upperLowerOk = !requireUpperLower2 || (/大写/.test(t) && /小写/.test(t));
      const currencyOk = !requireCurrency || /(人民币|元|CNY|USD|\$|￥)/.test(t);
      const ok = Boolean(dt && upperLowerOk && currencyOk && !hasPlaceholder(t, placeholderRe));
      add({
        pointId: "purchase:section4Payment",
        title: "四/1：日期与金额填写完整（含货币单位）",
        description: "日期、金额、货币单位与大小写不一致会影响付款与对账。",
        severity: "high",
        required: true,
        tags: ["采购合同", "付款", "金额"],
        status: ok ? "pass" : "fail",
        reason: ok
          ? `已识别日期：${dt}`
          : !dt
            ? "未识别到日期。"
            : !currencyOk
              ? "未检测到货币单位。"
              : !upperLowerOk
                ? "未检测到金额大小写同时出现。"
                : hasPlaceholder(t, placeholderRe)
                  ? "检测到占位符未被填写替换。"
                  : "字段填写不完整。",
        evidence: { rowId: ev.rowId, contractBlockId: ev.block?.blockId ?? null, contractText: truncate(ev.block?.text ?? null, 520) }
      });
    }

    if (rules?.purchaseContract?.termMax?.enabled !== false) {
      const ev = findEvidence(["期限"]);
      const t = ev.block?.text ?? contractAllText;
      const n = extractFirstNumberAfter(t, "期限");
      const ok = typeof n === "number" && n <= termMax;
      add({
        pointId: "purchase:termMax",
        title: `五/3：期限填写且一般不大于 ${termMax}`,
        description: "期限过长可能导致资金占用或履约风险增加。",
        severity: "medium",
        required: true,
        tags: ["采购合同", "期限", "范围"],
        status: ok ? "pass" : "fail",
        reason: ok ? `已识别期限：${n}` : n ? `期限过大：${n}` : "未识别到期限数值。",
        evidence: { rowId: ev.rowId, contractBlockId: ev.block?.blockId ?? null, contractText: truncate(ev.block?.text ?? null, 520) }
      });
    }

    if (rules?.purchaseContract?.section8Term?.enabled !== false) {
      const ev = findEvidence(["八", "期限"]);
      const t = ev.block?.text ?? contractAllText;
      const ok = /期限/.test(t) && !hasPlaceholder(t, placeholderRe);
      add({
        pointId: "purchase:section8Term",
        title: "八/1：期限填写（或附件可追溯）",
        description: "期限缺失可能导致质量/保修等责任边界不清。",
        severity: "medium",
        required: true,
        tags: ["采购合同", "期限", "附件"],
        status: ok ? "pass" : "manual",
        reason: ok ? "已检测到期限且未发现占位符。" : "未能稳定定位到八/1相关证据，建议人工复核或补充更精确的关键词。",
        evidence: { rowId: ev.rowId, contractBlockId: ev.block?.blockId ?? null, contractText: truncate(ev.block?.text ?? null, 520) }
      });
    }

    if (rules?.purchaseContract?.copiesCount?.enabled !== false) {
      const ev = findEvidence(["份数"]);
      const t = ev.block?.text ?? contractAllText;
      const n = extractFirstNumberAfter(t, "份");
      const ok = typeof n === "number" && n > 0;
      add({
        pointId: "purchase:copiesCount",
        title: "十九/3：份数填写",
        description: "份数影响合同正本数量与存档分发。",
        severity: "low",
        required: true,
        tags: ["采购合同", "文本", "必填"],
        status: ok ? "pass" : "fail",
        reason: ok ? `已识别份数：${n}` : "未识别到份数。",
        evidence: { rowId: ev.rowId, contractBlockId: ev.block?.blockId ?? null, contractText: truncate(ev.block?.text ?? null, 520) }
      });
    }
  }

  const uniq = new Map<string, ConfirmItemV1>();
  for (const it of items) {
    if (!uniq.has(it.pointId)) uniq.set(it.pointId, it);
  }
  return Array.from(uniq.values());
}

async function enrichWithAi(params: { compareId: string; items: ConfirmItemV1[] }): Promise<ConfirmItemV1[]> {
  const minIntervalMs = (() => {
    const raw = envOptional("LLM_MIN_INTERVAL_MS");
    if (!raw) return 900;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) return 900;
    return Math.max(0, Math.min(30_000, n));
  })();

  const maxRetries = (() => {
    const raw = envOptional("LLM_MAX_RETRIES");
    if (!raw) return 3;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) return 3;
    return Math.max(0, Math.min(10, n));
  })();

  const baseBackoffMs = (() => {
    const raw = envOptional("LLM_RETRY_BASE_MS");
    if (!raw) return 800;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) return 800;
    return Math.max(200, Math.min(15_000, n));
  })();

  const maxAiItems = (() => {
    const raw = envOptional("CONFIRM_AI_MAX_ITEMS");
    if (!raw) return 10;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) return 10;
    return Math.max(1, Math.min(60, n));
  })();

  const onlyFail = (() => {
    const raw = String(envOptional("CONFIRM_AI_ONLY_FAIL") ?? "").trim().toLowerCase();
    if (!raw) return true;
    return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
  })();

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let lastCallAt = 0;

  const needAi = (it: ConfirmItemV1): boolean => {
    if (it.status === "manual") return true;
    if (onlyFail) return it.status === "fail";
    return it.status === "fail" || it.status === "warn";
  };

  const selected = params.items.filter(needAi).slice(0, maxAiItems);
  if (selected.length === 0) return params.items;

  const withAi = new Map<string, ConfirmItemV1>();
  for (const it of params.items) withAi.set(it.pointId, it);

  for (const it of selected) {
    const now = Date.now();
    const waitMs = minIntervalMs - (now - lastCallAt);
    if (waitMs > 0) await sleep(waitMs);

    const rowId = it.evidence.rowId ?? "r_0000";
    const kind: "modified" | "inserted" | "deleted" =
      it.evidence.templateBlockId && it.evidence.contractBlockId ? "modified" : it.evidence.contractBlockId ? "inserted" : "deleted";
    const focusText = `${it.title}\n${it.description}\n规则结论：${it.status}。原因：${it.reason}`;

    let ok = false;
    let error: string | null = null;
    let result: unknown | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        lastCallAt = Date.now();
        result = await analyzeSnippet({
          compareId: params.compareId,
          rowId,
          kind,
          beforeText: it.evidence.templateText,
          afterText: it.evidence.contractText,
          focusText
        });
        ok = true;
        error = null;
        break;
      } catch (e: any) {
        const msg = String(e?.message ?? e ?? "");
        const is429 = /\b429\b/.test(msg) || /rate\s*limit/i.test(msg) || /too\s*many\s*requests/i.test(msg);
        if (!is429 || attempt >= maxRetries) {
          ok = false;
          error = msg;
          result = null;
          break;
        }
        const backoff = Math.min(20_000, baseBackoffMs * Math.pow(2, attempt));
        const jitter = Math.floor(Math.random() * 250);
        await sleep(backoff + jitter);
      }
    }

    const updated: ConfirmItemV1 = {
      ...it,
      ai: ok ? { status: "done", result, error: null } : { status: "failed", result: null, error: error ?? "failed" }
    };
    withAi.set(it.pointId, updated);
  }

  return params.items.map((it) => withAi.get(it.pointId) ?? it);
}

export async function runStandardConfirm(params: {
  compareId: string;
  rows: AlignmentRow[];
  leftBlocks: Block[];
  rightBlocks: Block[];
  enableAi: boolean;
  rules?: ConfirmRulesV1 | null;
}): Promise<ConfirmResultV1> {
  const items0 = autoPoints({ rows: params.rows, leftBlocks: params.leftBlocks, rightBlocks: params.rightBlocks, rules: params.rules ?? null });
  const items = params.enableAi ? await enrichWithAi({ compareId: params.compareId, items: items0 }) : items0;
  const overall = summarize(items);
  return {
    schemaVersion: "1",
    compareId: params.compareId,
    overall,
    items,
    meta: { mode: params.enableAi ? "rule+ai" : "rule-only" }
  };
}

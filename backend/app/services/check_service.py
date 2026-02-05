import json
import os
import re
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any, Tuple

from app.models import (
    Block,
    Ruleset,
    CheckRunResponse,
    CheckResultItem,
    CheckEvidence,
    CheckAiResult,
    CheckSeverity,
    CheckStatus,
    CheckRule,
    RuleType,
    AiPolicy,
)
from app.services.llm_service import LLMService
from app.services.ruleset_store import get_ruleset


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_ws(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "")).strip()


def _excerpt(s: str, n: int = 220) -> str:
    s2 = _normalize_ws(s)
    return s2[:n] + ("…" if len(s2) > n else "")


def _has_underline_placeholder(html_fragment: str) -> bool:
    if not html_fragment:
        return False
    if re.search(r"text-decoration\s*:\s*underline", html_fragment, flags=re.IGNORECASE) is None:
        return False
    if re.search(r"text-decoration\s*:\s*underline[^>]*>\s*</span>", html_fragment, flags=re.IGNORECASE):
        return True
    if re.search(r"text-decoration\s*:\s*underline[^>]*>\s*&nbsp;\s*</span>", html_fragment, flags=re.IGNORECASE):
        return True
    if re.search(r"text-decoration\s*:\s*underline[^>]*>\s*[_\s]{4,}\s*</span>", html_fragment, flags=re.IGNORECASE):
        return True
    return False


def _is_placeholder_text(val: str) -> bool:
    v = (val or "").strip()
    if not v:
        return True
    if re.fullmatch(r"[_\s—\-－·•\.]{2,}", v):
        return True
    if re.fullmatch(r"[（(]\s*[）)]", v):
        return True
    return False


def _value_after_label(text: str, label_regex: Optional[str]) -> Optional[str]:
    t = text or ""
    if label_regex:
        m = re.search(rf"({label_regex})\s*[:：]\s*(.*)$", t)
        if m:
            return (m.group(2) or "").strip()
    idx = t.find("：")
    if idx >= 0:
        return t[idx + 1 :].strip()
    idx = t.find(":")
    if idx >= 0:
        return t[idx + 1 :].strip()
    return None


def _find_block(blocks: List[Block], anchor_type: str, anchor_value: str) -> Optional[Block]:
    if anchor_type == "stableKey":
        for b in blocks:
            if b.stableKey == anchor_value:
                return b
        return None
    if anchor_type == "textRegex":
        try:
            pattern = re.compile(anchor_value)
        except re.error:
            pattern = re.compile(re.escape(anchor_value))
        for b in blocks:
            if pattern.search(b.text or ""):
                return b
        return None
    if anchor_type == "tableContains":
        for b in blocks:
            if str(b.kind) == "BlockKind.TABLE" or (hasattr(b.kind, "value") and b.kind.value == "table") or b.kind == "table":
                if anchor_value in (b.text or ""):
                    return b
        for b in blocks:
            if anchor_value in (b.text or ""):
                return b
        return None
    for b in blocks:
        if anchor_value in (b.text or ""):
            return b
    return None


def _parse_money_number(s: str) -> Optional[float]:
    if not s:
        return None
    s2 = re.sub(r"[,\s]", "", s)
    m = re.search(r"-?\d+(?:\.\d+)?", s2)
    if not m:
        return None
    try:
        return float(m.group(0))
    except Exception:
        return None


def _eval_required_after_colon(rule: CheckRule, block: Block) -> Tuple[CheckStatus, str]:
    label_regex = rule.params.get("labelRegex")
    val = _value_after_label(block.text or "", label_regex)
    if val is None:
        if _has_underline_placeholder(block.htmlFragment or ""):
            return CheckStatus.FAIL, "字段为空（占位线/下划线未填写）"
        return CheckStatus.WARN, "未能定位“：”后的字段值，建议人工复核"
    if _is_placeholder_text(val) or _has_underline_placeholder(block.htmlFragment or ""):
        return CheckStatus.FAIL, "字段为空（占位线/下划线未填写）"
    return CheckStatus.PASS, "已填写"


def _eval_date_month(_: CheckRule, block: Block) -> Tuple[CheckStatus, str]:
    t = block.text or ""
    m = re.search(r"(\d{4})\s*[年/\-\.]\s*(\d{1,2})\s*(?:月)?", t)
    if m:
        month = int(m.group(2))
        if 1 <= month <= 12:
            return CheckStatus.PASS, "日期至少精确到月"
    if re.search(r"\d{4}\s*年", t):
        return CheckStatus.FAIL, "日期仅包含年份，需至少精确到月"
    if _has_underline_placeholder(block.htmlFragment or ""):
        return CheckStatus.FAIL, "日期为空（占位线/下划线未填写）"
    return CheckStatus.FAIL, "未识别到有效日期（至少到月）"


def _eval_company_suffix(rule: CheckRule, block: Block) -> Tuple[CheckStatus, str]:
    label_regex = rule.params.get("labelRegex")
    val = _value_after_label(block.text or "", label_regex) or ""
    val2 = re.sub(r"\s+", "", val)
    val2 = val2.strip("，,。；;：:()（）")
    if not val2 or _is_placeholder_text(val2) or _has_underline_placeholder(block.htmlFragment or ""):
        return CheckStatus.FAIL, "名称未填写"
    if val2.endswith("公司"):
        return CheckStatus.PASS, "名称包含“公司”后缀"
    return CheckStatus.FAIL, "名称缺少“公司”后缀"


def _eval_option_selected(_: CheckRule, block: Block) -> Tuple[CheckStatus, str]:
    t = block.text or ""
    marks = ["■", "☑", "√", "✔", "☒", "✅", "☐", "□"]
    has_any = any(x in t for x in marks)
    has_selected = any(x in t for x in ["■", "☑", "√", "✔", "☒", "✅"])
    if not has_any:
        if _has_underline_placeholder(block.htmlFragment or ""):
            return CheckStatus.FAIL, "未选择选项（为空）"
        return CheckStatus.WARN, "未检测到选项标记，建议人工复核"
    if has_selected:
        return CheckStatus.PASS, "已选择选项"
    return CheckStatus.FAIL, "存在选项但未检测到已选择标记"


def _eval_number_max(rule: CheckRule, block: Block) -> Tuple[CheckStatus, str]:
    t = block.text or ""
    max_v = rule.params.get("max")
    m = re.search(r"\d+", t)
    if not m:
        if _has_underline_placeholder(block.htmlFragment or ""):
            return CheckStatus.FAIL, "期限为空（占位线/下划线未填写）"
        return CheckStatus.FAIL, "未识别到数值"
    v = int(m.group(0))
    if max_v is None:
        return CheckStatus.PASS, f"已识别数值 {v}"
    if v <= int(max_v):
        return CheckStatus.PASS, f"数值 {v} ≤ {int(max_v)}"
    return CheckStatus.FAIL, f"数值 {v} > {int(max_v)}"


def _eval_bank_account_in_list(rule: CheckRule, block: Block, ruleset: Ruleset) -> Tuple[CheckStatus, str]:
    ref_key = rule.params.get("referenceKey", "bankAccounts")
    ref_list = ruleset.referenceData.get(ref_key, [])
    nums = re.findall(r"\d{10,30}", block.text or "")
    if not nums:
        return CheckStatus.MANUAL, "未能从文本中提取到银行账号，需人工复核"
    if not ref_list:
        return CheckStatus.MANUAL, "未配置财务账号参考数据，需人工复核"
    for n in nums:
        if n in ref_list:
            return CheckStatus.PASS, "银行账号命中参考列表"
    return CheckStatus.FAIL, "银行账号未命中参考列表"


def _eval_fill_or_strike(rule: CheckRule, block: Block) -> Tuple[CheckStatus, str]:
    if _has_underline_placeholder(block.htmlFragment or ""):
        return CheckStatus.FAIL, "内容为空（占位线/下划线未填写）"
    t = block.text or ""
    if re.search(r"划去|不适用|N/?A", t, flags=re.IGNORECASE):
        return CheckStatus.PASS, "已标记为不适用/划去"
    must_currency = bool(rule.params.get("mustContainCurrency"))
    if must_currency:
        if re.search(r"(人民币|元|￥|RMB|CNY)", t):
            return CheckStatus.PASS, "包含货币单位"
        return CheckStatus.WARN, "未检测到货币单位，建议人工复核"
    if _normalize_ws(t):
        return CheckStatus.PASS, "已填写"
    return CheckStatus.FAIL, "内容为空"


def _eval_table_sales_items(_: CheckRule, block: Block) -> Tuple[CheckStatus, str]:
    lines = [x.strip() for x in (block.text or "").split("\n") if x.strip()]
    if not lines:
        return CheckStatus.MANUAL, "未识别到表格内容，需人工复核"
    header_idx = None
    header_cols: List[str] = []
    for i, line in enumerate(lines[:6]):
        cols = [c.strip() for c in line.split("|")]
        if any("产品名称" in c for c in cols):
            header_idx = i
            header_cols = cols
            break
    if header_idx is None:
        return CheckStatus.WARN, "未识别到表头（产品名称等），建议人工复核"

    def find_col(names: List[str]) -> Optional[int]:
        for name in names:
            for j, c in enumerate(header_cols):
                if name in c:
                    return j
        return None

    idx_name = find_col(["产品名称", "品名"])
    idx_price = find_col(["单价"])
    idx_qty = find_col(["数量"])
    idx_total = find_col(["总价", "金额"])
    missing_cols = [x for x, idx in [("产品名称", idx_name), ("单价", idx_price), ("数量", idx_qty), ("总价", idx_total)] if idx is None]
    if missing_cols:
        return CheckStatus.WARN, f"表头缺少列：{', '.join(missing_cols)}"

    problems: List[str] = []
    checked_rows = 0
    for line in lines[header_idx + 1 :]:
        cols = [c.strip() for c in line.split("|")]
        if len(cols) < len(header_cols):
            cols = cols + [""] * (len(header_cols) - len(cols))
        name = cols[idx_name] if idx_name is not None else ""
        if not name or _is_placeholder_text(name):
            continue
        checked_rows += 1
        price = cols[idx_price] if idx_price is not None else ""
        qty = cols[idx_qty] if idx_qty is not None else ""
        total = cols[idx_total] if idx_total is not None else ""
        for label, val in [("单价", price), ("数量", qty), ("总价", total)]:
            if _is_placeholder_text(val):
                problems.append(f"{name}：{label}未填写")
        p = _parse_money_number(price)
        q = _parse_money_number(qty)
        tt = _parse_money_number(total)
        if p is not None and q is not None and tt is not None:
            expected = round(p * q, 2)
            if abs(expected - tt) > 0.01:
                problems.append(f"{name}：单价×数量={expected}，总价={tt}")

    if checked_rows == 0:
        return CheckStatus.WARN, "未识别到可校验的明细行，建议人工复核"
    if problems:
        msg = "；".join(problems[:6])
        if len(problems) > 6:
            msg += "…"
        return CheckStatus.FAIL, msg
    return CheckStatus.PASS, "明细字段填写与计算未发现问题"


RULE_EVAL: Dict[RuleType, Any] = {
    RuleType.REQUIRED_AFTER_COLON: _eval_required_after_colon,
    RuleType.DATE_MONTH: _eval_date_month,
    RuleType.COMPANY_SUFFIX: _eval_company_suffix,
    RuleType.OPTION_SELECTED: _eval_option_selected,
    RuleType.NUMBER_MAX: _eval_number_max,
    RuleType.TABLE_SALES_ITEMS: _eval_table_sales_items,
    RuleType.FILL_OR_STRIKE: _eval_fill_or_strike,
}


class CheckService:
    def __init__(self):
        self.llm = LLMService()

    def _ai_should_run(self, ai_policy: Optional[str], ai_enabled: bool, status: CheckStatus) -> bool:
        if not ai_enabled:
            return False
        if ai_policy is None:
            return status in (CheckStatus.FAIL, CheckStatus.WARN, CheckStatus.MANUAL)
        if ai_policy == AiPolicy.NEVER.value:
            return False
        if ai_policy == AiPolicy.ALWAYS.value:
            return True
        if ai_policy == AiPolicy.WHEN_FAIL.value:
            return status == CheckStatus.FAIL
        return status in (CheckStatus.FAIL, CheckStatus.WARN, CheckStatus.MANUAL)

    def run(self, template_id: str, right_blocks: List[Block], ai_enabled: bool) -> CheckRunResponse:
        ruleset = get_ruleset(template_id)
        if ruleset is None:
            raise ValueError(f"ruleset not found: {template_id}")

        items: List[CheckResultItem] = []

        for p in ruleset.points:
            b = _find_block(right_blocks, p.anchor.type.value, p.anchor.value)
            if b is None:
                items.append(
                    CheckResultItem(
                        pointId=p.pointId,
                        title=p.title,
                        severity=p.severity,
                        status=CheckStatus.FAIL,
                        message="未定位到对应条款/分块",
                        evidence=CheckEvidence(rightBlockId=None, excerpt=None),
                    )
                )
                continue

            status: CheckStatus = CheckStatus.PASS
            message_parts: List[str] = []
            for r in p.rules:
                if r.type == RuleType.BANK_ACCOUNT_IN_LIST:
                    st, msg = _eval_bank_account_in_list(r, b, ruleset)
                else:
                    fn = RULE_EVAL.get(r.type)
                    if fn is None:
                        st, msg = CheckStatus.MANUAL, f"未实现规则：{r.type.value}"
                    else:
                        st, msg = fn(r, b)
                message_parts.append(msg)
                order = {
                    CheckStatus.ERROR: 6,
                    CheckStatus.FAIL: 5,
                    CheckStatus.WARN: 4,
                    CheckStatus.MANUAL: 3,
                    CheckStatus.SKIPPED: 2,
                    CheckStatus.PASS: 1,
                }
                if order[st] > order[status]:
                    status = st

            if not p.rules:
                if _has_underline_placeholder(b.htmlFragment or ""):
                    status = CheckStatus.FAIL
                    message_parts = ["内容为空（占位线/下划线未填写）"]
                else:
                    status = CheckStatus.MANUAL
                    message_parts = ["未配置规则，需人工复核"]

            item = CheckResultItem(
                pointId=p.pointId,
                title=p.title,
                severity=p.severity,
                status=status,
                message="；".join([x for x in message_parts if x]) or "完成",
                evidence=CheckEvidence(rightBlockId=b.blockId, excerpt=_excerpt(b.text or "")),
            )

            ai_policy = p.ai.policy.value if p.ai else None
            ai_prompt = p.ai.prompt if p.ai else None
            if self._ai_should_run(ai_policy, ai_enabled, status) and ai_prompt:
                try:
                    ai_res = self.llm.check_point(
                        title=p.title,
                        instruction=ai_prompt,
                        evidence_text=b.text or "",
                        rule_status=status.value,
                        rule_message=item.message,
                    )
                    item.ai = ai_res
                except Exception as e:
                    item.ai = CheckAiResult(raw=f"AI failed: {repr(e)}")

            items.append(item)

        summary = {
            "generatedAt": _utc_now_iso(),
            "counts": {
                "pass": sum(1 for x in items if x.status == CheckStatus.PASS),
                "fail": sum(1 for x in items if x.status == CheckStatus.FAIL),
                "warn": sum(1 for x in items if x.status == CheckStatus.WARN),
                "manual": sum(1 for x in items if x.status == CheckStatus.MANUAL),
                "error": sum(1 for x in items if x.status == CheckStatus.ERROR),
                "skipped": sum(1 for x in items if x.status == CheckStatus.SKIPPED),
            },
        }

        run_id = "chk_" + uuid.uuid4().hex[:12]
        resp = CheckRunResponse(
            runId=run_id,
            templateId=ruleset.templateId,
            templateVersion=ruleset.version,
            summary=summary,
            items=items,
        )
        self._persist_run(resp)
        return resp

    def _persist_run(self, resp: CheckRunResponse) -> None:
        app_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        root = os.path.join(app_dir, "artifacts", "check_runs")
        os.makedirs(root, exist_ok=True)
        path = os.path.join(root, f"{resp.runId}.json")
        payload = resp.model_dump()
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)

    def get_run(self, run_id: str) -> Optional[Dict[str, Any]]:
        app_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        path = os.path.join(app_dir, "artifacts", "check_runs", f"{run_id}.json")
        if not os.path.exists(path):
            return None
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

import json
import os
import time
from contextlib import contextmanager
from typing import Dict, Any, List, Optional

from app.models import Ruleset


def _lock_path(target_path: str) -> str:
    return target_path + ".lock"


@contextmanager
def _exclusive_lock(target_path: str, timeout_s: float = 10.0, stale_s: float = 60.0):
    lock_path = _lock_path(target_path)
    start = time.monotonic()
    acquired = False
    fd = None
    while True:
        try:
            fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_RDWR)
            acquired = True
            break
        except FileExistsError:
            try:
                age = time.time() - os.path.getmtime(lock_path)
                if age > stale_s:
                    os.remove(lock_path)
                    continue
            except Exception:
                pass
            if time.monotonic() - start >= timeout_s:
                raise RuntimeError(f"timeout acquiring lock: {lock_path}")
            time.sleep(0.05)
    try:
        yield
    finally:
        try:
            if fd is not None:
                os.close(fd)
        finally:
            if acquired:
                try:
                    os.remove(lock_path)
                except Exception:
                    pass


def _store_dir() -> Optional[str]:
    root = os.getenv("DOC_COMPARISON_DATA_DIR", "").strip()
    if root:
        d = os.path.join(root, "store")
    else:
        app_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        backend_dir = os.path.abspath(os.path.join(app_dir, ".."))
        d = os.path.join(backend_dir, "data", "store")
    os.makedirs(d, exist_ok=True)
    return d


def _rulesets_file_path() -> str:
    store_dir = _store_dir()
    return os.path.join(store_dir, "rulesets.json")


def _legacy_rulesets_file_path() -> str:
    app_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    return os.path.join(app_dir, "rulesets.json")


def _default_rulesets_payload() -> Dict[str, Any]:
    return {
        "rulesets": [
            {
                "templateId": "sales_contract_cn",
                "name": "买卖合同（销售）",
                "version": "2026-02-05",
                "referenceData": {
                    "bankAccounts": []
                },
                "points": [
                    {
                        "pointId": "sales.sign_date_month",
                        "title": "签订日期填写，至少精确到月",
                        "severity": "high",
                        "anchor": {"type": "textRegex", "value": "签订日期"},
                        "rules": [{"type": "dateMonth", "params": {}}],
                        "ai": {
                            "policy": "optional",
                            "prompt": "检查合同签订日期是否已填写，且至少精确到月份（例如 2026-02 或 2026年2月）。若仅有年份或为空，判定为不通过，并给出建议填写示例。"
                        }
                    },
                    {
                        "pointId": "sales.buyer_full_name_company_suffix",
                        "title": "买方的名称应完整填写，应有“公司”后缀",
                        "severity": "high",
                        "anchor": {"type": "textRegex", "value": "买方"},
                        "rules": [{"type": "companySuffix", "params": {"labelRegex": "买方"}}],
                        "ai": {
                            "policy": "optional",
                            "prompt": "检查买方名称是否完整填写，并以“公司”结尾；如不满足，指出当前文本并给出修订建议。"
                        }
                    },
                    {
                        "pointId": "sales.section1_table_required_fields",
                        "title": "一/各项项目填写完整，产品名称/单价/数量/总价/合计金额必须填写且计算正确，大小写一致",
                        "severity": "high",
                        "anchor": {"type": "tableContains", "value": "产品名称"},
                        "rules": [{"type": "tableSalesItems", "params": {}}],
                        "ai": {
                            "policy": "optional",
                            "prompt": "检查第一部分表格中“产品名称、单价、数量、总价、合计金额”等是否填写完整；若能识别数值，检查单价×数量=总价，且合计金额大小写一致；无法确定处列为需人工复核并说明原因。"
                        }
                    },
                    {
                        "pointId": "sales.section2_1_option_selected",
                        "title": "二/1中的选项请选择",
                        "severity": "medium",
                        "anchor": {"type": "textRegex", "value": "二\\s*/\\s*1|二\\s*\\.\\s*1|二\\s*、\\s*1"},
                        "rules": [{"type": "optionSelected", "params": {}}],
                        "ai": {
                            "policy": "optional",
                            "prompt": "检查第二部分第1项是否存在选项并已明确选择（例如勾选/打勾/填入选项内容）；若未选择判定不通过。"
                        }
                    },
                    {
                        "pointId": "sales.section2_3_delivery_place",
                        "title": "二/3中的交货地点请填写",
                        "severity": "high",
                        "anchor": {"type": "textRegex", "value": "交货地点"},
                        "rules": [{"type": "requiredAfterColon", "params": {"labelRegex": "交货地点"}}],
                        "ai": {
                            "policy": "optional",
                            "prompt": "检查交货地点是否已填写；若为空或仅占位线/下划线，判定不通过并建议填写具体地点。"
                        }
                    },
                    {
                        "pointId": "sales.section2_4_delivery_date_month",
                        "title": "二/4中的交货日期请填写，至少精确到月",
                        "severity": "high",
                        "anchor": {"type": "textRegex", "value": "交货日期"},
                        "rules": [{"type": "dateMonth", "params": {}}],
                        "ai": {
                            "policy": "optional",
                            "prompt": "检查交货日期是否已填写且至少精确到月；如不满足，给出建议填写格式。"
                        }
                    },
                    {
                        "pointId": "sales.section2_5_end_user_company_suffix",
                        "title": "二/5中最终用户的名称应完整填写，应有“公司”后缀",
                        "severity": "medium",
                        "anchor": {"type": "textRegex", "value": "最终用户"},
                        "rules": [{"type": "companySuffix", "params": {"labelRegex": "最终用户"}}],
                        "ai": {
                            "policy": "optional",
                            "prompt": "检查最终用户名称是否完整填写并以“公司”结尾；如不满足，指出问题并给出修订建议。"
                        }
                    },
                    {
                        "pointId": "sales.section3_1_amount_currency_consistency",
                        "title": "三/1中期限及金额应完整填写并包含货币单位，大小写应一致",
                        "severity": "high",
                        "anchor": {"type": "textRegex", "value": "三\\s*/\\s*1|三\\s*\\.\\s*1|付款|期限"},
                        "rules": [{"type": "fillOrStrike", "params": {"mustContainCurrency": True}}],
                        "ai": {
                            "policy": "optional",
                            "prompt": "检查第三部分第1项的期限与金额是否填写完整并包含货币单位（如人民币/元/CNY），且金额大小写一致；无法自动判断的内容列为需人工复核。"
                        }
                    },
                    {
                        "pointId": "sales.section3_2_amount_currency_consistency",
                        "title": "三/2中期限及金额应完整填写并包含货币单位，大小写应一致",
                        "severity": "high",
                        "anchor": {"type": "textRegex", "value": "三\\s*/\\s*2|三\\s*\\.\\s*2|付款|期限"},
                        "rules": [{"type": "fillOrStrike", "params": {"mustContainCurrency": True}}],
                        "ai": {
                            "policy": "optional",
                            "prompt": "检查第三部分第2项的期限与金额是否填写完整并包含货币单位，且金额大小写一致；无法自动判断的内容列为需人工复核。"
                        }
                    },
                    {
                        "pointId": "sales.section3_3_bank_account_match",
                        "title": "三/3中的银行账号和公司财务部公布的信息一致",
                        "severity": "high",
                        "anchor": {"type": "textRegex", "value": "银行账号|开户行|账号"},
                        "rules": [{"type": "bankAccountInList", "params": {"referenceKey": "bankAccounts"}}],
                        "ai": {
                            "policy": "optional",
                            "prompt": "从合同中提取银行账号并与已配置的财务账号列表对比；如列表为空或无法提取，提示需人工复核。"
                        }
                    },
                    {
                        "pointId": "sales.section4_2_term_days_max_30",
                        "title": "四/2中的期限请填写，一般不大于30",
                        "severity": "medium",
                        "anchor": {"type": "textRegex", "value": "四\\s*/\\s*2|四\\s*\\.\\s*2|期限"},
                        "rules": [{"type": "numberMax", "params": {"max": 30}}],
                        "ai": {
                            "policy": "optional",
                            "prompt": "检查第四部分第2项期限是否填写且不大于30（通常指天数）；若超过或为空，判定不通过并提示建议。"
                        }
                    },
                    {
                        "pointId": "sales.section9_1_fill_or_strike",
                        "title": "九/1中的期限或填写，或划去，不应空白",
                        "severity": "medium",
                        "anchor": {"type": "textRegex", "value": "九\\s*/\\s*1|九\\s*\\.\\s*1|期限"},
                        "rules": [{"type": "fillOrStrike", "params": {}}],
                        "ai": {
                            "policy": "optional",
                            "prompt": "检查第九部分第1项期限是否已填写，或已明确划去/标记为不适用；若空白判定不通过。"
                        }
                    },
                    {
                        "pointId": "sales.section16_3_copies_filled",
                        "title": "十六/3中的份数请填写",
                        "severity": "low",
                        "anchor": {"type": "textRegex", "value": "十六\\s*/\\s*3|十六\\s*\\.\\s*3|份数"},
                        "rules": [{"type": "requiredAfterColon", "params": {"labelRegex": "份数"}}],
                        "ai": {
                            "policy": "optional",
                            "prompt": "检查第十六部分第3项“份数”是否已填写；若为空或仅占位线判定不通过。"
                        }
                    }
                ]
            }
        ]
    }


def ensure_rulesets_file() -> None:
    path = _rulesets_file_path()
    if os.path.exists(path):
        return
    with _exclusive_lock(path):
        if os.path.exists(path):
            return
        legacy = _legacy_rulesets_file_path()
        if legacy != path and os.path.exists(legacy):
            with open(legacy, "r", encoding="utf-8") as f:
                payload = json.load(f)
            tmp = path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
            os.replace(tmp, path)
            return
        payload = _default_rulesets_payload()
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)


def list_rulesets() -> List[Ruleset]:
    ensure_rulesets_file()
    path = _rulesets_file_path()
    with open(path, "r", encoding="utf-8") as f:
        payload = json.load(f)
    items = payload.get("rulesets", [])
    return [Ruleset.model_validate(x) for x in items]


def get_ruleset(template_id: str) -> Optional[Ruleset]:
    for rs in list_rulesets():
        if rs.templateId == template_id:
            return rs
    return None


def upsert_ruleset(ruleset: Ruleset) -> None:
    ensure_rulesets_file()
    path = _rulesets_file_path()
    with _exclusive_lock(path):
        with open(path, "r", encoding="utf-8") as f:
            payload = json.load(f)
        items = payload.get("rulesets", [])
        replaced = False
        for i, x in enumerate(items):
            if x.get("templateId") == ruleset.templateId:
                items[i] = ruleset.model_dump()
                replaced = True
                break
        if not replaced:
            items.append(ruleset.model_dump())
        payload["rulesets"] = items
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)


def delete_ruleset(template_id: str) -> None:
    ensure_rulesets_file()
    path = _rulesets_file_path()
    with _exclusive_lock(path):
        with open(path, "r", encoding="utf-8") as f:
            payload = json.load(f)
        items = payload.get("rulesets", [])
        next_items = [x for x in items if x.get("templateId") != template_id]
        if len(next_items) == len(items):
            return
        payload["rulesets"] = next_items
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)

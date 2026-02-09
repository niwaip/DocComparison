import hashlib
import json
import os
import re
import time
from contextlib import contextmanager
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Tuple

from app.models import Block, TemplateSnapshot, TemplateListItem, TemplateMatchItem, TemplateMatchResponse
from app.core.config import settings
from app.services.ruleset_store import delete_ruleset, get_ruleset, upsert_ruleset
from app.utils.text_utils import get_leading_section_label, normalize_text, strip_section_noise


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


def _sha1(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


def _validate_template_id(template_id: str) -> str:
    tid = (template_id or "").strip()
    if not tid:
        raise ValueError("templateId required")
    if not re.fullmatch(r"[a-zA-Z0-9._-]{1,80}", tid):
        raise ValueError("templateId invalid")
    return tid


def _validate_version(version: str) -> str:
    v = (version or "").strip()
    if not v:
        raise ValueError("version required")
    if not re.fullmatch(r"[a-zA-Z0-9._-]{1,80}", v):
        raise ValueError("version invalid")
    return v


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


def _assets_root_dir() -> str:
    root = os.getenv("DOC_COMPARISON_DATA_DIR", "").strip()
    if root:
        return os.path.join(root, "assets", "template_assets")
    app_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    backend_dir = os.path.abspath(os.path.join(app_dir, ".."))
    return os.path.join(backend_dir, "data", "assets", "template_assets")


def _safe_segment(s: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]+", "_", (s or "").strip())


def get_template_docx_path(template_id: str, version: str) -> Optional[str]:
    root = _assets_root_dir()
    p = os.path.join(root, _safe_segment(template_id), _safe_segment(version), "template.docx")
    return p if os.path.exists(p) else None


def save_template_docx(template_id: str, version: str, data: bytes) -> str:
    root = _assets_root_dir()
    d = os.path.join(root, _safe_segment(template_id), _safe_segment(version))
    os.makedirs(d, exist_ok=True)
    p = os.path.join(d, "template.docx")
    tmp = p + ".tmp"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, p)
    return p


def _templates_file_path() -> str:
    store_dir = _store_dir()
    return os.path.join(store_dir, "templates.json")


def _legacy_templates_file_path() -> str:
    app_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    return os.path.join(app_dir, "templates.json")


def _default_templates_payload() -> Dict[str, Any]:
    return {"templates": []}


def ensure_templates_file() -> None:
    path = _templates_file_path()
    if os.path.exists(path):
        return
    with _exclusive_lock(path):
        if os.path.exists(path):
            return
        legacy = _legacy_templates_file_path()
        if legacy != path and os.path.exists(legacy):
            with open(legacy, "r", encoding="utf-8") as f:
                payload = json.load(f)
            tmp = path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
            os.replace(tmp, path)
            return
        payload = _default_templates_payload()
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)


def _block_token(b: Block) -> str:
    kind = getattr(b.kind, "value", str(b.kind))
    t = b.text or ""
    first_line = normalize_text(t).split("\n")[0].strip()
    first_line = strip_section_noise(first_line)
    first_line = re.split(r"[:：]", first_line, maxsplit=1)[0]
    first_line = re.sub(r"[_\s]+", "", first_line)
    first_line = re.sub(r"\d+", "0", first_line)
    first_line = first_line.lower().strip()
    if kind == "table":
        first_line = first_line[:40]
    else:
        first_line = first_line[:60]
    return f"{kind}:{first_line}"


def compute_signature(blocks: List[Block]) -> Tuple[str, List[str]]:
    tokens = [_block_token(b) for b in blocks]
    joined = "\n".join(tokens)
    return _sha1(joined), tokens


def _outline_token(text: str) -> str:
    s = normalize_text(text).split("\n")[0].strip()
    s = strip_section_noise(s)
    s = re.split(r"[:：]", s, maxsplit=1)[0]
    s = re.sub(r"[_\s]+", "", s)
    s = re.sub(r"\d+", "0", s)
    s = s.lower().strip()
    return s[:80]


def _extract_outline_tokens(blocks: List[Block], limit: int = 60) -> List[str]:
    out: List[str] = []
    for idx, b in enumerate(blocks):
        if len(out) >= limit:
            break
        raw = (b.text or "").strip()
        if not raw:
            continue
        first_line = normalize_text(raw).split("\n")[0].strip()
        if not first_line:
            continue
        kind = getattr(b.kind, "value", str(b.kind))
        is_heading_kind = kind == "heading" or (getattr(getattr(b, "meta", None), "headingLevel", None) is not None)
        has_section_label = get_leading_section_label(first_line) is not None
        if idx == 0 or is_heading_kind or has_section_label:
            tok = _outline_token(first_line)
            if tok and tok not in out:
                out.append(tok)
    return out


def _latest_templates_by_id() -> List[TemplateSnapshot]:
    latest_by_id: Dict[str, TemplateSnapshot] = {}
    for t in list_templates():
        prev = latest_by_id.get(t.templateId)
        if prev is None or t.version > prev.version:
            latest_by_id[t.templateId] = t
    return list(latest_by_id.values())


def list_templates() -> List[TemplateSnapshot]:
    ensure_templates_file()
    path = _templates_file_path()
    with open(path, "r", encoding="utf-8") as f:
        payload = json.load(f)
    items = payload.get("templates", [])
    out: List[TemplateSnapshot] = []
    for x in items:
        try:
            out.append(TemplateSnapshot.model_validate(x))
        except Exception:
            continue
    return out


def list_template_index() -> List[TemplateListItem]:
    by_id: Dict[str, TemplateListItem] = {}
    best_name_by_id: Dict[str, Tuple[str, str]] = {}
    for t in list_templates():
        item = by_id.get(t.templateId)
        if item is None:
            item = TemplateListItem(templateId=t.templateId, name=t.name, versions=[])
            by_id[t.templateId] = item
        if t.version not in item.versions:
            item.versions.append(t.version)
        if t.name:
            prev = best_name_by_id.get(t.templateId)
            if prev is None or t.version > prev[0]:
                best_name_by_id[t.templateId] = (t.version, t.name)
    out = list(by_id.values())
    for x in out:
        best = best_name_by_id.get(x.templateId)
        if best is not None:
            x.name = best[1]
    for x in out:
        x.versions.sort()
    out.sort(key=lambda z: z.templateId)
    return out


def get_template(template_id: str, version: str) -> Optional[TemplateSnapshot]:
    for t in list_templates():
        if t.templateId == template_id and t.version == version:
            return t
    return None


def upsert_template(snapshot: TemplateSnapshot) -> None:
    snapshot.templateId = _validate_template_id(snapshot.templateId)
    snapshot.version = _validate_version(snapshot.version)
    snapshot.name = (snapshot.name or "").strip() or snapshot.templateId
    ensure_templates_file()
    path = _templates_file_path()
    with _exclusive_lock(path):
        with open(path, "r", encoding="utf-8") as f:
            payload = json.load(f)
        items = payload.get("templates", [])
        replaced = False
        for i, x in enumerate(items):
            if x.get("templateId") == snapshot.templateId and x.get("version") == snapshot.version:
                items[i] = snapshot.model_dump()
                replaced = True
                break
        if not replaced:
            items.append(snapshot.model_dump())
        payload["templates"] = items
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)


def rename_template(template_id: str, name: str) -> bool:
    ensure_templates_file()
    path = _templates_file_path()
    with _exclusive_lock(path):
        with open(path, "r", encoding="utf-8") as f:
            payload = json.load(f)
        items = payload.get("templates", [])
        matched = False
        changed = False
        for i, x in enumerate(items):
            if x.get("templateId") != template_id:
                continue
            matched = True
            if x.get("name") != name:
                x["name"] = name
                items[i] = x
                changed = True
        if changed:
            payload["templates"] = items
            tmp = path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
            os.replace(tmp, path)
    if matched:
        rs = get_ruleset(template_id)
        if rs is not None and rs.name != name:
            rs.name = name
            upsert_ruleset(rs)
    return matched


def delete_template(template_id: str) -> bool:
    ensure_templates_file()
    path = _templates_file_path()
    with _exclusive_lock(path):
        with open(path, "r", encoding="utf-8") as f:
            payload = json.load(f)
        items = payload.get("templates", [])
        next_items = [x for x in items if x.get("templateId") != template_id]
        if len(next_items) == len(items):
            return False
        payload["templates"] = next_items
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)
    delete_ruleset(template_id)
    return True


def get_latest_template(template_id: str) -> Optional[TemplateSnapshot]:
    candidates = [t for t in list_templates() if t.templateId == template_id]
    if not candidates:
        return None
    candidates.sort(key=lambda x: x.version)
    return candidates[-1]


def match_templates(blocks: List[Block], top_n: int = 5) -> TemplateMatchResponse:
    latest_templates = _latest_templates_by_id()

    target_outline = _extract_outline_tokens(blocks)
    outline_candidates: List[TemplateMatchItem] = []
    if len(target_outline) >= 2:
        for t in latest_templates:
            tpl_outline = _extract_outline_tokens(t.blocks)
            if len(tpl_outline) < 2:
                continue
            score = SequenceMatcher(None, tpl_outline, target_outline).ratio()
            outline_candidates.append(
                TemplateMatchItem(
                    templateId=t.templateId,
                    name=t.name,
                    version=t.version,
                    score=float(score),
                )
            )
        outline_candidates.sort(key=lambda x: x.score, reverse=True)
        best = outline_candidates[0] if outline_candidates else None
        second = outline_candidates[1] if len(outline_candidates) > 1 else None
        if best and best.score >= settings.TEMPLATE_MATCH_OUTLINE_MIN_SCORE and (
            second is None or (best.score - second.score) >= settings.TEMPLATE_MATCH_OUTLINE_MIN_GAP
        ):
            boosted: List[TemplateMatchItem] = []
            for c in outline_candidates:
                base = settings.TEMPLATE_MATCH_OUTLINE_BOOST_BASE
                s = min(1.0, base + (1.0 - base) * float(c.score))
                boosted.append(
                    TemplateMatchItem(
                        templateId=c.templateId,
                        name=c.name,
                        version=c.version,
                        score=s,
                    )
                )
            trimmed = boosted[: max(1, int(top_n))]
            return TemplateMatchResponse(best=trimmed[0] if trimmed else None, candidates=trimmed)

    _, target_tokens = compute_signature(blocks)
    candidates: List[TemplateMatchItem] = []
    for t in latest_templates:
        _, tpl_tokens = compute_signature(t.blocks)
        score = SequenceMatcher(None, tpl_tokens, target_tokens).ratio()
        candidates.append(
            TemplateMatchItem(
                templateId=t.templateId,
                name=t.name,
                version=t.version,
                score=float(score),
            )
        )
    candidates.sort(key=lambda x: x.score, reverse=True)
    best = candidates[0] if candidates else None
    trimmed = candidates[: max(1, int(top_n))]
    return TemplateMatchResponse(best=best, candidates=trimmed)

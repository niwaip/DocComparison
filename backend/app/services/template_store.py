import hashlib
import json
import os
import re
import time
from contextlib import contextmanager
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Tuple

from app.models import Block, TemplateSnapshot, TemplateListItem, TemplateMatchItem, TemplateMatchResponse
from app.services.ruleset_store import delete_ruleset, get_ruleset, upsert_ruleset
from app.utils.text_utils import normalize_text, strip_section_noise


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
    for t in list_templates():
        item = by_id.get(t.templateId)
        if item is None:
            item = TemplateListItem(templateId=t.templateId, name=t.name, versions=[])
            by_id[t.templateId] = item
        if t.version not in item.versions:
            item.versions.append(t.version)
        if t.name and (not item.name or item.name == item.templateId):
            item.name = t.name
    out = list(by_id.values())
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
    _, target_tokens = compute_signature(blocks)
    candidates: List[TemplateMatchItem] = []
    for t in list_templates():
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

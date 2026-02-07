import hashlib
import io
import json
import os
import zipfile
from typing import Any, Dict, Optional, Tuple

from fastapi import HTTPException

from app.models import GlobalPromptConfig, Ruleset, TemplateSnapshot
from app.services.prompt_store import get_global_prompt_config, upsert_global_prompt_config
from app.services.ruleset_store import get_ruleset, upsert_ruleset
from app.services.template_store import get_template, get_latest_template, get_template_docx_path, upsert_template


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _canonical_json_bytes(obj: Any) -> bytes:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _compute_checksums(entries: Dict[str, bytes]) -> Dict[str, str]:
    return {path: _sha256_bytes(data) for path, data in entries.items()}


def _make_checksums_payload(file_hashes: Dict[str, str]) -> Dict[str, Any]:
    payload: Dict[str, Any] = {"schemaVersion": "1", "hashAlgorithm": "sha256", "files": dict(file_hashes)}
    payload["files"]["checksums.json"] = ""
    digest = _sha256_bytes(_canonical_json_bytes(payload))
    payload["files"]["checksums.json"] = digest
    return payload


def _verify_checksums_payload(checksums_payload: Dict[str, Any]) -> None:
    if str(checksums_payload.get("schemaVersion")) != "1":
        raise HTTPException(status_code=400, detail="checksums schemaVersion unsupported")
    if str(checksums_payload.get("hashAlgorithm")) != "sha256":
        raise HTTPException(status_code=400, detail="checksums hashAlgorithm unsupported")
    files = checksums_payload.get("files")
    if not isinstance(files, dict):
        raise HTTPException(status_code=400, detail="checksums files invalid")
    self_hash = files.get("checksums.json")
    if not isinstance(self_hash, str) or not self_hash:
        raise HTTPException(status_code=400, detail="checksums.json hash missing")
    tmp = dict(checksums_payload)
    tmp_files = dict(files)
    tmp_files["checksums.json"] = ""
    tmp["files"] = tmp_files
    expected = _sha256_bytes(_canonical_json_bytes(tmp))
    if expected != self_hash:
        raise HTTPException(status_code=400, detail="checksums.json self hash mismatch")


def export_skill_bundle(template_id: str, version: Optional[str] = None) -> Tuple[bytes, str]:
    tpl = get_template(template_id, version) if version else get_latest_template(template_id)
    if tpl is None:
        raise HTTPException(status_code=404, detail="template not found")

    rs = get_ruleset(template_id)
    if rs is None:
        rs = Ruleset(templateId=template_id, name=tpl.name, version=tpl.version, referenceData={}, points=[])

    prompts_cfg = get_global_prompt_config()
    system_prompt = (prompts_cfg.byTemplateId.get(template_id) or "").strip()

    manifest: Dict[str, Any] = {
        "schemaVersion": "1",
        "kind": "contract-skill",
        "skillId": tpl.templateId,
        "name": tpl.name,
        "skillVersion": tpl.version,
        "entrypoints": {
            "template": {
                "normalized": "template/normalized.template.json",
                "placeholders": "template/placeholder.schema.json",
            },
            "rules": {"ruleset": "rules/ruleset.json"},
            "prompts": {"pack": "prompts/pack.json"},
        },
        "integrity": {"checksums": "checksums.json"},
        "capabilities": [{"capabilityId": "host.contract.compare", "scope": "read-only"}],
        "extensions": {"rulesFormat": "pydantic-ruleset@1"},
    }

    tpl_docx_path = get_template_docx_path(template_id=tpl.templateId, version=tpl.version)
    if tpl_docx_path:
        manifest["entrypoints"]["assets"] = {"authoritativeDocx": "assets/template.docx"}

    normalized_tpl = tpl.model_dump()
    placeholder_schema = {"schemaVersion": "1", "syntax": {"primary": "{{FIELD_ID}}"}, "placeholders": []}
    ruleset_payload = rs.model_dump()
    prompts_pack = {
        "schemaVersion": "1",
        "prompts": [
            {
                "promptId": "global_analyze",
                "purpose": "analyze.global",
                "files": {"system": "prompts/system.md"},
                "allowOverride": True,
            }
        ],
    }
    tests_payload = {"schemaVersion": "1", "cases": []}

    entries: Dict[str, bytes] = {}
    entries["manifest.json"] = _canonical_json_bytes(manifest)
    entries["template/normalized.template.json"] = _canonical_json_bytes(normalized_tpl)
    entries["template/placeholder.schema.json"] = _canonical_json_bytes(placeholder_schema)
    entries["rules/ruleset.json"] = _canonical_json_bytes(ruleset_payload)
    entries["prompts/pack.json"] = _canonical_json_bytes(prompts_pack)
    entries["prompts/system.md"] = (system_prompt + "\n").encode("utf-8") if system_prompt else b""
    entries["tests/cases.json"] = _canonical_json_bytes(tests_payload)

    if tpl_docx_path:
        with open(tpl_docx_path, "rb") as f:
            entries["assets/template.docx"] = f.read()

    file_hashes = _compute_checksums(entries)
    checksums_payload = _make_checksums_payload(file_hashes)
    entries["checksums.json"] = _canonical_json_bytes(checksums_payload)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path, data in entries.items():
            zf.writestr(path, data)

    out_bytes = buf.getvalue()
    filename = f"{tpl.templateId}-{tpl.version}.cskill"
    return out_bytes, filename


def import_skill_bundle(bundle_bytes: bytes, overwrite_same_version: bool = False) -> Dict[str, Any]:
    with zipfile.ZipFile(io.BytesIO(bundle_bytes), mode="r") as zf:
        try:
            manifest_raw = zf.read("manifest.json")
        except KeyError:
            raise HTTPException(status_code=400, detail="manifest.json missing")

        try:
            manifest = json.loads(manifest_raw.decode("utf-8"))
        except Exception:
            raise HTTPException(status_code=400, detail="manifest.json invalid")

        if str(manifest.get("schemaVersion")) != "1":
            raise HTTPException(status_code=400, detail="manifest schemaVersion unsupported")
        if str(manifest.get("kind")) != "contract-skill":
            raise HTTPException(status_code=400, detail="manifest kind invalid")

        skill_id = str(manifest.get("skillId") or "").strip()
        skill_version = str(manifest.get("skillVersion") or "").strip()
        if not skill_id or not skill_version:
            raise HTTPException(status_code=400, detail="manifest skillId/skillVersion required")

        integrity = manifest.get("integrity") if isinstance(manifest.get("integrity"), dict) else {}
        checksums_path = str(integrity.get("checksums") or "checksums.json")
        try:
            checksums_raw = zf.read(checksums_path)
        except KeyError:
            raise HTTPException(status_code=400, detail="checksums.json missing")
        try:
            checksums_payload = json.loads(checksums_raw.decode("utf-8"))
        except Exception:
            raise HTTPException(status_code=400, detail="checksums.json invalid")

        _verify_checksums_payload(checksums_payload)
        files = checksums_payload.get("files") if isinstance(checksums_payload.get("files"), dict) else {}

        for p, expected in files.items():
            if not isinstance(p, str) or not isinstance(expected, str):
                raise HTTPException(status_code=400, detail="checksums files invalid")
            if p == "checksums.json":
                continue
            try:
                data = zf.read(p)
            except KeyError:
                raise HTTPException(status_code=400, detail=f"missing file: {p}")
            actual = _sha256_bytes(data)
            if actual != expected:
                raise HTTPException(status_code=400, detail=f"checksum mismatch: {p}")

        entrypoints = manifest.get("entrypoints") if isinstance(manifest.get("entrypoints"), dict) else {}
        template_ep = entrypoints.get("template") if isinstance(entrypoints.get("template"), dict) else {}
        normalized_path = str(template_ep.get("normalized") or "")
        if not normalized_path:
            raise HTTPException(status_code=400, detail="entrypoints.template.normalized missing")

        rules_ep = entrypoints.get("rules") if isinstance(entrypoints.get("rules"), dict) else {}
        ruleset_path = str(rules_ep.get("ruleset") or "")
        if not ruleset_path:
            raise HTTPException(status_code=400, detail="entrypoints.rules.ruleset missing")

        prompts_ep = entrypoints.get("prompts") if isinstance(entrypoints.get("prompts"), dict) else {}
        pack_path = str(prompts_ep.get("pack") or "")
        if not pack_path:
            raise HTTPException(status_code=400, detail="entrypoints.prompts.pack missing")

        tpl_raw = zf.read(normalized_path)
        rs_raw = zf.read(ruleset_path)
        pack_raw = zf.read(pack_path)

        try:
            tpl_payload = json.loads(tpl_raw.decode("utf-8"))
        except Exception:
            raise HTTPException(status_code=400, detail="normalized template invalid")
        try:
            ruleset_payload = json.loads(rs_raw.decode("utf-8"))
        except Exception:
            raise HTTPException(status_code=400, detail="ruleset invalid")
        try:
            pack_payload = json.loads(pack_raw.decode("utf-8"))
        except Exception:
            raise HTTPException(status_code=400, detail="prompt pack invalid")

        tpl = TemplateSnapshot.model_validate(tpl_payload)
        if tpl.templateId != skill_id or tpl.version != skill_version:
            raise HTTPException(status_code=400, detail="templateId/version mismatch to manifest")

        existing = get_template(skill_id, skill_version)
        if existing is not None and not overwrite_same_version:
            raise HTTPException(status_code=409, detail="skill already exists (use overwriteSameVersion)")

        rs = Ruleset.model_validate(ruleset_payload)
        if rs.templateId != skill_id:
            raise HTTPException(status_code=400, detail="ruleset templateId mismatch to manifest")

        system_path: Optional[str] = None
        try:
            prompts = pack_payload.get("prompts")
            if isinstance(prompts, list) and prompts:
                files_obj = prompts[0].get("files") if isinstance(prompts[0], dict) else None
                if isinstance(files_obj, dict) and isinstance(files_obj.get("system"), str):
                    system_path = str(files_obj.get("system"))
        except Exception:
            system_path = None

        system_prompt = ""
        if system_path:
            try:
                system_prompt = zf.read(system_path).decode("utf-8")
            except Exception:
                system_prompt = ""

        upsert_template(tpl)
        upsert_ruleset(rs)

        cfg = get_global_prompt_config()
        next_cfg = GlobalPromptConfig(defaultPrompt=cfg.defaultPrompt, byTemplateId=dict(cfg.byTemplateId))
        next_cfg.byTemplateId[skill_id] = (system_prompt or "").strip()
        upsert_global_prompt_config(next_cfg)

        assets_ep = entrypoints.get("assets") if isinstance(entrypoints.get("assets"), dict) else {}
        docx_rel = assets_ep.get("authoritativeDocx")
        if isinstance(docx_rel, str) and docx_rel:
            try:
                docx_bytes = zf.read(docx_rel)
                from app.services.template_store import save_template_docx

                save_template_docx(template_id=skill_id, version=skill_version, data=docx_bytes)
            except KeyError:
                raise HTTPException(status_code=400, detail="authoritativeDocx missing")

        return {"skillId": skill_id, "skillVersion": skill_version, "name": tpl.name}


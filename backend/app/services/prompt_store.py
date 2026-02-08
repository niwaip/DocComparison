import json
import os
import time
from contextlib import contextmanager
from typing import Any, Dict

from app.models import GlobalPromptConfig


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


def _store_dir() -> str | None:
    root = os.getenv("DOC_COMPARISON_DATA_DIR", "").strip()
    if root:
        d = os.path.join(root, "store")
    else:
        app_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        backend_dir = os.path.abspath(os.path.join(app_dir, ".."))
        d = os.path.join(backend_dir, "data", "store")
    os.makedirs(d, exist_ok=True)
    return d


def _prompts_file_path() -> str:
    store_dir = _store_dir()
    return os.path.join(store_dir, "prompts.json")


def _legacy_prompts_file_path() -> str:
    app_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    return os.path.join(app_dir, "prompts.json")


def _default_prompts_payload() -> Dict[str, Any]:
    return {"defaultPrompt": "", "byTemplateId": {}}


def ensure_prompts_file() -> None:
    path = _prompts_file_path()
    if os.path.exists(path):
        return
    with _exclusive_lock(path):
        if os.path.exists(path):
            return
        legacy = _legacy_prompts_file_path()
        if legacy != path and os.path.exists(legacy):
            with open(legacy, "r", encoding="utf-8") as f:
                payload = json.load(f)
            tmp = path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
            os.replace(tmp, path)
            return
        payload = _default_prompts_payload()
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)


def get_global_prompt_config() -> GlobalPromptConfig:
    ensure_prompts_file()
    path = _prompts_file_path()
    with open(path, "r", encoding="utf-8") as f:
        payload = json.load(f)
    try:
        return GlobalPromptConfig.model_validate(payload)
    except Exception:
        return GlobalPromptConfig()


def upsert_global_prompt_config(cfg: GlobalPromptConfig) -> None:
    ensure_prompts_file()
    path = _prompts_file_path()
    with _exclusive_lock(path):
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(cfg.model_dump(), f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)

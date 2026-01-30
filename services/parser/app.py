import os
import re
import tempfile
from typing import Any

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse
from unstructured.partition.auto import partition

app = FastAPI()


def _escape_html(s: str) -> str:
    return (
        str(s or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def _looks_like_title(text: str) -> bool:
    t = str(text or "").strip()
    if not t:
        return False
    if len(t) > 160:
        return False
    if re.match(r"^第[一二三四五六七八九十百千0-9]+[章节条部分篇]\b", t):
        return True
    if re.match(r"^[一二三四五六七八九十]+[、.．。]\s*\S+", t):
        return True
    if re.match(r"^\d+(?:[.．]\d+){1,}[.．。]?\s*\S+", t):
        return True
    if re.match(r"^[（(][一二三四五六七八九十]+[)）]\s*\S+", t):
        return True
    return False


def _looks_like_list_item(text: str) -> bool:
    t = str(text or "").strip()
    if not t:
        return False
    if re.match(r"^\d{1,3}\s*[.．。]\s*\S+", t):
        return True
    if re.match(r"^\d{1,3}\s*．\s*\S+", t):
        return True
    if re.match(r"^\d{1,3}\s*[)）]\s*\S+", t):
        return True
    if re.match(r"^[（(]\d{1,3}[)）]\s*\S+", t):
        return True
    return False


def _docx_table_to_html(table: Any) -> str:
    rows_html: list[str] = []
    for row in getattr(table, "rows", []):
        cells_html: list[str] = []
        for cell in getattr(row, "cells", []):
            cells_html.append(f"<td>{_escape_html(getattr(cell, 'text', '')).strip()}</td>")
        rows_html.append(f"<tr>{''.join(cells_html)}</tr>")
    return f"<table><tbody>{''.join(rows_html)}</tbody></table>"


def _docx_table_to_text(table: Any) -> str:
    lines: list[str] = []
    for row in getattr(table, "rows", []):
        cells = [str(getattr(cell, "text", "")).strip() for cell in getattr(row, "cells", [])]
        lines.append("\t".join(cells))
    return "\n".join(lines).strip()


def _docx_to_elements(path: str) -> list[dict[str, Any]] | None:
    try:
        from docx import Document
        from docx.table import Table
        from docx.text.paragraph import Paragraph
    except Exception:
        return None

    doc = Document(path)
    out: list[dict[str, Any]] = []
    body = doc.element.body
    for child in body.iterchildren():
        tag = str(getattr(child, "tag", "")).rsplit("}", 1)[-1]
        if tag == "p":
            p = Paragraph(child, doc)
            text = str(getattr(p, "text", "") or "").strip()
            if not text:
                continue
            style_name = str(getattr(getattr(p, "style", None), "name", "") or "")
            is_list_item = _looks_like_list_item(text)
            is_heading = (not is_list_item) and ("Heading" in style_name or _looks_like_title(text))
            out.append(
                {
                    "type": "ListItem" if is_list_item else ("Title" if is_heading else "NarrativeText"),
                    "text": text,
                    "metadata": {},
                }
            )
            continue
        if tag == "tbl":
            t = Table(child, doc)
            html = _docx_table_to_html(t)
            out.append({"type": "Table", "text": _docx_table_to_text(t), "metadata": {"text_as_html": html}})
            continue
    return out


def _table_html_from_text(text: str) -> str | None:
    t = str(text or "").replace("\r\n", "\n").replace("\r", "\n")
    lines = [x.strip() for x in t.split("\n")]
    lines = [x for x in lines if x]
    if len(lines) < 2:
        return None

    rows: list[list[str]] = []
    for line in lines[:120]:
        if "\t" in line:
            cells = [c.strip() for c in re.split(r"\t+", line) if c.strip()]
        else:
            cells = [c.strip() for c in re.split(r"[ ]{2,}", line) if c.strip()]
        if len(cells) >= 2:
            rows.append(cells[:24])

    if not rows:
        return None

    html_rows = []
    for r in rows:
        tds = "".join([f"<td>{c}</td>" for c in r])
        html_rows.append(f"<tr>{tds}</tr>")
    return f"<table><tbody>{''.join(html_rows)}</tbody></table>"


def _element_to_dict(el: Any) -> dict[str, Any]:
    if isinstance(el, dict):
        t = el.get("type") or el.get("category") or "Unknown"
        text = el.get("text") or ""
        meta_dict = el.get("metadata") or {}
        if t == "Table" and not meta_dict.get("text_as_html"):
            html = _table_html_from_text(str(text or ""))
            if html:
                meta_dict = dict(meta_dict)
                meta_dict["text_as_html"] = html
        return {"type": str(t), "text": str(text or ""), "metadata": meta_dict}

    t = getattr(el, "category", None) or el.__class__.__name__
    text = getattr(el, "text", None)
    meta = getattr(el, "metadata", None)
    meta_dict = meta.to_dict() if hasattr(meta, "to_dict") else {}
    if t == "Table" and not meta_dict.get("text_as_html"):
        html = _table_html_from_text(str(text or ""))
        if html:
            meta_dict = dict(meta_dict)
            meta_dict["text_as_html"] = html
    return {"type": t, "text": str(text or ""), "metadata": meta_dict}


@app.get("/healthcheck")
async def healthcheck():
    return {"ok": True}


@app.post("/general/v0/general")
async def general(
    files: list[UploadFile] = File(...),
    output_format: str = Form("application/json"),
    strategy: str = Form("auto"),
    pdf_infer_table_structure: str = Form("true"),
    skip_infer_table_types: str = Form("[]"),
):
    _ = output_format, pdf_infer_table_structure, skip_infer_table_types
    out: list[dict[str, Any]] = []

    for f in files:
        suffix = os.path.splitext(f.filename or "")[1] or ".bin"
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        tmp_path = tmp.name
        try:
            content = await f.read()
            tmp.write(content)
            tmp.close()
            try:
                elements = None
                if suffix.lower() == ".docx":
                    elements = _docx_to_elements(tmp_path)
                if elements is None:
                    elements = partition(filename=tmp_path, strategy=strategy)
            except TypeError:
                elements = partition(filename=tmp_path)
            out.extend([_element_to_dict(el) for el in elements])
        finally:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass

    return JSONResponse(out)

import copy
import json
import re

from app.services.doc_service import DocService
from app.services.diff_service import align_blocks


def main():
    left = DocService.parse_docx("/app/app/test_doc_secrecy.docx")
    right = copy.deepcopy(left)

    target = None
    for b in right:
        t = b.text or ""
        if "\n" in t and ("定义" in t or "专有信息" in t):
            target = b
            break

    if target is None:
        target = right[0]

    lines = (target.text or "").split("\n")
    insert_at = 0
    for i, l in enumerate(lines):
        if re.match(r"^\s*1\.3", l):
            lines[i] = "1.3 Bbbbb"
            insert_at = i + 1
            break

    if insert_at == 0:
        insert_at = min(3, len(lines))

    lines.insert(insert_at, "1.4 Bbbbb")
    lines.insert(insert_at + 1, "1.5 Aaaaaa")
    target.text = "\n".join(lines)

    rows = align_blocks(left, right)
    changed = [r for r in rows if r.kind == "changed"]

    out = {
        "rows": len(rows),
        "changed": len(changed),
        "first_changed": None,
    }

    if changed:
        r = changed[0]
        out["first_changed"] = {
            "rowId": r.rowId,
            "leftBlockId": r.leftBlockId,
            "rightBlockId": r.rightBlockId,
            "left_has_aligned": ("aligned-lines" in (r.leftDiffHtml or "")),
            "right_has_aligned": ("aligned-lines" in (r.rightDiffHtml or "")),
            "right_has_bbbbb_ins": ("<ins" in (r.rightDiffHtml or "") and "Bbbbb" in (r.rightDiffHtml or "")),
            "left_has_bbbbb_del": ("<del" in (r.leftDiffHtml or "") and "Bbbbb" in (r.leftDiffHtml or "")),
            "left_has_left_view": ("left-view" in (r.leftDiffHtml or "")),
            "right_has_right_view": ("right-view" in (r.rightDiffHtml or "")),
        }

    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

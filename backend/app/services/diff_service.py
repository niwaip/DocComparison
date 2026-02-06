import hashlib
import re
import html
from typing import List, Optional, Dict, Any, Tuple
from difflib import SequenceMatcher
from diff_match_patch import diff_match_patch
from app.models import Block, AlignmentRow, RowKind, BlockKind
from app.utils.text_utils import normalize_text, strip_section_noise, get_leading_section_label, escape_html, dice_coefficient

def sha1(text: str) -> str:
    return hashlib.sha1(text.encode('utf-8')).hexdigest()

def looks_like_tocish_line(t: str) -> bool:
    s = (t or "").strip()
    if not s:
        return False
    if re.search(r'(?:(?:\.\s*){3,}|\.{3,}|(?:…\s*){2,}|…{2,}|(?:·\s*){3,}|·{3,}|-{3,}|_{3,})\s*\d+\s*$', s):
        return True
    if re.search(r'\s{3,}\d+\s*$', s):
        return True
    return False

def get_align_key(b: Block, ignore_section_number: bool) -> str:
    if not ignore_section_number:
        return b.stableKey
    
    t = b.text or ""
    if not t:
        return b.stableKey
        
    normalized = re.sub(r'\s+', ' ', t.lower()).strip()
    stripped = re.sub(r'\s+', ' ', strip_section_noise(t).lower()).strip()
    
    if not stripped:
        return b.stableKey
    if stripped == normalized:
        return b.stableKey
        
    tocish = False
    if "\n" in t:
        if any(looks_like_tocish_line(x) for x in t.split('\n')):
            tocish = True
    else:
        tocish = looks_like_tocish_line(t)
        
    if len(stripped) < 10 and not tocish:
        return b.stableKey
        
    prefix = "toc:" if tocish else ""
    return f"k:{prefix}{sha1(stripped)}"

def extract_wrapper(html_fragment: str) -> Tuple[str, str]:
    """
    Extracts the opening and closing tags from a simple HTML fragment.
    e.g. "<p style='...'>text</p>" -> ("<p style='...'>", "</p>")
    """
    if not html_fragment:
        return "<div>", "</div>"
    
    # Match opening tag
    match_open = re.match(r'(<[^>]+>)', html_fragment)
    start_tag = match_open.group(1) if match_open else "<div>"
    
    # Match closing tag
    match_close = re.search(r'(</[^>]+>)$', html_fragment)
    end_tag = match_close.group(1) if match_close else "</div>"
    
    return start_tag, end_tag

def compute_inline_diff(text1: str, text2: str) -> Tuple[str, str]:
    """
    Compute inline diff and return (left_inner_html, right_inner_html).
    Left: Shows Equal + Deletions (styled).
    Right: Shows Equal + Insertions (styled).
    """
    dmp = diff_match_patch()
    diffs = dmp.diff_main(text1, text2)
    dmp.diff_cleanupSemantic(diffs)
    
    left_html = ""
    right_html = ""
    
    for op, text in diffs:
        text = escape_html(text)
        if op == -1: # DELETE
            # Show on Left (Red with Strikethrough), Hide on Right
            left_html += f"<del style='background:#ffebe9;color:#c92a2a;text-decoration:line-through;'>{text}</del>"
        elif op == 1: # INSERT
            # Hide on Left, Show on Right (Green)
            right_html += f"<ins style='background:#e6ffec;color:#216e39;text-decoration:none;'>{text}</ins>"
        else: # EQUAL
            # Show on Both
            left_html += text
            right_html += text
            
    return left_html, right_html

def _normalize_for_similarity(s: str) -> str:
    t = normalize_text(s or "")
    t = re.sub(r'\s+', ' ', t).strip().lower()
    return t

def _stripped_for_similarity(s: str) -> str:
    t = strip_section_noise(s or "")
    t = re.sub(r'\s+', ' ', t).strip().lower()
    return t

def _block_similarity(a: str, b: str) -> float:
    sa = _stripped_for_similarity(a)
    sb = _stripped_for_similarity(b)
    if not sa or not sb:
        return 0.0
    if sa == sb:
        return 1.0
    return dice_coefficient(sa, sb)

def _score_pair(left_text: str, right_text: str) -> float:
    sim = _block_similarity(left_text, right_text)
    l_label = get_leading_section_label(left_text)
    r_label = get_leading_section_label(right_text)
    bonus = 0.0
    if l_label and r_label:
        if l_label == r_label:
            bonus = 0.08
        else:
            bonus = -0.04
    return sim + bonus

def _align_segment_dp(
    left_seg: List[Block],
    right_seg: List[Block],
    gap_penalty: float = 0.35,
    min_match_score: float = 0.45,
) -> List[Tuple[Optional[int], Optional[int]]]:
    n = len(left_seg)
    m = len(right_seg)
    dp = [[0.0] * (m + 1) for _ in range(n + 1)]
    move = [[0] * (m + 1) for _ in range(n + 1)]

    for i in range(1, n + 1):
        dp[i][0] = dp[i - 1][0] - gap_penalty
        move[i][0] = 1
    for j in range(1, m + 1):
        dp[0][j] = dp[0][j - 1] - gap_penalty
        move[0][j] = 2

    for i in range(1, n + 1):
        for j in range(1, m + 1):
            s = _score_pair(left_seg[i - 1].text or "", right_seg[j - 1].text or "")
            match_score = dp[i - 1][j - 1] + (s if s >= min_match_score else (s - gap_penalty))
            del_score = dp[i - 1][j] - gap_penalty
            ins_score = dp[i][j - 1] - gap_penalty
            best = match_score
            best_move = 0
            if del_score > best:
                best = del_score
                best_move = 1
            if ins_score > best:
                best = ins_score
                best_move = 2
            dp[i][j] = best
            move[i][j] = best_move

    pairs: List[Tuple[Optional[int], Optional[int]]] = []
    i, j = n, m
    while i > 0 or j > 0:
        mv = move[i][j]
        if i > 0 and j > 0 and mv == 0:
            pairs.append((i - 1, j - 1))
            i -= 1
            j -= 1
        elif i > 0 and (j == 0 or mv == 1):
            pairs.append((i - 1, None))
            i -= 1
        else:
            pairs.append((None, j - 1))
            j -= 1

    pairs.reverse()
    return pairs

def _render_empty_line() -> str:
    return "<div class='aligned-line empty'>&nbsp;</div>"

def _render_line(html_inner: str, status: str = "") -> str:
    cls = "aligned-line"
    if status:
        cls += f" {status}"
    return f"<div class='{cls}'>{html_inner}</div>"

def _normalize_ws_key(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "")).strip()

def _extract_underline_leaders(html_fragment: str) -> Dict[str, str]:
    if not html_fragment:
        return {}

    leaders: Dict[str, str] = {}
    pattern = re.compile(
        r"<p[^>]*>(.*?)<span[^>]*text-decoration\s*:\s*underline[^>]*>([^<]*)</span>.*?</p>",
        flags=re.IGNORECASE | re.DOTALL,
    )
    for m in pattern.finditer(html_fragment):
        before = m.group(1) or ""
        spaces = m.group(2) or ""
        before_text = re.sub(r"<[^>]+>", "", before)
        before_text = html.unescape(before_text)
        key = _normalize_ws_key(before_text)
        if key:
            leaders[key] = spaces
    return leaders

def compute_block_aligned_diff(
    text1: str,
    text2: str,
    left_html_fragment: str = "",
    right_html_fragment: str = "",
) -> Tuple[str, str]:
    left_lines = (text1 or "").split("\n")
    right_lines = (text2 or "").split("\n")

    left_keys = [_stripped_for_similarity(x) for x in left_lines]
    right_keys = [_stripped_for_similarity(x) for x in right_lines]

    sm = SequenceMatcher(None, left_keys, right_keys)
    opcodes = sm.get_opcodes()

    left_leaders = _extract_underline_leaders(left_html_fragment)
    right_leaders = _extract_underline_leaders(right_html_fragment)

    rows: List[Tuple[str, str, str]] = []

    for tag, i1, i2, j1, j2 in opcodes:
        if tag == "equal":
            for k in range(i2 - i1):
                l = left_lines[i1 + k]
                r = right_lines[j1 + k]
                l_inner = escape_html(l)
                r_inner = escape_html(r)
                l_key = _normalize_ws_key(l)
                r_key = _normalize_ws_key(r)
                if l_key in left_leaders:
                    l_inner += f"<span style=\"text-decoration: underline\">{left_leaders[l_key]}</span>"
                if r_key in right_leaders:
                    r_inner += f"<span style=\"text-decoration: underline\">{right_leaders[r_key]}</span>"
                rows.append((l_inner, r_inner, "equal"))
        elif tag == "replace":
            count = min(i2 - i1, j2 - j1)
            for k in range(count):
                l = left_lines[i1 + k]
                r = right_lines[j1 + k]
                l_inner, r_inner = compute_inline_diff(l, r)
                l_key = _normalize_ws_key(l)
                r_key = _normalize_ws_key(r)
                if l_key in left_leaders:
                    l_inner += f"<span style=\"text-decoration: underline\">{left_leaders[l_key]}</span>"
                if r_key in right_leaders:
                    r_inner += f"<span style=\"text-decoration: underline\">{right_leaders[r_key]}</span>"
                rows.append((l_inner, r_inner, "changed"))
            if (i2 - i1) > count:
                for k in range(count, i2 - i1):
                    l = left_lines[i1 + k]
                    l_inner = f"<del style='background:#ffebe9;color:#c92a2a;text-decoration:line-through;'>{escape_html(l)}</del>"
                    rows.append((l_inner, "&nbsp;", "deleted"))
            if (j2 - j1) > count:
                for k in range(count, j2 - j1):
                    r = right_lines[j1 + k]
                    r_inner = f"<ins style='background:#e6ffec;color:#216e39;text-decoration:none;'>{escape_html(r)}</ins>"
                    rows.append(("&nbsp;", r_inner, "inserted"))
        elif tag == "delete":
            for k in range(i1, i2):
                l = left_lines[k]
                l_inner = f"<del style='background:#ffebe9;color:#c92a2a;text-decoration:line-through;'>{escape_html(l)}</del>"
                rows.append((l_inner, "&nbsp;", "deleted"))
        elif tag == "insert":
            for k in range(j1, j2):
                r = right_lines[k]
                r_inner = f"<ins style='background:#e6ffec;color:#216e39;text-decoration:none;'>{escape_html(r)}</ins>"
                rows.append(("&nbsp;", r_inner, "inserted"))

    left_rows = []
    right_rows = []
    for l_html, r_html, kind in rows:
        l_cell = f"<div class='aligned-cell-inner'>{l_html}</div>"
        r_cell = f"<div class='aligned-cell-inner'>{r_html}</div>"
        left_rows.append("<tr>" f"<td class='aligned-col left-col {kind}'>{l_cell}</td>" "</tr>")
        right_rows.append("<tr>" f"<td class='aligned-col right-col {kind}'>{r_cell}</td>" "</tr>")

    left_table = "<table class='aligned-table one-col left-view'>" + "".join(left_rows) + "</table>"
    right_table = "<table class='aligned-table one-col right-view'>" + "".join(right_rows) + "</table>"
    left_view = "<div class='aligned-lines'>" + left_table + "</div>"
    right_view = "<div class='aligned-lines'>" + right_table + "</div>"
    return left_view, right_view

def align_blocks(left: List[Block], right: List[Block], ignore_section_number: bool = True) -> List[AlignmentRow]:
    left_keys = [get_align_key(b, ignore_section_number) for b in left]
    right_keys = [get_align_key(b, ignore_section_number) for b in right]
    
    sm = SequenceMatcher(None, left_keys, right_keys)
    opcodes = sm.get_opcodes()
    
    rows = []
    next_row = 1
    li = 0
    ri = 0
    
    for tag, i1, i2, j1, j2 in opcodes:
        if tag == 'equal':
            count = i2 - i1
            for _ in range(count):
                rows.append(AlignmentRow(
                    rowId=f"r_{str(next_row).zfill(4)}",
                    kind=RowKind.MATCHED,
                    leftBlockId=left[li].blockId,
                    rightBlockId=right[ri].blockId
                ))
                li += 1
                ri += 1
                next_row += 1
        elif tag == 'replace':
            left_seg = left[i1:i2]
            right_seg = right[j1:j2]
            pairs = _align_segment_dp(left_seg, right_seg)

            for lp, rp in pairs:
                if lp is None and rp is not None:
                    r_block = right_seg[rp]
                    rows.append(AlignmentRow(
                        rowId=f"r_{str(next_row).zfill(4)}",
                        kind=RowKind.INSERTED,
                        leftBlockId=None,
                        rightBlockId=r_block.blockId
                    ))
                    next_row += 1
                    continue

                if rp is None and lp is not None:
                    l_block = left_seg[lp]
                    rows.append(AlignmentRow(
                        rowId=f"r_{str(next_row).zfill(4)}",
                        kind=RowKind.DELETED,
                        leftBlockId=l_block.blockId,
                        rightBlockId=None
                    ))
                    next_row += 1
                    continue

                if lp is None or rp is None:
                    continue

                l_block = left_seg[lp]
                r_block = right_seg[rp]
                if _normalize_for_similarity(l_block.text or "") == _normalize_for_similarity(r_block.text or ""):
                    rows.append(AlignmentRow(
                        rowId=f"r_{str(next_row).zfill(4)}",
                        kind=RowKind.MATCHED,
                        leftBlockId=l_block.blockId,
                        rightBlockId=r_block.blockId
                    ))
                    next_row += 1
                    continue

                is_table = False
                try:
                    is_table = l_block.kind == BlockKind.TABLE or r_block.kind == BlockKind.TABLE
                except Exception:
                    is_table = False

                if not is_table:
                    lf = (l_block.htmlFragment or "").lower()
                    rf = (r_block.htmlFragment or "").lower()
                    if "<table" in lf or "<table" in rf:
                        is_table = True

                if is_table:
                    left_diff_html = l_block.htmlFragment or escape_html(l_block.text or "")
                    right_diff_html = r_block.htmlFragment or escape_html(r_block.text or "")
                else:
                    left_diff_html, right_diff_html = compute_block_aligned_diff(
                        l_block.text or "",
                        r_block.text or "",
                        l_block.htmlFragment or "",
                        r_block.htmlFragment or "",
                    )

                rows.append(AlignmentRow(
                    rowId=f"r_{str(next_row).zfill(4)}",
                    kind=RowKind.CHANGED,
                    leftBlockId=l_block.blockId,
                    rightBlockId=r_block.blockId,
                    leftDiffHtml=left_diff_html,
                    rightDiffHtml=right_diff_html
                ))
                next_row += 1

            li = i2
            ri = j2

        elif tag == 'delete':
            for _ in range(i1, i2):
                rows.append(AlignmentRow(
                    rowId=f"r_{str(next_row).zfill(4)}",
                    kind=RowKind.DELETED,
                    leftBlockId=left[li].blockId,
                    rightBlockId=None
                ))
                li += 1
                next_row += 1
        elif tag == 'insert':
            for _ in range(j1, j2):
                rows.append(AlignmentRow(
                    rowId=f"r_{str(next_row).zfill(4)}",
                    kind=RowKind.INSERTED,
                    leftBlockId=None,
                    rightBlockId=right[ri].blockId
                ))
                ri += 1
                next_row += 1
                
    return rows

import hashlib
import re
import os
import shutil
import html
import docx
from docx.document import Document
from docx.text.paragraph import Paragraph
from docx.table import Table
from docx.oxml.text.paragraph import CT_P
from docx.oxml.table import CT_Tbl
from docx.oxml.ns import qn
from docx.shared import Pt
from typing import List, Dict, Optional, Tuple, Any
from app.models import Block, BlockKind, BlockMeta

def normalize_text(text: str) -> str:
    """Normalize text by trimming and removing excessive whitespace."""
    if not text:
        return ""
    # Replace non-breaking spaces and other weird whitespace
    t = text.replace('\xa0', ' ').replace('\u3000', ' ')
    t = re.sub(r'\s+', ' ', t).strip()
    return t

def sha1(text: str) -> str:
    return hashlib.sha1(text.encode('utf-8')).hexdigest()

def iter_block_items(parent):
    """
    Yield each paragraph and table child within *parent*, in document order.
    Each returned value is an instance of either Table or Paragraph.
    """
    if isinstance(parent, Document):
        parent_elm = parent.element.body
    elif isinstance(parent, _Cell):
        parent_elm = parent._tc
    else:
        # Fallback for Document object passed directly
        try:
             parent_elm = parent.element.body
        except:
             raise ValueError("something's not right")

    for child in parent_elm.iterchildren():
        if isinstance(child, CT_P):
            yield Paragraph(child, parent)
        elif isinstance(child, CT_Tbl):
            yield Table(child, parent)

class DocService:
    @staticmethod
    def _to_chinese_numeral(n: int) -> str:
        chars = ["〇", "一", "二", "三", "四", "五", "六", "七", "八", "九"]
        units = ["", "十", "百", "千"]
        if n == 0: return chars[0]
        
        s = ""
        n_str = str(n)
        length = len(n_str)
        
        # Simple implementation for 1-99 (common in legal docs)
        if n < 10:
            return chars[n]
        elif n < 20:
            return "十" + (chars[n-10] if n > 10 else "")
        elif n < 100:
            tens = n // 10
            rem = n % 10
            return chars[tens] + "十" + (chars[rem] if rem > 0 else "")
        else:
            return str(n) # Fallback

    @staticmethod
    def _load_numbering_meta(doc: Document) -> Tuple[Dict[int, Dict[int, Tuple[str, str]]], Dict[int, str], Dict[int, Dict[int, int]]]:
        """
        Returns:
          - formats: numId -> {ilvl: (numFmt, lvlText)}
          - num_to_abs: numId -> abstractNumId
          - starts: numId -> {ilvl: startVal}
        """
        formats: Dict[int, Dict[int, Tuple[str, str]]] = {}
        num_to_abs: Dict[int, str] = {}
        starts: Dict[int, Dict[int, int]] = {}
        try:
            numbering_part = doc.part.numbering_part
        except:
            return {}, {}, {}

        abs_meta: Dict[str, Dict[int, Tuple[str, str, int]]] = {}
        for abstract_num in numbering_part.element.findall(qn('w:abstractNum')):
            abs_id = abstract_num.get(qn('w:abstractNumId'))
            if abs_id is None:
                continue
            lvl_map: Dict[int, Tuple[str, str, int]] = {}
            for lvl in abstract_num.findall(qn('w:lvl')):
                ilvl_attr = lvl.get(qn('w:ilvl'))
                if ilvl_attr is None:
                    continue
                ilvl = int(ilvl_attr)

                num_fmt = "decimal"
                fmt_elem = lvl.find(qn('w:numFmt'))
                if fmt_elem is not None:
                    num_fmt = fmt_elem.get(qn('w:val'))

                lvl_text = "%1."
                txt_elem = lvl.find(qn('w:lvlText'))
                if txt_elem is not None:
                    lvl_text = txt_elem.get(qn('w:val'))

                start_val = 1
                start_elem = lvl.find(qn('w:start'))
                if start_elem is not None and start_elem.get(qn('w:val')) is not None:
                    try:
                        start_val = int(start_elem.get(qn('w:val')))
                    except Exception:
                        start_val = 1

                lvl_map[ilvl] = (num_fmt, lvl_text, start_val)

            abs_meta[str(abs_id)] = lvl_map

        for num in numbering_part.element.findall(qn('w:num')):
            try:
                num_id = int(num.numId)
            except Exception:
                continue
            abs_ref = num.find(qn('w:abstractNumId'))
            if abs_ref is not None:
                abs_id = abs_ref.get(qn('w:val'))
                if abs_id is None:
                    continue
                num_to_abs[num_id] = str(abs_id)

                meta = abs_meta.get(str(abs_id)) or {}
                fmt_out: Dict[int, Tuple[str, str]] = {}
                start_out: Dict[int, int] = {}
                for ilvl, (fmt, txt, st) in meta.items():
                    fmt_out[ilvl] = (fmt, txt)
                    start_out[ilvl] = int(st) if st else 1

                for lvl_override in num.findall(qn("w:lvlOverride")):
                    ilvl_attr = lvl_override.get(qn("w:ilvl"))
                    if ilvl_attr is None:
                        continue
                    ilvl = int(ilvl_attr)
                    so = lvl_override.find(qn("w:startOverride"))
                    if so is not None and so.get(qn("w:val")) is not None:
                        try:
                            start_out[ilvl] = int(so.get(qn("w:val")))
                        except Exception:
                            pass

                formats[num_id] = fmt_out
                starts[num_id] = start_out

        return formats, num_to_abs, starts

    @staticmethod
    def parse_docx(file_path: str) -> List[Block]:
        """
        Parse docx file directly using python-docx into Blocks.
        Replaces convert_docx_to_html + parse_blocks.
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        doc = docx.Document(file_path)
        nodes = []
        
        # Load Numbering Formats
        numbering_formats, num_to_abs, numbering_starts = DocService._load_numbering_meta(doc)
        
        # Per-List Counter: numId -> {ilvl: count}
        list_states = {}
        
        # Iterate over all block-level elements (paragraphs and tables)
        idx = 0
        for block in iter_block_items(doc):
            if isinstance(block, Paragraph):
                text = block.text.strip()
                if not text:
                    continue
                
                # Determine Kind and Level
                style_name = block.style.name
                kind = BlockKind.PARAGRAPH
                level = None
                
                # Check for Headings
                if style_name.startswith('Heading'):
                    try:
                        level = int(style_name.split(' ')[-1])
                        kind = BlockKind.HEADING
                    except:
                        pass
                
                # Check for List Items
                num_id = None
                ilvl = 0
                indent_pt = 0
                
                # Extract Indentation (Left and First Line)
                indent_pt = 0
                first_line_indent_pt = 0
                
                if block.paragraph_format.left_indent:
                    indent_pt = block.paragraph_format.left_indent.pt
                
                if block.paragraph_format.first_line_indent:
                    first_line_indent_pt = block.paragraph_format.first_line_indent.pt
                
                if block._element.pPr is not None and block._element.pPr.numPr is not None:
                    numPr = block._element.pPr.numPr
                    if numPr.numId is not None:
                        num_id = numPr.numId.val
                    if numPr.ilvl is not None:
                        ilvl = numPr.ilvl.val if numPr.ilvl.val is not None else 0
                    
                    # If it has numbering, treat as LIST_ITEM
                    if num_id is not None:
                        kind = BlockKind.LIST_ITEM
                
                # Construct structurePath based on ilvl/kind
                if kind == BlockKind.LIST_ITEM:
                    if num_id not in list_states:
                         list_states[num_id] = {}
                    
                    # Ensure counters are initialized for structure path usage
                    # Note: We increment later for numbering, but we need an index for structurePath
                    # Let's use a separate tracker for structure index to avoid messing up numbering?
                    # Actually, if we use the same counter logic, we need to be careful.
                    # Simplified: Just append a global counter for this level to differentiate
                    pass 

                # Generate Numbering Prefix if it's a list item
                prefix = ""
                if kind == BlockKind.LIST_ITEM and num_id is not None:
                    if num_id not in list_states:
                        list_states[num_id] = {}
                    
                    counters = list_states[num_id]
                    
                    # Increment current level
                    if ilvl not in counters:
                        start_val = numbering_starts.get(num_id, {}).get(ilvl)
                        if start_val is not None:
                            counters[ilvl] = max(0, int(start_val) - 1)
                    counters[ilvl] = counters.get(ilvl, 0) + 1
                    
                    # Reset deeper levels
                    for l in list(counters.keys()):
                        if l > ilvl:
                            counters[l] = 0
                    
                    # Generate hierarchical label
                    # Check if we have a specific format
                    fmt_def = numbering_formats.get(num_id, {}).get(ilvl, ("decimal", "%1."))
                    num_fmt, lvl_text = fmt_def
                    
                    # Handle Chinese Counting
                    if num_fmt in ["chineseCounting", "chineseCountingThousand", "ideographTraditional", "japaneseCounting", "japaneseCountingThousand"]:
                        # Single level formatting (e.g. "一、")
                        c = counters.get(ilvl, 1)
                        c_str = DocService._to_chinese_numeral(c)
                        
                        # Determine separator
                        sep = ""
                        if "、" in lvl_text: sep = "、"
                        elif "." in lvl_text: sep = "."
                        elif " " in lvl_text: sep = " "
                        
                        label = f"{c_str}{sep}"
                    else:
                        # Use lvl_text pattern if available (e.g. "%1.", "%1)", "(%1)")
                        # Replace %1, %2, etc. with counters
                        if lvl_text and "%" in lvl_text:
                            label = lvl_text
                            for i in range(ilvl + 1):
                                c = counters.get(i, 1)
                                label = label.replace(f"%{i+1}", str(c))
                        else:
                            # Fallback to standard hierarchical (1.1.1)
                            parts = []
                            for i in range(ilvl + 1):
                                c = counters.get(i, 0)
                                if c == 0: c = 1
                                parts.append(str(c))
                            
                            label = ".".join(parts)
                            # Add trailing dot for Top Level only
                            if ilvl == 0:
                                label += "."
                    
                    # Heuristic: If text already starts with numbering, don't double add.
                    if not (re.match(r'^\s*[\d\.]+\s', text) or re.match(r'^\s*[一二三四五六七八九十]+[、\.]', text)):
                         # Preamble Hack: If text contains "经友好协商" and is early in doc, SKIP numbering
                         if "经友好协商" in text and idx < 20:
                             prefix = ""
                         else:
                             prefix = f"{label} "

                # Re-construct structurePath with index to ensure separation
                if kind == BlockKind.LIST_ITEM:
                    # Use the counter we just incremented/retrieved
                    c = list_states.get(num_id, {}).get(ilvl, 0)
                    path_parts = ["body"]
                    # We only care about differentiating siblings.
                    # For nested structure, ideally we include parent index, but we don't track parent index easily here.
                    # We will use flat index for the current level to distinguish siblings.
                    for i in range(ilvl + 1):
                        # This is an approximation. Ideally we want: ol[0].li[Counter_Level_0].ol[0].li[Counter_Level_1]
                        # We will use the counters we have.
                        lvl_idx = list_states.get(num_id, {}).get(i, 0)
                        # Ensure 0-based index for path
                        idx_val = max(0, lvl_idx - 1)
                        path_parts.append(f"ol[{num_id}]")
                        path_parts.append(f"li[{idx_val}]")
                    structure_path = ".".join(path_parts)
                else:
                    structure_path = f"body.p[{idx}]"


                # HTML Fragment generation
                html_tag = 'p'
                if kind == BlockKind.HEADING and level:
                    html_tag = f'h{level}'
                
                # Prepend prefix to text and HTML
                final_text = prefix + text
                style_attr = ""

                html_inner: str
                has_underlined_run = any(bool(getattr(r, "underline", False)) for r in block.runs)
                if has_underlined_run:
                    run_parts: List[str] = []
                    stripped_leading = False
                    for r in block.runs:
                        t = r.text or ""
                        if t == "":
                            continue
                        if not stripped_leading and not bool(getattr(r, "underline", False)):
                            t = re.sub(r"^[\s\u00a0\u3000]+", "", t)
                            stripped_leading = True
                        escaped = html.escape(t, quote=False)
                        style: List[str] = []
                        if getattr(r, "bold", False):
                            style.append("font-weight: 700")
                        if getattr(r, "italic", False):
                            style.append("font-style: italic")
                        if getattr(r, "underline", False):
                            style.append("text-decoration: underline")
                        if style:
                            run_parts.append(f"<span style=\"{'; '.join(style)}\">{escaped}</span>")
                        else:
                            run_parts.append(escaped)

                    html_inner = html.escape(prefix, quote=False) + "".join(run_parts)
                    html_content = f"<{html_tag}{style_attr}>{html_inner}</{html_tag}>"
                else:
                    html_inner = html.escape(final_text, quote=False)
                    html_content = f"<{html_tag}{style_attr}>{html_inner}</{html_tag}>"

                nodes.append({
                    "kind": kind,
                    "headingLevel": level,
                    "structurePath": structure_path,
                    "html": html_content,
                    "html_inner": html_inner,
                    "text": normalize_text(final_text),
                    "ilvl": ilvl if kind == BlockKind.LIST_ITEM else None,
                    "indent_pt": indent_pt,
                    "first_line_indent_pt": first_line_indent_pt,
                    "num_fmt": num_fmt if kind == BlockKind.LIST_ITEM else None,
                    "num_id": num_id if kind == BlockKind.LIST_ITEM else None,
                    "abs_id": num_to_abs.get(num_id) if kind == BlockKind.LIST_ITEM and num_id is not None else None
                })
                
            elif isinstance(block, Table):
                # Handle Table
                rows_text = []
                html_rows = []
                
                for row in block.rows:
                    cells_text = []
                    row_html_parts = []
                    
                    seen_tcs = set()
                    
                    for cell in row.cells:
                        # Detect Merged Cells by TC identity
                        tc_id = id(cell._tc)
                        if tc_id in seen_tcs:
                            continue # Skip duplicate cell access in merged range
                        seen_tcs.add(tc_id)
                        
                        # Get Text
                        cell_txt = cell.text.strip().replace('\n', ' ')
                        cells_text.append(cell_txt)
                        
                        # Handle Colspan
                        colspan_attr = ""
                        try:
                            tcPr = cell._tc.get_or_add_tcPr()
                            gridSpan = tcPr.find(qn('w:gridSpan'))
                            if gridSpan is not None:
                                span_val = int(gridSpan.get(qn('w:val')))
                                if span_val > 1:
                                    colspan_attr = f" colspan='{span_val}'"
                        except:
                            pass
                            
                        row_html_parts.append(f"<td{colspan_attr}>{cell.text.strip()}</td>")
                    
                    rows_text.append(" | ".join(cells_text))
                    html_rows.append(f"<tr>{''.join(row_html_parts)}</tr>")
                
                table_text = "\n".join(rows_text)
                table_html = f"<table border='1'>{''.join(html_rows)}</table>"
                
                nodes.append({
                    "kind": BlockKind.TABLE,
                    "headingLevel": None,
                    "structurePath": f"body.table[{idx}]",
                    "html": table_html,
                    "text": normalize_text(table_text),
                    "indent_pt": 0
                })
            
            idx += 1
            
        # Restore Numbering Logic - DISABLED because we do it inline now
        # DocService._restore_heading_numbering(nodes)

        # Normalize Indentation (data only; rendering happens in frontend)
        DocService._normalize_indentation(nodes)
        
        # Aggressive Section Merging (Top-Level Grouping)
        return DocService._merge_nodes(doc, nodes)

    @staticmethod
    def _normalize_indentation(nodes: List[Dict]):
        """
        Normalize indentation for list items to ensure consistency.
        1. Group by (numId, ilvl).
        2. Find max indentation in each group.
        3. Apply max indentation to all items in group.
        4. Apply minimum hierarchy indentation (ilvl * 24pt).
        """
        groups = {} # (numId, ilvl) -> { 'max_left': 0, 'max_first': 0 }
        
        # Pass 1: Collect Stats
        for n in nodes:
            if n['kind'] == BlockKind.LIST_ITEM and n.get('num_id') is not None:
                key = (n.get('abs_id') or n['num_id'], n['ilvl'])
                if key not in groups:
                    groups[key] = {'max_left': 0, 'max_first': 0}
                
                curr_left = n.get('indent_pt', 0) or 0
                curr_first = n.get('first_line_indent_pt', 0) or 0
                
                # We prioritize the "standard" hanging indent (positive left, negative first)
                # If current is bigger, take it.
                if curr_left > groups[key]['max_left']:
                    groups[key]['max_left'] = curr_left
                    # Usually if we take the left from a node, we should take its first_line too to keep style consistent
                    groups[key]['max_first'] = curr_first
        
        # Pass 2: Apply Stats & Heuristics
        for n in nodes:
            if n['kind'] == BlockKind.LIST_ITEM and n.get('num_id') is not None:
                key = (n.get('abs_id') or n['num_id'], n['ilvl'])
                stats = groups.get(key)
                if stats:
                    # Apply Group Max
                    n['indent_pt'] = stats['max_left']
                    n['first_line_indent_pt'] = stats['max_first']
                    
                    # Apply Minimum Hierarchy Heuristic
                    # If indentation is 0 (after normalization), enforce hierarchy
                    # Base unit: 24pt (approx 2 chars)
                    # But if Level 0 is at 0pt, Level 1 should be at 24pt.
                    ilvl = n.get('ilvl') or 0
                    min_indent = ilvl * 24.0
                    
                    if n['indent_pt'] < min_indent:
                        n['indent_pt'] = min_indent
                        # If we forced indentation, reset first_line to 0 to avoid weirdness, 
                        # unless it was already set.
                        if n['first_line_indent_pt'] == 0:
                            n['first_line_indent_pt'] = 0 # Explicit 0
                
    @staticmethod
    def _merge_nodes(doc: Document, nodes: List[Dict]) -> List[Block]:
        chinese_formats = ["chineseCounting", "chineseCountingThousand", "ideographTraditional", "japaneseCounting", "japaneseCountingThousand"]

        def _is_soft_section_title_text(text: str) -> bool:
            t = (text or "").strip()
            if not t:
                return False
            if re.match(r"^\s*[一二三四五六七八九十百千]+、", t):
                return True
            if re.match(r"^\s*第[一二三四五六七八九十0-9]+[条章]", t):
                return True
            if re.match(r"^\s*(合同附则|合同附則)\s*[：:]?\s*$", t):
                return True
            return False

        def _is_soft_section_title_node(node: Optional[Dict]) -> bool:
            if not node:
                return False
            if node.get("kind") == BlockKind.HEADING and node.get("headingLevel") == 1:
                return True
            if node.get("kind") == BlockKind.PARAGRAPH and _is_soft_section_title_text(node.get("text", "")):
                return True
            if node.get("kind") == BlockKind.LIST_ITEM:
                ilvl = node.get("ilvl") or 0
                if ilvl == 0 and node.get("num_fmt") in chinese_formats:
                    return True
                if _is_soft_section_title_text(node.get("text", "")):
                    return True
            return False

        merged_nodes = []
        current_node = None
        
        # Track indentation of the current "Top Level" block
        current_top_indent = 0
        
        for n in nodes:
            t = n['text']
            is_start = False
            
            # Determine indentation/level
            indent = n.get('indent_pt', 0)
            
            # Check for Heading Level 1
            if n['kind'] == BlockKind.HEADING and n.get('headingLevel') == 1:
                is_start = True
                current_top_indent = indent
                
            # Check for List Item
            elif n['kind'] == BlockKind.LIST_ITEM:
                 # Only start new block if Top Level (ilvl == 0)
                 ilvl = n.get('ilvl', 0)
                 if ilvl > 0:
                     # Always merge sub-levels
                     is_start = False
                 else:
                     current_is_section_title = _is_soft_section_title_node(current_node)
                     if current_is_section_title:
                         is_start = _is_soft_section_title_node(n)
                     else:
                         # Level 0 Logic
                         # Check for Chinese Parent -> Decimal Child pattern (e.g. Sales Contract)
                         current_num_fmt = n.get('num_fmt')
                         
                         previous_node_fmt = None
                         if current_node and current_node.get('kind') == BlockKind.LIST_ITEM:
                             previous_node_fmt = current_node.get('num_fmt')
                         
                         is_chinese_parent = previous_node_fmt in chinese_formats
                         is_decimal_child = current_num_fmt == "decimal"
                         
                         if is_chinese_parent and is_decimal_child:
                             is_start = False # Merge sibling decimal into Chinese parent
                         else:
                             is_start = True # Default behavior for Level 0 (Start new block)
            
            # Fallback Regex - Only if we haven't decided it's a child
            # If logic above said is_start=False (Child), we respect that.
            # If logic above said nothing (e.g. Paragraph), we check regex.
            if n['kind'] == BlockKind.PARAGRAPH:
                 if _is_soft_section_title_text(t):
                     is_start = True
                     current_top_indent = indent

            # Preamble: First node starts the first block if none exists
            if current_node is None:
                is_start = True
                current_top_indent = indent
                
            if is_start:
                if current_node:
                    merged_nodes.append(current_node)
                current_node = n
            else:
                current_node['text'] += "\n" + n['text']
                current_node['html'] += n['html']
                # structurePath stays as start node
        
        if current_node:
            merged_nodes.append(current_node)
        
        blocks: List[Block] = []
        next_block_index = 1

        for n in merged_nodes:
            if not n["text"] and n["kind"] != BlockKind.TABLE:
                continue

            block_id = f"b_{str(next_block_index).zfill(4)}"
            next_block_index += 1

            stable_key = sha1(f"{n['kind']}:{n['text']}")

            blocks.append(
                Block(
                    blockId=block_id,
                    kind=n["kind"],
                    structurePath=n["structurePath"],
                    stableKey=stable_key,
                    text=n["text"],
                    htmlFragment=n["html"],
                    meta=BlockMeta(headingLevel=n["headingLevel"]),
                )
            )

        extra_texts: List[str] = []
        def _is_page_marker(s: str) -> bool:
            t = (s or "").strip()
            if not t:
                return True
            compact = re.sub(r"\s+", "", t)
            if re.fullmatch(r"\d{1,4}", compact):
                return True
            if re.fullmatch(r"[—-]{1,6}\d{1,4}[—-]{1,6}", compact):
                return True
            if re.search(r"第\s*\d+\s*页", t):
                return True
            if re.search(r"\bpage\s*\d+\b", t, flags=re.IGNORECASE):
                return True
            return False
        try:
            doc_el = doc.element
            for txbx in doc_el.iter(qn("w:txbxContent")):
                for p in txbx.iter(qn("w:p")):
                    parts: List[str] = []
                    for t in p.iter(qn("w:t")):
                        if t.text:
                            parts.append(t.text)
                    raw = "".join(parts).strip()
                    if raw and not _is_page_marker(raw):
                        extra_texts.append(normalize_text(raw))
        except Exception:
            extra_texts = []

        try:
            for sec in getattr(doc, "sections", []) or []:
                header = getattr(sec, "header", None)
                footer = getattr(sec, "footer", None)
                header_paras = list(getattr(header, "paragraphs", []) or []) if header is not None else []
                footer_paras = list(getattr(footer, "paragraphs", []) or []) if footer is not None else []
                for p in header_paras + footer_paras:
                    s = (p.text or "").strip()
                    if s and not _is_page_marker(s):
                        extra_texts.append(normalize_text(s))
        except Exception:
            pass

        if extra_texts:
            def _norm_key(s: str) -> str:
                return re.sub(r"\s+", "", (s or "")).strip()

            seen: set[str] = set()
            for n in nodes:
                try:
                    nt = (n.get("text") or "").strip()
                except Exception:
                    nt = ""
                if not nt:
                    continue
                for line in nt.split("\n"):
                    k = _norm_key(line)
                    if k:
                        seen.add(k)

            unique: List[str] = []
            for s in extra_texts:
                k = _norm_key(s)
                if not k or k in seen:
                    continue
                seen.add(k)
                unique.append(s)

            if unique:
                joined_text = "\n".join(unique)
                joined_html = "".join([f"<p>{html.escape(s, quote=False)}</p>" for s in unique])
                block_id = f"b_{str(next_block_index).zfill(4)}"
                next_block_index += 1
                blocks.append(
                    Block(
                        blockId=block_id,
                        kind=BlockKind.PARAGRAPH,
                        structurePath="body.extra",
                        stableKey=sha1(f"{BlockKind.PARAGRAPH}:{joined_text}"),
                        text=joined_text,
                        htmlFragment=joined_html,
                        meta=BlockMeta(headingLevel=None),
                    )
                )

        return blocks
    
    @staticmethod
    def _restore_heading_numbering(nodes: List[Dict]):
        # Kept for reference but not used
        pass

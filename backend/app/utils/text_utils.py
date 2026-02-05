import re
import html

def normalize_text(input_str: str) -> str:
    if not input_str:
        return ""
    out = input_str.replace("\r\n", "\n")
    out = re.sub(r'[^\S\n]+', ' ', out)
    out = re.sub(r'\n{3,}', '\n\n', out)
    out = out.strip()
    
    # Remove space before punctuation
    out = re.sub(r'\s+([:：∶︰﹕,，。;；、\)\]）])', r'\1', out)
    out = re.sub(r'([（(])\s+', r'\1', out)
    
    # Remove space between CJK characters
    # Python doesn't have a direct CJK range like JS \u4e00-\u9fff in one go easily without regex
    # But [\u4e00-\u9fff] works in python regex too.
    out = re.sub(r'([\u4e00-\u9fff]) ([\u4e00-\u9fff])', r'\1\2', out)
    
    return out

def escape_html(input_str: str) -> str:
    return html.escape(input_str, quote=True)

def bigrams(s: str) -> list[str]:
    x = re.sub(r'\s+', ' ', s)
    if len(x) < 2:
        return [x] if x else []
    return [x[i:i+2] for i in range(len(x)-1)]

def dice_coefficient(a: str, b: str) -> float:
    sa = normalize_text(a).lower()
    sb = normalize_text(b).lower()
    if not sa or not sb:
        return 0.0
    if sa == sb:
        return 1.0
    
    bg_a = bigrams(sa)
    bg_b = bigrams(sb)
    
    map_a = {}
    for x in bg_a:
        map_a[x] = map_a.get(x, 0) + 1
        
    overlap = 0
    for y in bg_b:
        c = map_a.get(y, 0)
        if c > 0:
            overlap += 1
            map_a[y] = c - 1
            
    return (2.0 * overlap) / (len(bg_a) + len(bg_b))

def get_leading_section_label(text: str) -> str | None:
    norm = normalize_text(text)
    lines = [x.strip() for x in norm.split('\n') if x.strip()]
    if not lines:
        return None
    first_line = lines[0]
    
    # Numeric: 1.1 or 1.
    m_num = re.match(r'^(\d+(?:\s*\.\s*\d+)*)(?=(?:\s|[.。:：、\-—\)])|$)', first_line)
    if m_num:
        return re.sub(r'\s+', '', m_num.group(1))
    
    # Chinese: 第一章
    m_cn = re.match(r'^(第[一二三四五六七八九十百千0-9]+[条章节篇部分])(?=(?:\s|[.。:：、\-—\)])|$)', first_line)
    if m_cn:
        return m_cn.group(1)
        
    return None

def strip_section_noise(text: str) -> str:
    norm = normalize_text(text)
    if not norm:
        return ""
    
    lines = []
    for line in norm.split('\n'):
        s = line.strip()
        if not s:
            continue
            
        # Strip Leading Numbering for Alignment
        # Matches: 1., 1.1, 1.1.1, (1), 1), 1、
        s = re.sub(r'^[\(（]?\d+(?:[\.\-]\d+)*[\)）\.、]?\s*', '', s)
        
        # Matches: 一、, （一）, 第一章
        s = re.sub(r'^[\(（]?[一二三四五六七八九十百千]+[\)）\.、]?\s*', '', s)
        s = re.sub(r'^第[一二三四五六七八九十百千0-9]+[条章节篇部分]\s*', '', s)
            
        # Remove TOC dots and page numbers
        # JS: .replace(/(?:(?:\.\s*){3,}|\.{3,}|(?:…\s*){2,}|…{2,}|(?:·\s*){3,}|·{3,}|-{3,}|_{3,})\s*\d+\s*$/g, "")
        s = re.sub(r'(?:(?:\.\s*){3,}|\.{3,}|(?:…\s*){2,}|…{2,}|(?:·\s*){3,}|·{3,}|-{3,}|_{3,})\s*\d+\s*$', '', s)
        
        # Remove trailing page number if separated by spaces
        s = re.sub(r'\s{3,}\d+\s*$', '', s)
        
        # Remove trailing dots
        s = re.sub(r'(?:\.\s*){6,}\s*$', '', s)
        s = re.sub(r'\.{6,}\s*$', '', s)
        
        s = s.strip()
        lines.append(normalize_text(s))
        
    return "\n".join(lines)

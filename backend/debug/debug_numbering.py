import sys
import os
import docx
from docx.oxml.ns import qn

def inspect_numbering(file_path):
    doc = docx.Document(file_path)
    
    # Access numbering part
    try:
        numbering_part = doc.part.numbering_part
    except:
        print("No numbering part found.")
        return

    print(f"--- Numbering Mapping for {file_path} ---")
    # Map numId -> abstractNumId
    num_map = {}
    for num in numbering_part.element.findall(qn('w:num')):
        num_id = str(num.numId)
        # abstractNumId is a child element val
        abs_ref = num.find(qn('w:abstractNumId'))
        if abs_ref is not None:
            num_map[num_id] = abs_ref.get(qn('w:val'))
    
    # Check specifically for numId=41
    target_num_id = '41'
    abs_id = num_map.get(target_num_id)
    print(f"numId={target_num_id} maps to abstractNumId={abs_id}")

    print("\n--- Abstract Numbering Formats ---")
    if abs_id:
        for abstract_num in numbering_part.element.findall(qn('w:abstractNum')):
            if abstract_num.get(qn('w:abstractNumId')) == abs_id:
                print(f"*** FOUND TARGET AbstractNumId={abs_id} (used by numId={target_num_id}) ***")
                for lvl in abstract_num.findall(qn('w:lvl')):
                    ilvl = lvl.get(qn('w:ilvl'))
                    
                    num_fmt = "unknown"
                    fmt_elem = lvl.find(qn('w:numFmt'))
                    if fmt_elem is not None:
                        num_fmt = fmt_elem.get(qn('w:val'))
                    
                    lvl_text = "unknown"
                    txt_elem = lvl.find(qn('w:lvlText'))
                    if txt_elem is not None:
                        lvl_text = txt_elem.get(qn('w:val'))
                    
                    start_val = "unknown"
                    start_elem = lvl.find(qn('w:start'))
                    if start_elem is not None:
                        start_val = start_elem.get(qn('w:val'))
                        
                    print(f"  ilvl={ilvl}: fmt={num_fmt}, text={lvl_text}, start={start_val}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        inspect_numbering(sys.argv[1])
    else:
        print("Usage: python debug_numbering.py <docx_file>")

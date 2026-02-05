import sys
import os
from docx import Document

# Add backend directory to sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(current_dir)
sys.path.append(backend_dir)

def inspect_sales_indentation_fix():
    file_path = r"D:\workspace\DocComparison\买卖合同(销售).docx"
    doc = Document(file_path)
    
    print(f"\n--- Inspecting {os.path.basename(file_path)} Headers ---")
    
    target_found = False
    
    for i, p in enumerate(doc.paragraphs):
        txt = p.text.strip()
        if "验收" in txt:
            print(f"[{i}] Found '验收': '{txt}'")
            target_found = True
            
        if target_found:
            pf = p.paragraph_format
            left = pf.left_indent.pt if pf.left_indent else 0
            first = pf.first_line_indent.pt if pf.first_line_indent else 0
            
            num_id = "None"
            ilvl = "None"
            if p._element.pPr is not None and p._element.pPr.numPr is not None:
                if p._element.pPr.numPr.numId is not None:
                    num_id = p._element.pPr.numPr.numId.val
                if p._element.pPr.numPr.ilvl is not None:
                    ilvl = p._element.pPr.numPr.ilvl.val
            
            print(f"  Item: {txt[:20]}...")
            print(f"    Indent: Left={left}, First={first}")
            print(f"    Numbering: numId={num_id}, ilvl={ilvl}")
            
            if "五、" in txt:
                break

if __name__ == "__main__":
    inspect_sales_indentation_fix()

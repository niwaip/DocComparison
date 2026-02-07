import sys
import os
from docx import Document

# Add backend directory to sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(current_dir)
sys.path.append(backend_dir)

from app.services.doc_service import DocService

def inspect_raw():
    file_path = r"D:\workspace\DocComparison\买卖合同(销售).docx"
    doc = Document(file_path)
    
    print("\n--- Inspecting Raw Paragraphs around '交货方式' ---")
    found = False
    count = 0
    for p in doc.paragraphs:
        txt = p.text.strip()
        if "交货方式" in txt or found:
            found = True
            print(f"Text: {txt[:40]}")
            if p._element.pPr is not None and p._element.pPr.numPr is not None:
                numPr = p._element.pPr.numPr
                val_id = numPr.numId.val if numPr.numId is not None else "None"
                val_ilvl = numPr.ilvl.val if numPr.ilvl is not None else "0"
                print(f"  -> numId={val_id}, ilvl={val_ilvl}")
            else:
                print("  -> No numbering properties")
            
            # Check indentation
            left = p.paragraph_format.left_indent
            if left:
                print(f"  -> Indent Left: {left.pt} pt")
            else:
                print(f"  -> Indent Left: None")
                
            count += 1
            if count > 10: break

if __name__ == "__main__":
    inspect_raw()

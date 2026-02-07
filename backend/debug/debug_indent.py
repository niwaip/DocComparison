import sys
import os
from docx import Document

# Add backend directory to sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(current_dir)
sys.path.append(backend_dir)

def check_indentation():
    file_path = r"D:\workspace\DocComparison\买卖合同(销售).docx"
    doc = Document(file_path)
    
    print("\n--- Inspecting Indentation ---")
    count = 0
    for p in doc.paragraphs:
        txt = p.text.strip()
        if not txt: continue
        
        # Focus on the section we care about
        if "交货方式" in txt or "乙方应按" in txt or "定义：" in txt or "专有信息的定义" in txt:
            print(f"Text: {txt[:30]}...")
            
            pf = p.paragraph_format
            left = pf.left_indent.pt if pf.left_indent else 0
            first = pf.first_line_indent.pt if pf.first_line_indent else 0
            
            print(f"  -> Left Indent: {left} pt")
            print(f"  -> First Line:  {first} pt")
            
            count += 1
            if count > 10: break

if __name__ == "__main__":
    check_indentation()

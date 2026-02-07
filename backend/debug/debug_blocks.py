import sys
import os

# Add backend directory to sys.path so 'app' module can be found
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(current_dir)
sys.path.append(backend_dir)

from app.services.doc_service import DocService

def test():
    file_path = r"D:\workspace\DocComparison\买卖合同(销售).docx"
    
    print(f"Parsing {file_path} with DocService...")
    blocks = DocService.parse_docx(file_path)
    
    print(f"\nTotal Blocks: {len(blocks)}")
    
    print("\n--- 1. Checking Preamble Numbering ---")
    for block in blocks:
        if "乙双方经友好协商" in block.text:
            print(f"Preamble Block Text: '{block.text}'")
            if "一、" in block.text[:5] or "1." in block.text[:5]:
                print("FAIL: Numbering still present!")
            else:
                print("PASS: Numbering suppressed.")
            break
            
    print("\n--- 2. Checking Structure Path and ILVL ---")
    # Check "十一、" and "十四、" blocks (Top level items)
    # Also check "交货方式" section and "四、验收" section
    targets = [b for b in blocks if "十一、" in b.text or "十四、" in b.text or "交货方式" in b.text or "验收" in b.text]
    for b in targets:
        print(f"Block: {b.text[:30]}... | Path: {b.structurePath}")
        
        if "验收" in b.text and "四、" in b.text:
             print("  -> Checking '四、验收' indentation:")
             # We expect children to have padding-left approx 42pt
             if "padding-left: 41.95pt" in b.htmlFragment or "padding-left: 42.0pt" in b.htmlFragment:
                 print("  PASS: Found corrected indentation (approx 42pt).")
             else:
                 print("  FAIL: Did not find corrected indentation.")
                 print(f"  -> HTML: {b.htmlFragment[:200]}...")
        
        # We can't easily see internal ilvl of merged block, but we can see the text content to see if it merged children
        if "交货方式" in b.text:
            print("  -> Checking children merging:")
            if "1." in b.text or "1．" in b.text:
                 print("  PASS: Contains '1.' sub-item.")
            else:
                 print("  FAIL: Does not contain '1.' sub-item (Might be split).")
            
            # Print HTML fragment start to check for tags
            print(f"  -> HTML Start: {b.htmlFragment[:100]}...")
        
    print("\n--- 3. Checking Table Merged Cells HTML ---")
    # Find the table block
    table_block = next((b for b in blocks if b.kind == "TABLE"), None) # kind is enum, but printed as str?
    # Actually kind is BlockKind enum.
    # Let's just look for "合计金额" in html
    
    for b in blocks:
        if "合计金额" in b.htmlFragment:
            print("Found Table with '合计金额'")
            # Extract the relevant row HTML
            if "colspan='8'" in b.htmlFragment:
                print("PASS: Found colspan='8'")
            else:
                print("FAIL: colspan='8' not found")
                
            # Check for repetition
            count = b.htmlFragment.count("合计金额")
            print(f"Occurrences of '合计金额': {count}")
            if count == 1:
                print("PASS: Text appears once.")
            else:
                print(f"FAIL: Text appears {count} times (expected 1).")
            break

if __name__ == "__main__":
    test()

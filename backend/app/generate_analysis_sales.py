import sys
import os
from docx import Document

# Add backend directory to sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(current_dir)
sys.path.append(backend_dir)

from app.services.doc_service import DocService

def generate_analysis():
    file_path = r"D:\workspace\DocComparison\买卖合同(销售).docx"
    output_path = r"D:\workspace\DocComparison\backend\app\python_docx_analysis_sales.txt"
    
    print(f"Parsing {file_path}...")
    blocks = DocService.parse_docx(file_path)
    
    print(f"Generating report to {output_path}...")
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(f"Analysis Report for: {os.path.basename(file_path)}\n")
        f.write("="*50 + "\n\n")
        
        f.write(f"Total Blocks Generated: {len(blocks)}\n\n")
        
        for i, block in enumerate(blocks):
            f.write(f"Block #{i+1} [{block.kind}]\n")
            f.write(f"ID: {block.blockId}\n")
            f.write(f"Path: {block.structurePath}\n")
            f.write("-" * 20 + "\n")
            f.write(f"Text Content:\n{block.text}\n")
            f.write("-" * 20 + "\n")
            # f.write(f"HTML Fragment:\n{block.htmlFragment}\n") # Too verbose?
            f.write("\n")

if __name__ == "__main__":
    generate_analysis()

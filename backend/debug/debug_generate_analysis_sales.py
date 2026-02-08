import os
import sys

current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(current_dir)
sys.path.append(backend_dir)

from app.services.doc_service import DocService


def _data_dir() -> str:
    env_root = os.getenv("DOC_COMPARISON_DATA_DIR", "").strip()
    if env_root:
        return env_root
    return os.path.join(backend_dir, "data")


def generate_analysis() -> None:
    default_input = os.path.join(_data_dir(), "samples", "test_doc_sales.docx")
    file_path = default_input if os.path.exists(default_input) else r"D:\workspace\DocComparison\买卖合同(销售).docx"

    output_path = os.path.join(_data_dir(), "analysis_outputs", "python_docx_analysis_sales.txt")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    print(f"Parsing {file_path}...")
    blocks = DocService.parse_docx(file_path)

    print(f"Generating report to {output_path}...")
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(f"Analysis Report for: {os.path.basename(file_path)}\n")
        f.write("=" * 50 + "\n\n")
        f.write(f"Total Blocks Generated: {len(blocks)}\n\n")
        for i, block in enumerate(blocks):
            f.write(f"Block #{i + 1} [{block.kind}]\n")
            f.write(f"ID: {block.blockId}\n")
            f.write(f"Path: {block.structurePath}\n")
            f.write("-" * 20 + "\n")
            f.write(f"Text Content:\n{block.text}\n")
            f.write("\n" + "=" * 50 + "\n\n")

    print("Done.")


if __name__ == "__main__":
    generate_analysis()

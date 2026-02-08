import os

import pypandoc


def _backend_dir() -> str:
    return os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def _data_dir() -> str:
    env_root = os.getenv("DOC_COMPARISON_DATA_DIR", "").strip()
    if env_root:
        return env_root
    return os.path.join(_backend_dir(), "data")


def export_html() -> None:
    file_path = os.path.join(_data_dir(), "samples", "test_doc.docx")
    output_dir = os.path.join(_data_dir(), "analysis_outputs")
    os.makedirs(output_dir, exist_ok=True)

    if not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        return

    print(f"Converting {file_path} to Pandoc Native AST and Markdown...")

    native_output = pypandoc.convert_file(file_path, "native")
    native_path = os.path.join(output_dir, "pandoc_native_output.txt")
    with open(native_path, "w", encoding="utf-8") as f:
        f.write(native_output)
    print(f"Exported Pandoc Native AST to {native_path}")

    md_output = pypandoc.convert_file(file_path, "markdown")
    md_path = os.path.join(output_dir, "pandoc_md_output.md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_output)
    print(f"Exported Markdown to {md_path}")


if __name__ == "__main__":
    export_html()

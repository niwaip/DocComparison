import sys
import os
import pypandoc

sys.path.append('/app')

def _backend_dir() -> str:
    return os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

def _data_dir() -> str:
    env_root = os.getenv("DOC_COMPARISON_DATA_DIR", "").strip()
    if env_root:
        return env_root
    return os.path.join(_backend_dir(), "data")

def export_html():
    file_path = os.path.join(_data_dir(), "samples", "test_doc.docx")
    output_dir = os.path.join(_data_dir(), "analysis_outputs")
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "pandoc_raw_output.txt")
    
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        return

    print(f"Converting {file_path} to Native AST and Markdown...")
    try:
        # Export as Native AST (Haskell representation)
        native_output = pypandoc.convert_file(file_path, 'native')
        native_path = os.path.join(output_dir, "pandoc_native_output.txt")
        with open(native_path, 'w', encoding='utf-8') as f:
            f.write(native_output)
        print(f"Successfully exported Pandoc Native AST to {native_path}")

        # Export as Markdown (easier to read structure)
        md_output = pypandoc.convert_file(file_path, 'markdown')
        md_path = os.path.join(output_dir, "pandoc_markdown_output.txt")
        with open(md_path, 'w', encoding='utf-8') as f:
            f.write(md_output)
        print(f"Successfully exported Pandoc Markdown to {md_path}")
        
    except Exception as e:
        print(f"Error converting: {e}")

if __name__ == "__main__":
    export_html()

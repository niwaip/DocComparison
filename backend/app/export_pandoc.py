import sys
import os
import pypandoc

sys.path.append('/app')

def export_html():
    file_path = "/app/app/test_doc.docx"
    output_path = "/app/app/pandoc_raw_output.txt"
    
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        return

    print(f"Converting {file_path} to Native AST and Markdown...")
    try:
        # Export as Native AST (Haskell representation)
        native_output = pypandoc.convert_file(file_path, 'native')
        native_path = "/app/app/pandoc_native_output.txt"
        with open(native_path, 'w', encoding='utf-8') as f:
            f.write(native_output)
        print(f"Successfully exported Pandoc Native AST to {native_path}")

        # Export as Markdown (easier to read structure)
        md_output = pypandoc.convert_file(file_path, 'markdown')
        md_path = "/app/app/pandoc_markdown_output.txt"
        with open(md_path, 'w', encoding='utf-8') as f:
            f.write(md_output)
        print(f"Successfully exported Pandoc Markdown to {md_path}")
        
    except Exception as e:
        print(f"Error converting: {e}")

if __name__ == "__main__":
    export_html()

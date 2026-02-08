import os
import re


def _backend_dir() -> str:
    return os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def _data_dir() -> str:
    env_root = os.getenv("DOC_COMPARISON_DATA_DIR", "").strip()
    if env_root:
        return env_root
    return os.path.join(_backend_dir(), "data")


def decode_pandoc_native() -> None:
    input_path = os.path.join(_data_dir(), "analysis_outputs", "pandoc_native_output.txt")
    output_path = os.path.join(_data_dir(), "analysis_outputs", "pandoc_native_decoded.txt")

    if not os.path.exists(input_path):
        print(f"File not found: {input_path}")
        return

    with open(input_path, "r", encoding="utf-8") as f:
        content = f.read()

    def replace_decimal(match: re.Match[str]) -> str:
        try:
            code_point = int(match.group(1))
            return chr(code_point)
        except Exception:
            return match.group(0)

    decoded_content = re.sub(r"\\(\d+)", replace_decimal, content)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(decoded_content)

    print(f"Decoded Native AST to {output_path}")


if __name__ == "__main__":
    decode_pandoc_native()

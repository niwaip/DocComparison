import re

def decode_pandoc_native():
    input_path = "/app/app/pandoc_native_output.txt"
    output_path = "/app/app/pandoc_native_decoded.txt"
    
    try:
        with open(input_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # Regex to find decimal escapes like \12345
        # We assume they appear inside strings and look like \digits
        # We need to be careful not to match things that aren't escapes, but in Native AST
        # this format is pretty standard for non-ASCII.
        
        def replace_decimal(match):
            try:
                code_point = int(match.group(1))
                return chr(code_point)
            except:
                return match.group(0)

        decoded_content = re.sub(r'\\(\d+)', replace_decimal, content)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(decoded_content)
            
        print(f"Successfully decoded Native AST to {output_path}")
        
    except Exception as e:
        print(f"Error decoding: {e}")

if __name__ == "__main__":
    decode_pandoc_native()

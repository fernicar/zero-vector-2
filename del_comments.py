import argparse
import re
import os

def find_python_files(target_directory: str) -> list[str]:
    """
    Finds all Python files (.py) in a given directory and its subdirectories.
    Args:
        target_directory: The root directory to search.
    Returns:
        A list of full paths to Python files.
    """
    python_files = []
    for root, _, files in os.walk(target_directory):
        for file in files:
            if file.endswith(".py"):
                python_files.append(os.path.join(root, file))
    return python_files

def remove_print_statements(text: str) -> str:
    """Removes single-line print() statements."""
    pattern = r"^\s*print\s*\((?:[^)\"']|\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*')*\s*\)\s*$"
    return re.sub(pattern, "", text, flags=re.MULTILINE)

def remove_logging_statements(text: str) -> str:
    """Removes single-line logging statements."""
    pattern = r"^\s*logging\.(?:debug|info|warning|error|critical)\s*\((?:[^)\"']|\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*')*\s*\)\s*$"
    return re.sub(pattern, "", text, flags=re.MULTILINE)

def remove_comments_and_docstrings(text: str) -> str:
    """Removes comments and docstrings."""
    processed_text = re.sub(r"#.*", "", text) # Remove single-line comments
    # Remove multi-line comments (docstrings)
    processed_text = re.sub(r"\"\"\"[\s\S]*?\"\"\"", "", processed_text, flags=re.MULTILINE)
    processed_text = re.sub(r"'''[\s\S]*?'''", "", processed_text, flags=re.MULTILINE)

    lines = [line.rstrip() for line in processed_text.splitlines() if line.strip()]
    return "\n".join(lines)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Removes comments, docstrings, print statements, and logging statements from Python files.",
        formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("target_directory", help="The directory to process.")
    parser.add_argument("--delverbose", action="store_true", help="Remove print() statements.")
    parser.add_argument("--delmessage", action="store_true", help="Remove logging statements.")
    parser.add_argument("--delfull", action="store_true",
                        help="Enable all removals:\n"
                             "- Comments and docstrings (always active)\n"
                             "- print() statements (like --delverbose)\n"
                             "- logging statements (like --delmessage)")

    args = parser.parse_args()

    if args.delfull:
        args.delverbose = True
        args.delmessage = True

    print("Parsed arguments:")
    print(f"  Target Directory: {args.target_directory}")
    print(f"  Remove Prints (--delverbose): {args.delverbose}")
    print(f"  Remove Logging (--delmessage): {args.delmessage}")
    print(f"  Full Removal (--delfull): {args.delfull}")

    print("\nFinding Python files...")
    found_files = find_python_files(args.target_directory)

    if not found_files:
        print(f"No Python files found in {args.target_directory}")
    else:
        print("Found the following Python files:")
        for py_file in found_files:
            print(f"  - {py_file}")

        print("\nProcessing files...")
        for py_file_path in found_files:
            print(f"\n--- Content of {py_file_path} ---")
            try:
                with open(py_file_path, 'r', encoding='utf-8') as f:
                    content = f.read()

                modified_content = content

                # Step 1: Comments and Docstrings are always removed.
                print(f"  Applying comment and docstring removal...") # This print was present
                modified_content = remove_comments_and_docstrings(modified_content)

                if args.delverbose:
                    print(f"  --delverbose active: Removing print statements...") # This print was present
                    modified_content = remove_print_statements(modified_content)

                if args.delmessage:
                    print(f"  --delmessage active: Removing logging statements...") # This print was present
                    modified_content = remove_logging_statements(modified_content)

                final_lines = [line for line in modified_content.splitlines() if line.strip()]
                modified_content = "\n".join(final_lines)
                if modified_content:
                    modified_content += "\n"

                print(modified_content) # This was the main print to stdout

            except FileNotFoundError:
                print(f"Error: File not found: {py_file_path}")
            except Exception as e:
                print(f"Error processing file {py_file_path}: {e}")

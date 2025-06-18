import argparse
import os
import subprocess # Added for running Terser

def find_js_files(target_directory: str) -> list[str]:
    """
    Finds all JavaScript (.js, .jsx, .mjs) files in a given directory and its subdirectories.
    Args:
        target_directory: The root directory to search.
    Returns:
        A list of full paths to target JavaScript files.
    """
    js_files = []
    supported_extensions = (".js", ".jsx", ".mjs")
    for root, _, files in os.walk(target_directory):
        for file in files:
            if file.endswith(supported_extensions):
                js_files.append(os.path.join(root, file))
    return js_files

# Removed Python-based JS comment removal functions:
# remove_js_multiline_comments, remove_js_singleline_comments, process_js_content

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Removes comments and optionally console.log statements from JavaScript files using Terser.",
        formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("target_directory", help="The directory to process for .js files.")
    parser.add_argument("--delverbose", action="store_true", default=False, help="Remove console.log statements from JavaScript files.")
    # Ensure no other flags like --delmessage or --delfull are present

    args = parser.parse_args()

    print("Parsed arguments:")
    print(f"  Target Directory: {args.target_directory}")
    print(f"  Remove console.log (--delverbose): {args.delverbose}")

    print("\nFinding JavaScript files ('.js', '.jsx', '.mjs')...")
    found_files = find_js_files(args.target_directory)

    if not found_files:
        print(f"No .js, .jsx, or .mjs files found in {args.target_directory}")
    else:
        print("Found the following JavaScript files to process:")
        for file_path in found_files:
            print(f"  - {file_path}")

        print("\nProcessing files using Terser...")
        for file_path in found_files:
            absolute_filepath = os.path.abspath(file_path)
            print(f"Processing {file_path} (absolute: {absolute_filepath})...")
            try:
                terser_command = ["terser", absolute_filepath, "-o", absolute_filepath, "--comments", "false"]
                if args.delverbose:
                    terser_command.extend(["--compress", "drop_console=true"])

                process_result = subprocess.run(
                    terser_command,
                    capture_output=True,
                    text=True,
                    check=False
                )

                if process_result.returncode == 0:
                    print(f"  Successfully processed {file_path} with Terser.")
                    if process_result.stderr: # Terser might output warnings to stderr even on success
                        print(f"  Terser warnings for {absolute_filepath}:\n{process_result.stderr.strip()}")
                else:
                    print(f"  Error: 'terser' failed to process {file_path} (absolute: {absolute_filepath}).")
                    print(f"  Terser exit code: {process_result.returncode}")
                    if process_result.stdout and process_result.stdout.strip():
                        print(f"  Terser stdout:\n{process_result.stdout.strip()}")
                    if process_result.stderr and process_result.stderr.strip():
                        print(f"  Terser stderr:\n{process_result.stderr.strip()}")
                    else:
                        print("  Terser stderr: <no specific error message captured or stderr is empty>")

                    if file_path.endswith(".jsx"):
                        print(f"  Info: Standard 'terser' does not support JSX syntax directly. Transpilation (e.g., with Babel) is typically needed first for JSX files.")

            except FileNotFoundError:
                print(f"  Error: File not found during processing: {file_path} (Skipped)")
            except Exception as e: # Catch other potential errors like IOError during file ops if they occurred before/after subprocess
                print(f"  An unexpected error occurred while processing {file_path}: {e} (Skipped)")

import argparse
import os
import subprocess # Added for running Terser
import sys # Added for sys.exit()

def check_terser_availability() -> bool:
    """
    Checks if 'terser' is installed and accessible.
    Prints instructions if not found.
    Returns True if available, False otherwise.
    """
    try:
        result = subprocess.run(
            ['terser', '--version'],
            capture_output=True,
            text=True,
            check=False, # We handle the check manually
            shell=False  # Explicitly False for security
        )
        if result.returncode == 0:
            print(f"Terser found: {result.stdout.strip()}")
            return True
        else:
            print(f"Error: 'terser --version' exited with code {result.returncode}.")
            if result.stderr:
                print(f"Terser stderr:\n{result.stderr.strip()}")
            # Instructions are printed below for FileNotFoundError, could also print here if needed
            return False
    except FileNotFoundError:
        print("\nError: 'terser' command not found.")
        print("'del_comments2.py' requires Node.js and 'terser' to process JavaScript files.\n")
        print("Please ensure Node.js and npm are installed, then install 'terser' globally by running:")
        print("  npm install terser -g\n")
        print("If 'terser' is already installed globally but still not found, you may need to:")
        print("1. Find your npm global install directory by running: npm prefix -g")
        print("2. Add this directory to your system's PATH environment variable.")
        print("3. Restart your terminal or command prompt session for PATH changes to take effect.\n")
        print("After ensuring 'terser' is installed and accessible via PATH, please run this script again.")
        return False
    except Exception as e: # Catch other potential errors during the check
        print(f"An unexpected error occurred while checking for 'terser': {e}")
        return False

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

    if not check_terser_availability():
        sys.exit(1)

    print("\nParsed arguments:") # Moved print after terser check
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

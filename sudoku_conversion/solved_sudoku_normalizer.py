import os
import glob
import re

def format_solution_to_single_line(input_file_path):
    """Reads a solution file and formats it to a single line SDX format."""
    try:
        with open(input_file_path, 'r') as f:
            content = f.read().strip()
        
        # Remove any file path comments and headers
        content = re.sub(r'// filepath:.*?\n', '', content)
        
        # Extract all numbers and 'u' prefixes
        lines = [line.strip() for line in content.split('\n') if line.strip()]
        
        cells = []
        for line in lines:
            # Split by spaces and filter out empty entries
            row_cells = [cell.strip() for cell in line.split() if cell.strip()]
            cells.extend(row_cells)
        
        # Join all cells with spaces to create a single line
        single_line = ' '.join(cells)
        
        return single_line
    
    except Exception as e:
        print(f"Error processing {input_file_path}: {e}")
        return None

def main():
    input_dir = r"C:/Users/andra/Desktop/Projects/sudoku/suduoku/sudoku_conversion/sudoku_sdx_solutions"
    output_dir = r"C:/Users/andra/Desktop/Projects/sudoku/suduoku/sudoku_conversion/sudoku_sdx_solutions_normalized"
    
    # Process all solution files
    solution_files = glob.glob(os.path.join(input_dir, "*_solution.txt"))
    
    if not solution_files:
        print("No solution files found.")
        return
    
    print(f"Found {len(solution_files)} solution files to process.")
    
    for file_path in solution_files:
        try:
            print(f"Processing {file_path}...")
            
            # Format the solution to a single line
            single_line = format_solution_to_single_line(file_path)
            if not single_line:
                continue
            
            # Create output file path
            base_name = os.path.basename(file_path)
            name_without_ext = os.path.splitext(base_name)[0]
            output_file = os.path.join(output_dir, f"{name_without_ext}_formatted.sdx")
            
            # Write the formatted solution
            with open(output_file, 'w') as f:
                f.write(single_line)
            
            print(f"Saved formatted solution to {output_file}")
            
        except Exception as e:
            print(f"Error processing {file_path}: {e}")
    
    print("Processing complete.")

if __name__ == "__main__":
    main()
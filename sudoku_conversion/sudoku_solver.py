import os
import glob
import numpy as np
import concurrent.futures
import threading
import time

def parse_sdx(file_path):
    """Parse an SDX file and return both a 9x9 numpy array for solving and the original tokens."""
    with open(file_path, 'r') as f:
        content = f.read().strip()
    
    # Extract the Sudoku part (in case there are comments)
    tokens = content.split()
    # Filter out any non-puzzle data
    sudoku_tokens = [t for t in tokens if t == '0' or (t.startswith('u') and t[1:].isdigit()) or t.isdigit()]
    
    # Create a 9x9 array and track original tokens
    grid = np.zeros((9, 9), dtype=int)
    original_tokens = [['' for _ in range(9)] for _ in range(9)]
    
    for i in range(9):
        for j in range(9):
            idx = i * 9 + j
            if idx < len(sudoku_tokens):
                token = sudoku_tokens[idx]
                original_tokens[i][j] = token
                
                # Handle the 'u' prefix (unused for solving)
                if token.startswith('u'):
                    token = token[1:]
                
                if token != '0':
                    grid[i, j] = int(token)
    
    return grid, original_tokens

def is_valid(grid, row, col, num):
    """Check if placing num at grid[row][col] is valid."""
    # Check row
    if num in grid[row]:
        return False
    
    # Check column
    if num in grid[:, col]:
        return False
    
    # Check 3x3 box
    box_row, box_col = 3 * (row // 3), 3 * (col // 3)
    for r in range(box_row, box_row + 3):
        for c in range(box_col, box_col + 3):
            if grid[r, c] == num:
                return False
    
    return True

def find_empty(grid):
    """Find an empty cell in the grid."""
    for i in range(9):
        for j in range(9):
            if grid[i, j] == 0:
                return (i, j)
    return None

def solve_sudoku(grid):
    """
    Solve the Sudoku puzzle using backtracking.
    Returns True if the puzzle is solvable, False otherwise.
    """
    # Find an empty cell
    empty = find_empty(grid)
    if not empty:
        # No empty cells, puzzle is solved
        return True
    
    row, col = empty
    
    # Try digits 1-9 for this empty cell
    for num in range(1, 10):
        if is_valid(grid, row, col, num):
            # Place the digit if it's valid
            grid[row, col] = num
            
            # Recursively try to solve the rest of the puzzle
            if solve_sudoku(grid):
                return True
            
            # If we get here, the current solution didn't work
            # Backtrack and try another number
            grid[row, col] = 0
    
    # No solution found with current configuration
    return False

def save_solution(grid, original_tokens, original_file, output_dir):
    """Save the solution to a file in output_dir, preserving 'u' prefixes."""
    # Create the output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)
    
    # Get the filename without path
    filename = os.path.basename(original_file)
    base_name = os.path.splitext(filename)[0]
    output_file = os.path.join(output_dir, f"{base_name}_solution.txt")
    
    with open(output_file, 'w') as f:
        # Write the solution
        for i in range(9):
            row_cells = []
            for j in range(9):
                cell_value = str(grid[i, j])
                
                # Preserve the 'u' prefix from original tokens if present
                original_token = original_tokens[i][j]
                if original_token.startswith('u'):
                    cell_value = 'u' + cell_value
                    
                row_cells.append(cell_value)
                
            row = ' '.join(row_cells)
            f.write(row + '\n')

def process_sdx_file(sdx_file, output_dir):
    """Process a single SDX file."""
    try:
        print(f"Processing {sdx_file}...")
        start_time = time.time()
        
        # Parse the SDX file
        grid, original_tokens = parse_sdx(sdx_file)
        
        # Make a copy of the original grid for reference
        original_grid = grid.copy()
        
        # Solve the puzzle
        if solve_sudoku(grid):
            print(f"Solution found for {sdx_file} in {time.time() - start_time:.2f} seconds")
            save_solution(grid, original_tokens, sdx_file, output_dir)
            return True
        else:
            print(f"No solution found for {sdx_file}")
            # Save the original puzzle with a note
            with open(os.path.join(output_dir, f"{os.path.basename(sdx_file)}_no_solution.txt"), 'w') as f:
                f.write("No solution found for this puzzle.\n")
            return False
    except Exception as e:
        print(f"Error processing {sdx_file}: {e}")
        return False

def main():
    input_dir = r"C:/Users/andra/Desktop/Projects/sudoku/suduoku/sudoku_conversion/sudoku_sdx"
    output_dir = r"C:/Users/andra/Desktop/Projects/sudoku/suduoku/sudoku_conversion/sudoku_sdx_solutions"
    
    # Get all .sdx files in the input directory
    sdx_files = glob.glob(os.path.join(input_dir, "*.sdx"))
    
    if not sdx_files:
        print("No .sdx files found in the input directory.")
        return
    
    print(f"Found {len(sdx_files)} .sdx files to process.")
    
    # Process files in parallel using ThreadPoolExecutor
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(len(sdx_files), os.cpu_count() * 2)) as executor:
        # Submit all files for processing
        future_to_file = {executor.submit(process_sdx_file, file, output_dir): file for file in sdx_files}
        
        # Track completed tasks
        completed = 0
        total = len(sdx_files)
        
        for future in concurrent.futures.as_completed(future_to_file):
            file = future_to_file[future]
            try:
                result = future.result()
                completed += 1
                print(f"Progress: {completed}/{total} files processed ({completed/total*100:.1f}%)")
            except Exception as e:
                print(f"Error processing {file}: {e}")
    
    print(f"Processing complete. Solutions saved to {output_dir}")

if __name__ == "__main__":
    main()
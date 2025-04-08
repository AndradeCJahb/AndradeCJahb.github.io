import os
import sqlite3
import glob

# Paths
solutions_dir = r"C:/Users/andra/Desktop/Projects/sudoku/suduoku/sudoku_conversion/sudoku_sdx_solutions_normalized"
db_path = r"C:/Users/andra/Desktop/Projects/sudoku/suduoku/backend/sudokugames.db"

def extract_date_from_filename(filename):
    """Extract the date information from a solution filename."""
    base_name = os.path.basename(filename)
    parts = base_name.split("-")
    
    # Handle filenames like "nyt-hard-2023-05-13"
    if len(parts) >= 5 and parts[0] == "nyt" and parts[1] == "hard":
        return f"{parts[3]}/{parts[4].split('_')[0]}/{parts[2]}"
    
    return None

def main():
    # Connect to SQLite database
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Find all formatted solution files
    solution_files = glob.glob(os.path.join(solutions_dir, "*_formatted.sdx"))
    
    if not solution_files:
        print("No formatted solution files found.")
        return
    
    print(f"Found {len(solution_files)} solution files.")
    
    for solution_file in solution_files:
        try:
            # Extract date from filename
            date_str = extract_date_from_filename(solution_file)
            if not date_str:
                print(f"Could not extract date from: {solution_file}, skipping...")
                continue
            
            # Construct the title to match the puzzles table
            title = f"NYT {date_str}"
            
            # Read the solution file
            with open(solution_file, 'r') as f:
                solution_sdx = f.read().strip()
            
            # Update the puzzles table
            cursor.execute(
                "UPDATE puzzles SET sdx_solution = ? WHERE title = ?",
                (solution_sdx, title)
            )
            
            if cursor.rowcount > 0:
                print(f"Updated solution for: {title}")
            else:
                print(f"No matching puzzle found for: {title}")
                
        except Exception as e:
            print(f"Error processing {solution_file}: {e}")
    
    # Commit changes and close connection
    conn.commit()
    print(f"Committed {cursor.rowcount} changes to database.")
    
    # Verify updates
    cursor.execute("SELECT COUNT(*) FROM puzzles WHERE sdx_solution IS NOT NULL")
    count = cursor.fetchone()[0]
    print(f"Total puzzles with solutions: {count}")
    
    conn.close()
    print("Process completed.")

if __name__ == "__main__":
    main()
import os
import sqlite3

# Paths
sdx_folder = r"C:/Users/andra/Desktop/Projects/sudoku/suduoku/sudoku_conversion/sudoku_sdx"
db_path = r"C:/Users/andra/Desktop/Projects/sudoku/suduoku/backend/sudokugames.db"

# Connect to the SQLite database
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Iterate through all .sdx files in the folder
for filename in os.listdir(sdx_folder):
    if filename.endswith(".sdx"):
        # Extract the date from the filename
        parts = filename.split("-")
        if len(parts) == 5 and parts[0] == "nyt":
            date = parts[3] + "/" + parts[4].replace(".sdx", "") + "/" + parts[2]
            title = f"NYT {date}"

            # Read the contents of the .sdx file
            with open(os.path.join(sdx_folder, filename), "r") as file:
                sdx_content = file.read().strip()

            # Execute the SQL command
            cursor.execute("""
            INSERT INTO puzzles (title, difficulty, status, sdx)
            VALUES (?, ?, ?, ?)
            """, (title, "hard", "not started", sdx_content))

            print(f"Inserted: {title}")

# Commit changes and close the connection
conn.commit()
conn.close()

print("All .sdx files have been inserted into the database.")
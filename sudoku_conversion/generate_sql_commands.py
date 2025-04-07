import os

# Path to the folder containing .sdx files
sdx_folder = r"C:/Users/andra/Desktop/Projects/sudoku/suduoku/sudoku_conversion/sudoku_sdx"
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

            # Generate the SQL command
            sql_command = f"""
            INSERT INTO puzzles (title, difficulty, status, sdx)
            VALUES ('{title}', 'hard', 'not started', '{sdx_content}');
            """
            print(sql_command.strip())
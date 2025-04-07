import os

def convert_to_sdx(input_folder, output_folder):
    # Ensure the output folder exists
    os.makedirs(output_folder, exist_ok=True)

    # Iterate through all files in the input folder
    for filename in os.listdir(input_folder):
        input_path = os.path.join(input_folder, filename)
        if os.path.isfile(input_path):
            with open(input_path, 'r') as file:
                lines = file.readlines()

            # Convert the puzzle to SDX format
            sdx_lines = []
            for line in lines:
                line = line.strip()
                if line and not line.startswith('#'):  # Ignore empty lines and lines starting with #
                    sdx_line = ' '.join(f"u{char}" if char.isdigit() else "0" for char in line)
                    sdx_lines.append(sdx_line)

            # Join all rows into a single-line string
            sdx_string = ' '.join(sdx_lines)

            # Write the converted puzzle to the output folder
            output_path = os.path.join(output_folder, f"{os.path.splitext(filename)[0]}.sdx")
            with open(output_path, 'w') as output_file:
                output_file.write(sdx_string)

            print(f"Converted {filename} to {output_path}")

# Example usage
input_folder = "C:/Users/andra/Desktop/Projects/sudoku/suduoku/sudoku_conversion/sudoku"  # Replace with the path to your folder containing the puzzles
output_folder = "C:/Users/andra/Desktop/Projects/sudoku/suduoku/sudoku_conversion/sudoku_sdx"  # Replace with the path to your desired output folder
convert_to_sdx(input_folder, output_folder)
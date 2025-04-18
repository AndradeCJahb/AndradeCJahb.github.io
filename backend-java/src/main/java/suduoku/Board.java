package suduoku;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

public class Board {
    private int[][][] board;
    private static final String DB_URL = "jdbc:sqlite:sudokugames.db";

    public Board(int puzzleId) {
        String query = "SELECT title, sdx FROM puzzles WHERE id = ?";

        try (Connection conn = DriverManager.getConnection(DB_URL);
            PreparedStatement stmt = conn.prepareStatement(query)) {
            stmt.setInt(1, puzzleId);
            ResultSet rs = stmt.executeQuery();

            if (rs.next()) {
                this.board = convertSDXToBoard(rs.getString("sdx"));

                
            } else {
                this.board = new int[9][9][2];
                System.out.println("No puzzle found with ID: " + puzzleId);
            }
        } catch (SQLException e) {
            System.err.println("Error fetching chat history: " + e.getMessage());
            e.printStackTrace();
        }
    }

    private int[][][] convertSDXToBoard(String sdx) {
        String[] tokens = sdx.split(",");
        int[][][] board = new int[9][9][2];

        for (String token : tokens) {
            if (token.contains('u')) {
                
            }
        }
        for (int i = 0; i < 9; i++) {
            String[] cells = rows[i].split("");
            for (int j = 0; j < 9; j++) {
                board[i][j][0] = Integer.parseInt(cells[j]);
                board[i][j][1] = 0;
            }
        }
        return board;
    }
}


const http = require('http');
const WebSocket = require('ws');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const players = new Map();

// Create HTTP server
const server = http.createServer();

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Path to the SQLite database
const dbPath = path.join(__dirname, 'sudokugames.db');

const adjectives = [
  'Brave', 'Clever', 'Happy', 'Kind', 'Quick', 'Witty', 'Bright', 'Calm', 'Bold', 'Sharp',
  'Gentle', 'Loyal', 'Strong', 'Wise', 'Fierce', 'Noble', 'Friendly', 'Quiet', 'Swift', 'Charming',
  'Graceful', 'Fearless', 'Mighty', 'Playful', 'Cheerful', 'Daring', 'Elegant', 'Generous', 'Humble', 'Jolly',
  'Lively', 'Patient', 'Proud', 'Sincere', 'Thoughtful', 'Vibrant', 'Zesty', 'Adventurous', 'Ambitious', 'Courageous',
  'Diligent', 'Energetic', 'Faithful', 'Gentle', 'Harmonious', 'Inventive', 'Joyful', 'Radiant', 'Resilient', 'Spirited'
];

const nouns = [
  'Tiger', 'Eagle', 'Fox', 'Bear', 'Wolf', 'Lion', 'Hawk', 'Shark', 'Panda', 'Falcon',
  'Otter', 'Dolphin', 'Cheetah', 'Leopard', 'Jaguar', 'Panther', 'Rabbit', 'Deer', 'Koala', 'Penguin',
  'Turtle', 'Crocodile', 'Alligator', 'Peacock', 'Swan', 'Raven', 'Owl', 'Parrot', 'Lynx', 'Seal',
  'Whale', 'Octopus', 'Crane', 'Stork', 'Hedgehog', 'Badger', 'Moose', 'Buffalo', 'Antelope', 'Gazelle',
  'Kangaroo', 'Wallaby', 'Platypus', 'Armadillo', 'Sloth', 'Chameleon', 'Iguana', 'Gecko', 'Flamingo', 'Toucan'
];

function generateRandomName() {
  const now = Date.now(); // Get the current timestamp
  const adjective = adjectives[now % adjectives.length]; // Use the timestamp to pick an adjective
  const noun = nouns[now % nouns.length]; // Use a different part of the timestamp to pick a noun
  const number = now % 100; // Generate a two-digit number based on the timestamp
  return `${adjective}${noun}${number}`;
}

function generateRandomColor() {
  const now = Date.now(); // Get the current timestamp
  return `#${((now * Math.random()) & 0xffffff).toString(16).padStart(6, '0')}`; // Generate a random hex color
}

function getRandomPuzzle(callback) {
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error connecting to the database:', err.message);
      callback(null);
      return;
    }
  });

  const query = `
    SELECT id, title, sdx FROM puzzles
    where id = 2;
  `;

  db.get(query, (err, row) => {
    if (err) {
      console.error('Error fetching puzzle:', err.message);
      callback(null);
    } else {
      callback(row ? { id: row.id, title: row.title, sdx: row.sdx } : null);
    }
    db.close();
  });
}

let boardState = Array(9).fill(Array(9).fill('')); // Initialize empty 9x9 board
let puzzleTitle = ''; // Initialize puzzle title
let puzzleId = null; // Initialize puzzle ID

const gameState = {
  incorrectCells: []
};


getRandomPuzzle((puzzle) => {
  if (puzzle) {
    const { id, title, sdx } = puzzle;
    puzzleId = id; // Store the puzzle ID
    puzzleTitle = title; // Store the puzzle title

    // Parse the sdx string into a 9x9 board
    const cells = sdx.split(' '); // Split the sdx string into individual cell values
    boardState = Array.from({ length: 9 }, (_, rowIndex) =>
      Array.from({ length: 9 }, (_, colIndex) => {
        const cellIndex = rowIndex * 9 + colIndex; // Calculate the correct index in the sdx string for row-by-row traversal
        const cell = cells[cellIndex];
        return {
          value: cell.startsWith('u') ? cell.slice(1) : cell === '0' ? '' : cell, // Convert '0' to ''
          isEditable: !cell.startsWith('u'), // Mark as non-editable if it starts with 'u'
        };
      })
    );

    console.log(`Loaded puzzle: ${title} (ID: ${id})`);
  } else {
    console.log('No puzzles found in the database. Using an empty board.');
  }
});

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', (message) => {
    const data = JSON.parse(message);

    if (data.type === 'identify') {
      const clientId = data.clientId;

      // Check if the client already exists
      if (!players.has(clientId)) {
        const clientName = generateRandomName();
        const clientColor = generateRandomColor();
        players.set(clientId, { name: clientName, color: clientColor });
      }

      // Associate the WebSocket with the client ID
      ws.clientId = clientId;

      // Send the client info and player list
      const clientInfo = players.get(clientId);
      ws.send(
        JSON.stringify({
          type: 'update',
          client: clientInfo,
          board: boardState,
          title: puzzleTitle,
          puzzleId: puzzleId,
        })
      );
      
      // Add this to send the current incorrect cells
      if (gameState.incorrectCells.length > 0) {
        ws.send(
          JSON.stringify({
            type: 'checkResult',
            incorrectCells: gameState.incorrectCells
          })
        );
      }

      // Broadcast the updated player list
      broadcastPlayers();
    } else if (data.type === 'chat') {
      // Handle chat messages
      const { message: chatMessage } = data;
      const { user, text } = chatMessage;
    
      // Retrieve the user's color from the players map
      const clientColor = players.get(ws.clientId)?.color || '#000000';
    
      // Insert the chat message into the database
      const db = new sqlite3.Database(dbPath);
      db.run(
        'INSERT INTO chat_logs (puzzle_id, user, color, message, time) VALUES (?, ?, ?, ?, ?)',
        [puzzleId, user, clientColor, text, Date.now()], // Include the color in the database
        function (err) {
          if (err) {
            console.error('Error inserting chat message:', err.message);
          } else {
            console.log(`Chat message inserted for puzzle ${puzzleId} by ${user}`);
    
            // Fetch the updated chat logs
            db.all(
              'SELECT user, color, message, time FROM chat_logs WHERE puzzle_id = ? ORDER BY time',
              [puzzleId],
              (err, rows) => {
                if (err) {
                  console.error('Error fetching chat history:', err.message);
                } else {
                  // Broadcast the updated chat logs to all connected clients
                  wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                      client.send(JSON.stringify({ type: 'chatHistory', messages: rows }));
                    }
                  });
                }
              }
            );
          }
        }
      );
      db.close();
    } else if (data.type === 'loadChat') {
      // Fetch chat history for the current puzzle
      const db = new sqlite3.Database(dbPath);
      db.all(
        'SELECT user, color, message, time FROM chat_logs WHERE puzzle_id = ? ORDER BY time ASC',
        [puzzleId],
        (err, rows) => {
          if (err) {
            console.error('Error fetching chat history:', err.message);
          } else {
            // Send the chat history back to the client, including the color
            ws.send(JSON.stringify({ type: 'chatHistory', messages: rows }));
          }
        }
      );
      db.close();
    } else if (data.type === 'update') {
      // Handle board updates
      const { board, changedCell } = data; // Extract changedCell from the data object
      
      // Update the board state in memory
      boardState = board;
      
      // Only process changed cell logic if changedCell exists
      if (changedCell && gameState.incorrectCells.length > 0) {
        const { row, col } = changedCell;
        
        // Remove this cell from incorrectCells if it was changed
        gameState.incorrectCells = gameState.incorrectCells.filter(
          cell => !(cell.row === row && cell.col === col)
        );
        
        console.log(`Removed cell (${row},${col}) from incorrectCells. Remaining: ${gameState.incorrectCells.length}`);
        
        // Add this: Broadcast the updated incorrectCells to all clients
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(
              JSON.stringify({
                type: 'checkResult',
                incorrectCells: gameState.incorrectCells
              })
            );
          }
        });
      }
      
      // Save the board state to the database
      const db = new sqlite3.Database(dbPath);
      
      // Convert the board to a format that can be stored in the database
      const boardCells = [];
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
          const cell = board[row][col];
          let cellValue = cell.value;
          if (cellValue === '') {
            cellValue = '0';
          } else if (!cell.isEditable) {
            cellValue = 'u' + cellValue;
          }
          boardCells.push(cellValue);
        }
      }
      
      const sdx = boardCells.join(' ');
      
      // Update the puzzle in the database
      db.run(
        'UPDATE puzzles SET sdx = ? WHERE id = ?',
        [sdx, puzzleId],
        function (err) {
          if (err) {
            console.error('Error updating puzzle in database:', err.message);
          } else {
            console.log(`Puzzle ${puzzleId} updated in database`);
            
            // Broadcast the updated board to all clients
            wss.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(
                  JSON.stringify({
                    type: 'update',
                    board: boardState,
                    title: puzzleTitle,
                    puzzleId: puzzleId,
                  })
                );
                
                // Also send the current incorrect cells state
                if (changedCell) {
                  client.send(
                    JSON.stringify({
                      type: 'checkResult',
                      incorrectCells: gameState.incorrectCells
                    })
                  );
                }
              }
            });
          }
        }
      );
      
      db.close();
    } else if (data.type === 'clearBoard') {
      // Handle board clearing
      const { board } = data;
      
      // Update the board state in memory
      boardState = board;
      
      gameState.incorrectCells = [];

      // Save the board state to the database
      const db = new sqlite3.Database(dbPath);
      
      // Convert the board to a format that can be stored in the database
      const boardCells = [];
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
          const cell = board[row][col];
          let cellValue = cell.value;
          if (cellValue === '') {
            cellValue = '0';
          } else if (!cell.isEditable) {
            cellValue = 'u' + cellValue;
          }
          boardCells.push(cellValue);
        }
      }
      
      const sdx = boardCells.join(' ');
      
      // Update the puzzle in the database
      db.run(
        'UPDATE puzzles SET sdx = ? WHERE id = ?',
        [sdx, puzzleId],
        function (err) {
          if (err) {
            console.error('Error updating puzzle in database:', err.message);
          } else {
            console.log(`Puzzle ${puzzleId} cleared and updated in database`);
            
            // Broadcast the updated board to all clients
            wss.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(
                  JSON.stringify({
                    type: 'update',
                    board: boardState,
                    title: puzzleTitle,
                    puzzleId: puzzleId,
                  })
                );
                
                // Also send empty incorrectCells
                client.send(
                  JSON.stringify({
                    type: 'checkResult',
                    incorrectCells: []
                  })
                );
              }
            });
          }
        }
      );

      db.close();

    } else if (data.type === 'checkSolution') {
      // Fetch solution from the database
      const db = new sqlite3.Database(dbPath);
      db.get(
        'SELECT sdx_solution FROM puzzles WHERE id = ?',
        [puzzleId],
        (err, row) => {
          if (err) {
            console.error('Error fetching solution:', err.message);
          } else if (row && row.sdx_solution) {
            // Parse the solution from the database
            const solutionCells = row.sdx_solution.split(' ');
            const solution = Array.from({ length: 9 }, (_, rowIndex) =>
              Array.from({ length: 9 }, (_, colIndex) => {
                const cellIndex = rowIndex * 9 + colIndex;
                const cell = solutionCells[cellIndex];
                // Extract the number from the solution (remove 'u' prefix if present)
                return cell.startsWith('u') ? cell.slice(1) : cell;
              })
            );
            
            // Compare current board with solution
            const incorrectCells = [];
            for (let row = 0; row < 9; row++) {
              for (let col = 0; col < 9; col++) {
                const currentValue = boardState[row][col].value;
                if (currentValue !== '' && currentValue !== solution[row][col]) {
                  // Transpose the coordinates when reporting incorrect cells
                  incorrectCells.push({ row: col, col: row });
                }
              }
            }
            
            // Store the incorrect cells at the server level
        gameState.incorrectCells = incorrectCells;
        
        // Broadcast to all clients instead of just the requesting client
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(
              JSON.stringify({
                type: 'checkResult',
                incorrectCells: incorrectCells
              })
            );
          }
        });
      } else {
            console.error('Solution not found for puzzle:', puzzleId);
            ws.send(
              JSON.stringify({
                type: 'checkResult',
                error: 'Solution not available for this puzzle'
              })
            );
          }
        }
      );
      db.close();
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });

  const broadcastPlayers = () => {
    const playerList = Array.from(players.values());
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'players', players: playerList }));
      }
    });
  };
});

// Start the HTTPS server
server.listen(8080, '0.0.0.0', () => {
  console.log('WebSocket server running on wss://0.0.0.0:8080');
});
// Server dependencies
const http = require('http');
const WebSocket = require('ws');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const express = require('express');
const cors = require('cors');

// Database configuration
const dbPath = path.join(__dirname, 'sudokugames.db');

// Express app setup
const app = express();
// Update your CORS configuration (around line 11-14)
// Replace lines 11-16 with:
app.use(cors({
  origin: '*', // Allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning']
}));


const frontendPath = path.join(__dirname, '../frontend/build');

app.use(express.json());
// Serve static files after API routes but before catch-all
app.use(express.static(frontendPath));

// Server setup
const wsServer = new WebSocket.Server({ 
  noServer: true // Use noServer mode for better integration
});

// Create HTTP server
const server = http.createServer(app);

// Handle upgrade requests for WebSockets
server.on('upgrade', (request, socket, head) => {
  let pathname;
  try {
    pathname = new URL(request.url, `http://${request.headers.host || 'localhost'}`).pathname;
  } catch (err) {
    console.error('Error parsing WebSocket URL:', err);
    socket.destroy();
    return;
  }
  
  if (pathname === '/ws') {
    wsServer.handleUpgrade(request, socket, head, (ws) => {
      wsServer.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});



// Game state
const players = new Map(); // Maps clientId -> player info (name, color)
const puzzleRooms = new Map(); // Maps puzzleId -> Set of playerIds in that puzzle
const puzzleStates = new Map(); // Maps puzzleId -> puzzle state (board, title, incorrectCells)

// Default states when no puzzle is selected
let puzzleTitle = 'Sudoku';
let puzzleId = null;
let boardState = Array(9).fill(Array(9).fill(''));

const highlightState = {
  incorrectCells: [],
  playerPositions: new Map()
};

// Name generation data
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

// Express API endpoints
app.get('/puzzles', (req, res) => {
  const db = new sqlite3.Database(dbPath);
  db.all(
    'SELECT id, title, difficulty, status FROM puzzles ORDER BY id DESC',
    [],
    (err, rows) => {
      if (err) {
        console.error('Error fetching puzzles:', err.message);
        res.status(500).json({ error: 'Failed to fetch puzzles' });
      } else {
        // Explicitly set content type
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(rows));
      }
      db.close();
    }
  );
});

app.get('/puzzles/:id', (req, res) => {
  const puzzleId = req.params.id;
  const db = new sqlite3.Database(dbPath);
  db.get(
    'SELECT id, title, sdx FROM puzzles WHERE id = ?',
    [puzzleId],
    (err, row) => {
      if (err) {
        console.error('Error fetching puzzle:', err.message);
        res.status(500).json({ error: 'Failed to fetch puzzle' });
      } else if (row) {
        res.json(row);
      } else {
        res.status(404).json({ error: 'Puzzle not found' });
      }
      db.close();
    }
  );
});

app.use((req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Helper functions
function generateRandomName() {
  const now = Date.now();
  const adjective = adjectives[now % adjectives.length];
  const noun = nouns[now % nouns.length];
  const number = now % 100;
  return `${adjective}${noun}${number}`;
}

function generateRandomColor() {
  const now = Date.now();
  return `#${((now * Math.random()) & 0xffffff).toString(16).padStart(6, '0')}`;
}

function convertBoardToSDX(board) {
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
  
  return boardCells.join(' ');
}

function convertSDXToBoard(sdx, valuesOnly = false) {
  const cells = sdx.split(' ');
  
  return Array.from({ length: 9 }, (_, rowIndex) =>
    Array.from({ length: 9 }, (_, colIndex) => {
      const cellIndex = rowIndex * 9 + colIndex;
      const cell = cells[cellIndex];
      const value = cell.startsWith('u') ? cell.slice(1) : cell === '0' ? '' : cell;
      
      return valuesOnly ? value : {
        value: value,
        isEditable: !cell.startsWith('u')
      };
    })
  );
}

function loadPuzzle(id, callback) {
  const db = new sqlite3.Database(dbPath);
  db.get(
    'SELECT id, title, sdx FROM puzzles WHERE id = ?',
    [id],
    (err, row) => {
      if (err) {
        console.error('Error fetching puzzle:', err.message);
        callback(null);
      } else {
        callback(row);
      }
      db.close();
    }
  );
}

function getRandomPuzzle(callback) {
  const db = new sqlite3.Database(dbPath);
  const query = `
    SELECT id, title, sdx FROM puzzles
    ORDER BY RANDOM() LIMIT 1;
  `;

  db.get(query, (err, row) => {
    if (err) {
      console.error('Error fetching random puzzle:', err.message);
      callback(null);
    } else {
      callback(row ? { id: row.id, title: row.title, sdx: row.sdx } : null);
    }
    db.close();
  });
}

function createPlayer(clientId) {
  const clientName = generateRandomName();
  const clientColor = generateRandomColor();
  players.set(clientId, { name: clientName, color: clientColor });
}

function addPlayerToPuzzle(clientId, puzzleId) {
  // Remove player from any existing puzzle room first
  removePlayerFromCurrentPuzzle(clientId);
  
  // Add player to the specified puzzle room
  if (!puzzleRooms.has(puzzleId)) {
    puzzleRooms.set(puzzleId, new Set());
  }
  puzzleRooms.get(puzzleId).add(clientId);
}

function removePlayerFromCurrentPuzzle(clientId) {
  // Find all puzzles containing this player and remove them
  puzzleRooms.forEach((playerSet, puzzleId) => {
    if (playerSet.has(clientId)) {
      playerSet.delete(clientId);
      // If the puzzle has no players left, we could clean it up
      if (playerSet.size === 0) {
        puzzleRooms.delete(puzzleId);
      }
    }
  });
}

function getPlayersInPuzzle(puzzleId) {
  const playerSet = puzzleRooms.get(puzzleId) || new Set();
  const puzzlePlayers = Array.from(playerSet)
    .filter(id => players.has(id))
    .map(id => ({
      clientId: id,
      ...players.get(id)
    }));
  
  return puzzlePlayers;
}

function getPuzzleState(puzzleId) {
  if (!puzzleStates.has(puzzleId)) {
    // Return default state if no specific state exists for this puzzle
    return {
      board: boardState,
      title: puzzleTitle,
      incorrectCells: []
    };
  }
  return puzzleStates.get(puzzleId);
}

function setPuzzleState(puzzleId, state) {
  puzzleStates.set(puzzleId, state);
}

function broadcastPlayers(puzzleId) {
  const playerList = getPlayersInPuzzle(puzzleId);
  
  wsServer.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.puzzleId === puzzleId) {
      client.send(JSON.stringify({ type: 'players', players: playerList }));
    }
  });
}

function broadcastGameState(puzzleId) {
  // Get puzzle-specific state
  const puzzleState = getPuzzleState(puzzleId);
  
  // Convert playerPositions Map to an array of positions for players in this puzzle
  const positions = [];
  
  highlightState.playerPositions.forEach((position, clientId) => {
    // Only include players that are in this puzzle
    const playerRooms = Array.from(puzzleRooms.entries())
      .filter(([_, clientIds]) => clientIds.has(clientId))
      .map(([roomId, _]) => roomId);
    
    if (playerRooms.includes(parseInt(puzzleId)) && players.has(clientId)) {
      const player = players.get(clientId);
      positions.push({
        clientId,
        name: player.name,
        color: player.color,
        position: position
      });
    }
  });
  
  // Create a message containing all game state for this puzzle
  const gameStateMessage = {
    type: 'gameState',
    board: puzzleState.board,
    title: puzzleState.title,
    puzzleId: puzzleId,
    incorrectCells: puzzleState.incorrectCells || [],
    playerPositions: positions
  };

  // Send the combined state to all clients in this puzzle
  wsServer.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.puzzleId === parseInt(puzzleId)) {
      client.send(JSON.stringify(gameStateMessage));
    }
  });
}

function handleIdentify(ws, data) {
  const clientId = data.clientId;
  ws.clientId = clientId;

  if (!players.has(clientId)) {
    createPlayer(clientId);
  }
  
  // If a specific puzzle ID was requested, load that puzzle
  if (data.puzzleId) {
    const requestedPuzzleId = parseInt(data.puzzleId, 10);
    loadPuzzle(requestedPuzzleId, (puzzle) => {
      if (puzzle) {
        // Store the puzzleId on the websocket connection
        ws.puzzleId = puzzle.id;
        
        // Add the player to this puzzle's room
        addPlayerToPuzzle(clientId, puzzle.id);
        
        // Update or create puzzle state
        if (!puzzleStates.has(puzzle.id)) {
          setPuzzleState(puzzle.id, {
            board: convertSDXToBoard(puzzle.sdx),
            title: puzzle.title,
            incorrectCells: []
          });
        }
        
        // Send the client info
        const clientInfo = players.get(clientId);
        ws.send(
          JSON.stringify({
            type: 'update',
            client: clientInfo,
            board: getPuzzleState(puzzle.id).board,
            title: puzzle.title,
            puzzleId: puzzle.id,
          })
        );
        
        // Send updated state to all clients in this puzzle
        broadcastChat(puzzle.id);
        broadcastGameState(puzzle.id);
        broadcastPlayers(puzzle.id);
      } else {
        // Puzzle not found, notify the client
        ws.send(JSON.stringify({ 
          type: 'puzzleNotFound',
          message: 'The requested puzzle was not found'
        }));
        
        // Load a random puzzle instead
        getRandomPuzzle((randomPuzzle) => {
          if (randomPuzzle) {
            ws.puzzleId = randomPuzzle.id;
            addPlayerToPuzzle(clientId, randomPuzzle.id);
            
            if (!puzzleStates.has(randomPuzzle.id)) {
              setPuzzleState(randomPuzzle.id, {
                board: convertSDXToBoard(randomPuzzle.sdx),
                title: randomPuzzle.title,
                incorrectCells: []
              });
            }
            
            // Send the client info
            const clientInfo = players.get(clientId);
            ws.send(
              JSON.stringify({
                type: 'update',
                client: clientInfo,
                board: getPuzzleState(randomPuzzle.id).board,
                title: randomPuzzle.title,
                puzzleId: randomPuzzle.id,
              })
            );
            
            broadcastGameState(randomPuzzle.id);
            broadcastPlayers(randomPuzzle.id);
          }
        });
      }
    });
  } else {
    // No specific puzzle requested, send the client info
    const clientInfo = players.get(clientId);
    ws.send(
      JSON.stringify({
        type: 'update',
        client: clientInfo
      })
    );
  }
}

function handleChat(ws, data) {
  const { message: chatMessage } = data;
  const { user, text, puzzleId: msgPuzzleId } = chatMessage;

  // Use the puzzle ID from the message, or fall back to the websocket's puzzle ID
  const currentPuzzleId = msgPuzzleId || ws.puzzleId;
  
  if (!currentPuzzleId) {
    console.error('No puzzle ID for chat message');
    return;
  }

  // Retrieve the user's color from the players map
  const clientColor = players.get(ws.clientId)?.color || '#000000';

  // Insert the chat message into the database
  const db = new sqlite3.Database(dbPath);
  db.run(
    'INSERT INTO chat_logs (puzzle_id, user, color, message, time) VALUES (?, ?, ?, ?, ?)',
    [currentPuzzleId, user, clientColor, text, Date.now()],
    function (err) {
      if (err) {
        console.error('Error inserting chat message:', err.message);
      } else {
        broadcastChat(currentPuzzleId);
      }
    }
  );
  db.close();
}

function broadcastChat(puzzleId) {
  wsServer.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.puzzleId === parseInt(puzzleId)) {
      handleLoadChat(client, puzzleId);
    }
  });
}

function handleLoadChat(ws, specificPuzzleId = null) {
  const currentPuzzleId = specificPuzzleId || ws.puzzleId;
  
  if (!currentPuzzleId) {
    console.error('No puzzle ID for loading chat');
    return;
  }
  
  const db = new sqlite3.Database(dbPath);
  db.all(
    'SELECT user, color, message, time FROM chat_logs WHERE puzzle_id = ? ORDER BY time ASC',
    [currentPuzzleId],
    (err, rows) => {
      if (err) {
        console.error('Error fetching chat history:', err.message);
      } else {
        ws.send(JSON.stringify({ type: 'chatHistory', messages: rows }));
      }
    }
  );
  db.close();
}

function handleUpdate(ws, data) {
  const { board, changedCell } = data;
  const currentPuzzleId = ws.puzzleId;
  
  if (!currentPuzzleId) {
    console.error('No puzzle ID for update');
    return;
  }
  
  // Get the current puzzle state
  const puzzleState = getPuzzleState(currentPuzzleId);
  
  // Update the board in the puzzle state
  puzzleState.board = board;
  
  // Process changed cell logic if changedCell exists
  if (changedCell && puzzleState.incorrectCells && puzzleState.incorrectCells.length > 0) {
    const { row, col } = changedCell;
    
    // Remove this cell from incorrectCells if it was changed
    puzzleState.incorrectCells = puzzleState.incorrectCells.filter(
      cell => !(cell.row === row && cell.col === col)
    );
  }
  
  // Update the puzzle state
  setPuzzleState(currentPuzzleId, puzzleState);
  
  // Save to database
  const sdx = convertBoardToSDX(board);
  const db = new sqlite3.Database(dbPath);

  db.run(
    'UPDATE puzzles SET sdx = ? WHERE id = ?',
    [sdx, currentPuzzleId],
    function (err) {
      if (err) {
        console.error('Error updating puzzle in database:', err.message);
      } else {
        broadcastGameState(currentPuzzleId);
      }
    }
  );
  
  db.close();
}

function handleClearBoard(ws) {
  const currentPuzzleId = ws.puzzleId;
  
  if (!currentPuzzleId) {
    console.error('No puzzle ID for clear board');
    return;
  }
  
  // Get the current puzzle state
  const puzzleState = getPuzzleState(currentPuzzleId);
  
  // Clear the board while preserving locked cells
  const clearedBoard = puzzleState.board.map(row => 
    row.map(cell => ({
      ...cell,
      value: cell.isEditable ? '' : cell.value
    }))
  );
  
  // Update the puzzle state
  puzzleState.board = clearedBoard;
  puzzleState.incorrectCells = [];
  setPuzzleState(currentPuzzleId, puzzleState);
  
  // Save to database
  const sdx = convertBoardToSDX(clearedBoard);
  const db = new sqlite3.Database(dbPath);
  db.run(
    'UPDATE puzzles SET sdx = ? WHERE id = ?',
    [sdx, currentPuzzleId],
    function (err) {
      if (err) {
        console.error('Error updating puzzle in database:', err.message);
      } else {
        broadcastGameState(currentPuzzleId);
      }
    }
  );

  db.close();
}

function getIncorrectCells(solution, board) {
  const incorrectCells = [];
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const currentValue = board[row][col].value;
      if (currentValue !== '' && currentValue !== solution[row][col]) {
        incorrectCells.push({ row: col, col: row });
      }
    }
  }
  return incorrectCells;
}

function handleCheckSolution(ws) {
  const currentPuzzleId = ws.puzzleId;
  
  if (!currentPuzzleId) {
    console.error('No puzzle ID for check solution');
    return;
  }
  
  const db = new sqlite3.Database(dbPath);
  db.get(
    'SELECT sdx_solution FROM puzzles WHERE id = ?',
    [currentPuzzleId],
    (err, row) => {
      if (err) {
        console.error('Error fetching solution:', err.message);
      } else if (row && row.sdx_solution) {
        const puzzleState = getPuzzleState(currentPuzzleId);
        const solution = convertSDXToBoard(row.sdx_solution, true);
        puzzleState.incorrectCells = getIncorrectCells(solution, puzzleState.board);
        
        // Update the puzzle state
        setPuzzleState(currentPuzzleId, puzzleState);
        
        broadcastGameState(currentPuzzleId);
      } else {
        console.error('Solution not found for puzzle:', currentPuzzleId);
      }
    }
  );
  db.close();
}

function handleCellSelection(ws, data) {
  const { row, col } = data.position;
  const clientId = ws.clientId;
  const currentPuzzleId = ws.puzzleId;
  
  if (!currentPuzzleId) {
    console.error('No puzzle ID for cell selection');
    return;
  }
  
  highlightState.playerPositions.set(clientId, { row, col });
  
  broadcastPlayerPositions(currentPuzzleId);
}

function broadcastPlayerPositions(puzzleId) {
  // Only broadcast to players in the same puzzle
  const positions = [];
  
  highlightState.playerPositions.forEach((position, clientId) => {
    // Only include positions of players in this puzzle
    const playerRooms = Array.from(puzzleRooms.entries())
      .filter(([_, clientIds]) => clientIds.has(clientId))
      .map(([roomId, _]) => roomId);
    
    if (playerRooms.includes(parseInt(puzzleId)) && players.has(clientId)) {
      const player = players.get(clientId);
      positions.push({
        clientId,
        name: player.name,
        color: player.color,
        position: position
      });
    }
  });
  
  // Broadcast to all clients in this puzzle
  wsServer.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.puzzleId === parseInt(puzzleId)) {
      client.send(JSON.stringify({
        type: 'playerPositions',
        positions: positions
      }));
    }
  });
}

// WebSocket connection handling
wsServer.on('connection', (ws) => {
  console.log('Client connected');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      switch (data.type) {
        case 'identify':
          handleIdentify(ws, data);
          break;
        case 'chat':
          handleChat(ws, data);
          break;
        case 'loadChat':
          handleLoadChat(ws);
          break;
        case 'update':
          handleUpdate(ws, data);
          break;
        case 'clearBoard':
          handleClearBoard(ws);
          break;
        case 'checkSolution':
          handleCheckSolution(ws);
          break;
        case 'cellSelection':
          handleCellSelection(ws, data);
          break;
        default:
          console.log(`Unknown message type: ${data.type}`);
      }
    } catch (err) {
      console.error('Error processing message:', err);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    if (ws.clientId) {
      // Store the puzzle ID before removing the player
      const puzzleId = ws.puzzleId;
      
      // Remove player from their current puzzle
      removePlayerFromCurrentPuzzle(ws.clientId);
      
      // Clean up player position
      highlightState.playerPositions.delete(ws.clientId);
      
      // Broadcast updates only to the puzzle they were in
      if (puzzleId) {
        broadcastPlayerPositions(puzzleId);
        broadcastPlayers(puzzleId);
      }
    }
  });
});

// Start the server
server.listen(8080, '0.0.0.0', () => {
  console.log('Server running on http://0.0.0.0:8080');
  console.log('WebSocket server running on ws://0.0.0.0:8080');
});
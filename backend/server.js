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
    ORDER BY id DESC
    LIMIT 1;
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
    console.log('Board state:', boardState);
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
        })
      );

      // Broadcast the updated player list
      broadcastPlayers();
    } else if (data.type === 'chat') {
      // Handle chat messages
      const { message: chatMessage } = data;
      const { user, text } = chatMessage;

      // Insert the chat message into the database
      const db = new sqlite3.Database(dbPath);
      db.run(
        'INSERT INTO chat_logs (puzzle_id, user, message) VALUES (?, ?, ?)',
        [puzzleId, user, text], // Use the puzzleId here
        function (err) {
          if (err) {
            console.error('Error inserting chat message:', err.message);
          } else {
            console.log(`Chat message inserted for puzzle ${puzzleId} by ${user}`);
          }
        }
      );
      db.close();

      // Broadcast the chat message to all connected clients
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'chat', message: chatMessage }));
        }
      });
    } else if (data.type === 'loadChat') {
      // Fetch chat history for the current puzzle
      const db = new sqlite3.Database(dbPath);
      db.all(
        'SELECT user, message, time FROM chat_logs WHERE puzzle_id = ? ORDER BY time ASC',
        [puzzleId],
        (err, rows) => {
          if (err) {
            console.error('Error fetching chat history:', err.message);
          } else {
            // Send the chat history back to the client
            ws.send(JSON.stringify({ type: 'chatHistory', messages: rows }));
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
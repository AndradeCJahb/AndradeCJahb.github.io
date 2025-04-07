const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

let boardState = Array(9).fill(Array(9).fill('')); // Initialize empty 9x9 board

wss.on('connection', (ws) => {
  console.log('Client connected');

  // Send the current board state to the new client
  ws.send(JSON.stringify({ type: 'update', board: boardState }));

  // Handle messages from clients
  ws.on('message', (message) => {
    const data = JSON.parse(message);

    if (data.type === 'update') {
      boardState = data.board; // Update the board state
      // Broadcast the updated board to all clients
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'update', board: boardState }));
        }
      });
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

console.log('WebSocket server running on ws://localhost:8080');
import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

function Header() {
  return <h1 className="header">Suduoku</h1>;
}

function Cell({ value, isEditable, onChange }) {
  const handleChange = (event) => {
    const inputValue = event.target.value.slice(-1); // Get the last character entered
    if (/^[1-9]?$/.test(inputValue)) {
      onChange(inputValue); // Notify parent of the change
    }
  };

  return (
    <input
      type="text"
      value={value}
      onChange={isEditable ? handleChange : undefined} // Disable editing if not editable
      readOnly={!isEditable}
      maxLength="2" // Limit input to a single character
      className={isEditable ? 'cell' : 'non-editable-cell'}
    />
  );
}

function ThreeGrid({ gridData, onCellChange, rowOffset, colOffset }) {
  // Create a transposed version of the gridData for the inner 3x3 grid
  const transposedGridData = Array.from({ length: 3 }, (_, i) =>
    Array.from({ length: 3 }, (_, j) => gridData[j][i])
  );

  return (
    <div className="threeGrid">
      {transposedGridData.map((row, rowIndex) => (
        <div key={rowIndex} className="grid-row">
          {row.map((cell, colIndex) => (
            <Cell
              key={colIndex}
              value={cell.value}
              isEditable={cell.isEditable}
              onChange={(value) =>
                // The indices need to be swapped here for the correct mapping
                onCellChange(rowOffset + colIndex, colOffset + rowIndex, value)
              }
            />
          ))}
        </div>
      ))}
    </div>
  );
}
function FinalGrid({ gridData, onCellChange }) {
  return (
    <div className="finalGrid">
      {Array.from({ length: 3 }, (_, gridRow) => (
        <div key={gridRow} className="grid-row">
          {Array.from({ length: 3 }, (_, gridCol) => (
            <ThreeGrid
              key={gridCol}
              gridData={gridData.slice(gridRow * 3, gridRow * 3 + 3).map((row) =>
                row.slice(gridCol * 3, gridCol * 3 + 3)
              )}
              onCellChange={onCellChange}
              rowOffset={gridRow * 3}
              colOffset={gridCol * 3}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// Check if a client ID exists in localStorage
let clientId = localStorage.getItem('clientId');
if (!clientId) {
  clientId = crypto.randomUUID();
  localStorage.setItem('clientId', clientId);
}

function App() {
  const [gridData, setGridData] = useState(
    Array(9).fill(Array(9).fill('')) // Initialize empty 9x9 grid
  );

  const [puzzleTitle, setPuzzleTitle] = useState(''); // State for the puzzle title
  const [clientInfo, setClientInfo] = useState({ name: '', color: '' }); // State for the client's name and color
  const [players, setPlayers] = useState([]); // State for the list of connected players
  const [chatInput, setChatInput] = useState(''); // State for the chat input box
  const [chatMessages, setChatMessages] = useState([]); // State for the list of chat messages
  
  const chatLogRef = useRef(null);
  const ws = useRef(null); // Use useRef to persist the WebSocket instance

  useEffect(() => {
    // Scroll to the bottom of the chat log whenever messages are updated
    if (chatLogRef.current) {
      chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
    }
  }, [chatMessages]);

  useEffect(() => {
    ws.current = new WebSocket(' https://dabf-2601-1c2-4503-61b0-9d5b-8d64-ba07-e34a.ngrok-free.app'); // Connect to the backend WebSocket server

    ws.current.onopen = () => {
      console.log('Connected to WebSocket server');

      // Send the client ID to the server
      ws.current.send(JSON.stringify({ type: 'identify', clientId }));
  
      // Request chat history for the current puzzle
      ws.current.send(JSON.stringify({ type: 'loadChat' }));
    };

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'update') {
        // Update the grid with the new state from the server
        const updatedGrid = Array.from({ length: 9 }, (_, rowIndex) =>
          Array.from({ length: 9 }, (_, colIndex) => ({
            value: data.board[colIndex][rowIndex].value, // Swap row and column indices
            isEditable: data.board[colIndex][rowIndex].isEditable, // Swap row and column indices
          }))
        );
    
        setGridData(updatedGrid); // Set the grid data in row-major order
        setPuzzleTitle(data.title); // Update the puzzle title
    
        if (data.client) {
          setClientInfo(data.client); // Set the client's name and color
        }
      } else if (data.type === 'players') {
        setPlayers(data.players); // Update the list of connected players 
      } else if (data.type === 'chatHistory') {
        setChatMessages(data.messages); // Load chat history
      }
    };

    ws.current.onclose = () => {
      console.log('Disconnected from WebSocket server');
    };

    return () => ws.current.close(); // Clean up WebSocket connection on unmount
  }, []);

  const sendChatMessage = () => {
    if (chatInput.trim() !== '') {
      const message = {
        user: clientInfo.name,
        color: clientInfo.color,
        text: chatInput,
        puzzleId: 1, // Replace with the actual puzzle ID
      };
  
      // Send the chat message to the server
      ws.current.send(JSON.stringify({ type: 'chat', message }));
  
      // Clear the input box after sending the message
      setChatInput('');
    }
  };

  const handleCellChange = (row, col, value) => {
    const newGrid = gridData.map((r, rowIndex) =>
      r.map((cell, colIndex) =>
        rowIndex === row && colIndex === col
          ? { ...cell, value } // Update only the value property
          : cell
      )
    );

    setGridData(newGrid);

    // Send the updated grid to the server
    ws.current.send(JSON.stringify({ type: 'update', board: newGrid }));
  };

  return (
    <div>
      <div>
        <Header />
        <div className="sudokuTitle">{puzzleTitle}</div>
        <FinalGrid gridData={gridData} onCellChange={handleCellChange} />
      </div>

      <div className="clientInfo">
        <span>You are:</span>
        <span style={{ color: clientInfo.color }}> {clientInfo.name}</span>
      </div>

      <h3 className="playerHeader">Connected Players:</h3>

      <div className="playerList">
        <ul>
          {players.map((player, index) => (
            <li key={index} style={{ color: player.color }}>
              {player.name}
            </li>
          ))}
        </ul>
      </div>

      <div className="chatBox">
      <div className="chatLog" ref={chatLogRef}>
  {chatMessages.map((msg, index) => (
    <div key={index}>
      <strong style={{ color: msg.color || '#000' }}>{msg.user}:</strong>
      <span className="message">{msg.message}</span>
      <span className="time">
        {new Date(msg.time).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })}
      </span>
    </div>
  ))}
</div>

        <div className="chatInput">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                sendChatMessage(); // Trigger the sendChatMessage function on Enter
              }
            }}
            placeholder="Type to chat"
          />
        </div>
</div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
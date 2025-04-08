import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

function Header() {
  return <h1 className="header">Suduoku</h1>;
}

function Cell({ value, isEditable, onChange, isIncorrect }) {
  const handleChange = (event) => {
    const inputValue = event.target.value.slice(-1);
    if (/^[1-9]?$/.test(inputValue)) {
      onChange(inputValue);
    }
  };

  // Determine the CSS class based on both editable state and incorrect state
  let cellClass = isEditable ? 'cell' : 'non-editable-cell';
  if (isIncorrect) {
    cellClass += ' incorrect-cell';
  }

  return (
    <input
      type="text"
      value={value}
      onChange={isEditable ? handleChange : undefined}
      readOnly={!isEditable}
      maxLength="2"
      className={cellClass}
    />
  );
}

function ThreeGrid({ gridData, onCellChange, rowOffset, colOffset, incorrectCells }) {
  const transposedGridData = Array.from({ length: 3 }, (_, i) =>
    Array.from({ length: 3 }, (_, j) => gridData[j][i])
  );

  return (
    <div className="threeGrid">
      {transposedGridData.map((row, rowIndex) => (
        <div key={rowIndex} className="grid-row">
          {row.map((cell, colIndex) => {
            // Calculate the global row and column for this cell
            const globalRow = rowOffset + colIndex;
            const globalCol = colOffset + rowIndex;
            
            // Check if this cell is in the incorrect cells list
            const isIncorrect = incorrectCells.some(
              cell => cell.row === globalRow && cell.col === globalCol
            );
            
            return (
              <Cell
                key={colIndex}
                value={cell.value}
                isEditable={cell.isEditable}
                isIncorrect={isIncorrect}
                onChange={(value) =>
                  onCellChange(globalRow, globalCol, value)
                }
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function FinalGrid({ gridData, onCellChange, incorrectCells }) {
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
              incorrectCells={incorrectCells}
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
  const [puzzleId, setPuzzleId] = useState(null); // Add state for the puzzle ID
  const [clientInfo, setClientInfo] = useState({ name: '', color: '' }); // State for the client's name and color
  const [players, setPlayers] = useState([]); // State for the list of connected players
  const [chatInput, setChatInput] = useState(''); // State for the chat input box
  const [chatMessages, setChatMessages] = useState([]); // State for the list of chat messages
  const [incorrectCells, setIncorrectCells] = useState([]); // Track incorrect cells
  
  const chatLogRef = useRef(null);
  const ws = useRef(null); // Use useRef to persist the WebSocket instance

  useEffect(() => {
    // Scroll to the bottom of the chat log whenever messages are updated
    if (chatLogRef.current) {
      chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
    }
  }, [chatMessages]);

  useEffect(() => {
    ws.current = new WebSocket('https://3197-24-20-96-196.ngrok-free.app '); // Connect to the backend WebSocket server

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

        if (data.puzzleId) {
          setPuzzleId(data.puzzleId);
        }

        if (data.client) {
          setClientInfo(data.client); // Set the client's name and color
        }
      } else if (data.type === 'players') {
        setPlayers(data.players); // Update the list of connected players 
      } else if (data.type === 'chatHistory') {
        setChatMessages(data.messages); // Load chat history
      } else if (data.type === 'checkResult') {
        if (data.error) {
          alert(data.error);
        } else {
          // This should completely replace the current incorrectCells state
          setIncorrectCells(data.incorrectCells);
        }
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
        puzzleId: puzzleId || 1, // Use the actual puzzle ID from state
      };
      
      // Send the chat message to the server
      ws.current.send(JSON.stringify({ type: 'chat', message }));
      
      // Clear the input box after sending the message
      setChatInput('');
    }
  };

  const handleCheckSolution = () => {
    // Request solution check from server
    ws.current.send(JSON.stringify({ 
      type: 'checkSolution'
    }));
  };

  const handleCellChange = (row, col, value) => {
    // Update the local grid
    const newGrid = gridData.map((r, rowIndex) =>
      r.map((cell, colIndex) =>
        rowIndex === row && colIndex === col
          ? { ...cell, value }
          : cell
      )
    );
  
    // Update local state
    setGridData(newGrid);
  
    // Don't modify incorrectCells locally, let the server broadcast the changes
    // setIncorrectCells(prev => prev.filter(cell => !(cell.row === row && cell.col === col)));
  
    // Transpose the grid before sending to the server
    const transposedGrid = Array.from({ length: 9 }, (_, rowIndex) =>
      Array.from({ length: 9 }, (_, colIndex) => ({
        value: newGrid[colIndex][rowIndex].value,
        isEditable: newGrid[colIndex][rowIndex].isEditable,
      }))
    );
  
    // Send with properly transposed coordinates for changedCell
    ws.current.send(JSON.stringify({ 
      type: 'update', 
      board: transposedGrid,
      changedCell: { 
        row: col,  // Note the transposition here
        col: row
      }
    }));
  };

  const handleClearBoard = () => {
    // Create a new grid with only locked cells
    const clearedGrid = gridData.map(row =>
      row.map(cell => ({
        ...cell,
        value: cell.isEditable ? '' : cell.value
      }))
    );
    
    // Update local state
    setGridData(clearedGrid);
    
    setIncorrectCells([]);
    // Transpose the grid before sending to the server
    const transposedGrid = Array.from({ length: 9 }, (_, rowIndex) =>
      Array.from({ length: 9 }, (_, colIndex) => ({
        value: clearedGrid[colIndex][rowIndex].value,
        isEditable: clearedGrid[colIndex][rowIndex].isEditable,
      }))
    );
    
    // Send the cleared grid to the server
    ws.current.send(JSON.stringify({ 
      type: 'clearBoard', 
      board: transposedGrid 
    }));
  };


  return (
    <div>
      <div>
        <Header />
        <div className="sudokuTitle">{puzzleTitle}</div>
        <FinalGrid 
  gridData={gridData} 
  onCellChange={handleCellChange}
  incorrectCells={incorrectCells}
/>
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

<div className="boardControls">
  <button 
    className="clearBoardBtn" 
    onClick={handleClearBoard}
  >
    Clear Board
  </button>
  <button 
    className="checkSolutionBtn" 
    onClick={handleCheckSolution}
  >
    Check Solution
  </button>
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
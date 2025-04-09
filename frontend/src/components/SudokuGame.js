import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from './Header';
import '../index.css';

function Cell({ value, isEditable, onChange, isIncorrect, row, col, playerPositions, wsRef }) {
  const handleChange = (event) => {
    const inputValue = event.target.value.slice(-1);
    if (/^[1-9]?$/.test(inputValue)) {
      onChange(inputValue);
    }
  };

  // Send position to server when cell is focused
  const handleFocus = () => {
    if (wsRef && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ 
        type: 'cellSelection', 
        position: { row, col } 
      }));
    }
  };

  // Determine the CSS class based on editable state and incorrect state
  let cellClass = isEditable ? 'cell' : 'non-editable-cell';
  if (isIncorrect) {
    cellClass += ' incorrect-cell';
  }

  // Add player position highlights
  const playerHighlights = playerPositions
    .filter(player => player.position.row === row && player.position.col === col)
    .map(player => {
      return {
        boxShadow: `inset 0 0 0 3px ${player.color}`,
        zIndex: 1,
        position: 'relative'
      };
    })[0] || {};

  return (
    <input
      type="text"
      value={value}
      onChange={isEditable ? handleChange : undefined}
      onFocus={handleFocus}
      readOnly={!isEditable}
      maxLength="2"
      className={cellClass}
      style={playerHighlights}
    />
  );
}

function ThreeGrid({ gridData, onCellChange, rowOffset, colOffset, incorrectCells, playerPositions, wsRef }) {
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
                row={globalRow}
                col={globalCol}
                onChange={(value) =>
                  onCellChange(globalRow, globalCol, value)
                }
                playerPositions={playerPositions}
                wsRef={wsRef}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function FinalGrid({ gridData, onCellChange, incorrectCells, playerPositions, wsRef }) {
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
              playerPositions={playerPositions}
              wsRef={wsRef}
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

function SudokuGame() {
  const { puzzleId: urlPuzzleId } = useParams();
  const navigate = useNavigate();
  const [puzzleId, setPuzzleId] = useState(parseInt(urlPuzzleId, 10) || null);
  const [gridData, setGridData] = useState(Array(9).fill(Array(9).fill({ value: '', isEditable: true })));
  const [puzzleTitle, setPuzzleTitle] = useState('Loading puzzle...');
  const [clientInfo, setClientInfo] = useState({ name: '', color: '' });
  const [players, setPlayers] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [incorrectCells, setIncorrectCells] = useState([]);
  const [playerPositions, setPlayerPositions] = useState([]);
  const [connectionError, setConnectionError] = useState(false);

  const chatLogRef = useRef(null);
  const ws = useRef(null);

  useEffect(() => {
    // Scroll to the bottom of the chat log whenever messages are updated
    if (chatLogRef.current) {
      chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
    }
  }, [chatMessages]);

  useEffect(() => {
    // Use the correct WebSocket path with wss:// for secure connections
    const wsUrl = 'wss://da6d-2601-1c2-4503-61b0-62-7a49-5af4-c336.ngrok-free.app/ws';
    console.log(`Connecting to WebSocket at ${wsUrl}`);
    
    ws.current = new WebSocket(wsUrl);

  ws.current.onopen = () => {
    console.log('Connected to WebSocket server');
    setConnectionError(false);
    ws.current.send(JSON.stringify({ 
      type: 'identify', 
      clientId,
      puzzleId: puzzleId
    }));
    ws.current.send(JSON.stringify({ type: 'loadChat' }));
  };

    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnectionError(true);
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
        setIncorrectCells(data.incorrectCells);
      } else if (data.type === 'gameState') {
        // Handle combined game state update including player positions
        const updatedGrid = Array.from({ length: 9 }, (_, rowIndex) =>
          Array.from({ length: 9 }, (_, colIndex) => ({
            value: data.board[colIndex][rowIndex].value,
            isEditable: data.board[colIndex][rowIndex].isEditable,
          }))
        );
    
        setGridData(updatedGrid);
        setPuzzleTitle(data.title);
        if (data.puzzleId) {
          setPuzzleId(data.puzzleId);
        }
        setIncorrectCells(data.incorrectCells);
        
        // Add this line to update player positions from game state
        if (data.playerPositions) {
          setPlayerPositions(data.playerPositions);
        }
      } else if (data.type === 'playerPositions') {
        setPlayerPositions(data.positions);
      } else if (data.type === 'puzzleNotFound') {
        // Handle case where puzzle was not found
        alert('Puzzle not found. Returning to puzzle selection.');
        navigate('/');
      }
    };

    ws.current.onclose = () => {
      console.log('Disconnected from WebSocket server');
    };

    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [puzzleId, navigate]);

  const sendChatMessage = () => {
    if (chatInput.trim() !== '' && ws.current && ws.current.readyState === WebSocket.OPEN) {
      const message = {
        user: clientInfo.name,
        color: clientInfo.color,
        text: chatInput,
        puzzleId: puzzleId || 1,
      };
      
      ws.current.send(JSON.stringify({ type: 'chat', message }));
      setChatInput('');
    }
  };

  const handleCheckSolution = () => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ 
        type: 'checkSolution'
      }));
    }
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
  
    // Immediately remove this cell from incorrectCells locally for better user experience
    setIncorrectCells(prev => prev.filter(cell => !(cell.row === row && cell.col === col)));
  
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
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
          row: row,
          col: col
        }
      }));
    }
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
    
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      // Notify the server to clear the board
      ws.current.send(JSON.stringify({ 
        type: 'clearBoard'
      }));
    }
  };

  const handleReturnToMenu = () => {
    navigate('/');
  };

  if (connectionError) {
    return (
      <div>
        <Header />
        <div className="error-container">
          <h2>Connection Error</h2>
          <p>Unable to connect to the game server. Please try again later.</p>
          <button className="menu-button" onClick={handleReturnToMenu}>
            Return to Puzzle Selection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header />
      <div className="sudokuTitle">{puzzleTitle}</div>
      
      <div className="app-container">
        <div className="left-section">
          <div className="board-section">
            <FinalGrid 
              gridData={gridData} 
              onCellChange={handleCellChange}
              incorrectCells={incorrectCells}
              playerPositions={playerPositions}
              wsRef={ws} 
            />
          </div>
          
          <div className="board-controls-section">
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
        
        <div className="right-section">
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
                    sendChatMessage();
                  }
                }}
                placeholder="Type to chat"
              />
            </div>
          </div>
          
          <div className="players-section">
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
          </div>
        </div>
      </div>
    </div>
  );
}

export default SudokuGame;
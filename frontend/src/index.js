import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

function PermHeader() {
  return <h1 className="PermHeader">Suduoku</h1>;
}

function Cell({ value, onChange }) {
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
      onChange={handleChange}
      className="cell"
      maxLength="2" // Limit input to a single character
    />
  );
}

function ThreeGrid({ gridData, onCellChange, rowOffset, colOffset }) {
  return (
    <div className="threeGrid">
      {gridData.map((row, rowIndex) => (
        <div key={rowIndex} className="grid-row">
          {row.map((cell, colIndex) => (
            <Cell
              key={colIndex}
              value={cell}
              onChange={(value) =>
                onCellChange(rowOffset + rowIndex, colOffset + colIndex, value)
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

function App() {
  const [gridData, setGridData] = useState(
    Array(9).fill(Array(9).fill('')) // Initialize empty 9x9 grid
  );

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8080'); // Connect to the backend WebSocket server

    ws.onopen = () => {
      console.log('Connected to WebSocket server');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'update') {
        setGridData(data.board); // Update the grid with the new state from the server
      }
    };

    ws.onclose = () => {
      console.log('Disconnected from WebSocket server');
    };

    return () => ws.close(); // Clean up WebSocket connection on unmount
  }, []);

  const handleCellChange = (row, col, value) => {
    const newGrid = gridData.map((r, rowIndex) =>
      r.map((cell, colIndex) =>
        rowIndex === row && colIndex === col ? value : cell
      )
    );
    setGridData(newGrid);

    // Send the updated grid to the server
    const ws = new WebSocket('ws://localhost:8080');
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'update', board: newGrid }));
    };
  };

  return (
    <div>
      <PermHeader />
      <FinalGrid gridData={gridData} onCellChange={handleCellChange} />
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
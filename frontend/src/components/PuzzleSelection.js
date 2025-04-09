import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from './Header';

function PuzzleSelection() {
  const [puzzles, setPuzzles] = useState([]);
  const navigate = useNavigate();
  
  useEffect(() => {
    fetch('https://da6d-2601-1c2-4503-61b0-62-7a49-5af4-c336.ngrok-free.app/puzzles', {
      method: "get",
      headers: new Headers({
        "ngrok-skip-browser-warning": "69420",
      }),
    })
      .then(async response => {
        // Get the raw response text
        const rawText = await response.text();
        try {
          const data = JSON.parse(rawText);
          return data;
        } catch (parseError) {

          throw parseError;
        }
      })
      .then(data => {
        console.log('Setting puzzles with data:', data);
        setPuzzles(data);
      })
      .catch(err => {
        console.error('Error fetching puzzles:', err);
      });
  }, []);

  const handlePuzzleSelect = (puzzleId) => {
    navigate(`/puzzle/${puzzleId}`);
  };


  return (
    <div>
      <Header />
      <div className="container">        
        <div className="puzzle-grid">
          {puzzles.map(puzzle => (
            <div 
              key={puzzle.id} 
              className="puzzle-card"
              onClick={() => handlePuzzleSelect(puzzle.id)}
            >
              <h3>{puzzle.title}</h3>
              <div className="puzzle-meta">
                <span className="difficulty">{puzzle.difficulty || 'Medium'}</span>
                <span className="status">{puzzle.status || 'New'}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default PuzzleSelection;
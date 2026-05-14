import React from 'react';
import { useLocation } from 'react-router-dom';
import './Result.css';

const Result = () => {
  const location = useLocation();
  const { result, prize } = location.state || {};

  return (
    <div className="result">
      {result === 'WIN' ? (
        <div className="win">
          <h1>Congratulations!</h1>
          <p>You won: {prize}</p>
        </div>
      ) : (
        <div className="lose">
          <h1>Sorry, try again next time</h1>
        </div>
      )}
    </div>
  );
};

export default Result;
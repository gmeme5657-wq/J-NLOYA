import React, { useState, useEffect } from 'react';
import './Admin.css';

const Admin = () => {
  const [stats, setStats] = useState({});
  const [codes, setCodes] = useState([]);

  useEffect(() => {
    fetchStats();
    fetchCodes();
  }, []);

  const fetchStats = async () => {
    const response = await fetch('http://localhost:5000/api/admin/stats');
    const data = await response.json();
    setStats(data);
  };

  const fetchCodes = async () => {
    const response = await fetch('http://localhost:5000/api/admin/codes');
    const data = await response.json();
    setCodes(data);
  };

  const updateCode = async (code, isWinner, prize) => {
    await fetch(`http://localhost:5000/api/admin/code/${code}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_winner: isWinner, prize }),
    });
    fetchCodes();
  };

  return (
    <div className="admin">
      <h1>Admin Dashboard</h1>
      <div className="stats">
        <div className="card">Total Users: {stats.total_users}</div>
        <div className="card">Total Wins: {stats.total_wins}</div>
        <div className="card">Total Losses: {stats.total_losses}</div>
      </div>
      <h2>Coupon Codes</h2>
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Winner</th>
            <th>Prize</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {codes.map(code => (
            <tr key={code.code}>
              <td>{code.code}</td>
              <td>{code.is_winner ? 'Yes' : 'No'}</td>
              <td>{code.prize}</td>
              <td>
                <button onClick={() => updateCode(code.code, !code.is_winner, code.prize)}>Toggle Win</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default Admin;
import React, { useState } from 'react';
import axios from 'axios';

function MatchForm({ token, setToken }) {
  const [match, setMatch] = useState({
    tournament_id: 1,
    team1_id: 1,
    team2_id: 2,
    match_dttm: '2025-03-23T14:00:00',
    score_team1: 0,
    score_team2: 0
  });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleLogin = async () => {
    try {
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/login`, {
        username: 'admin',
        password: 'admin'
      });
      setToken(response.data.access_token); // Обновляем токен в App.js
      setError(null);
    } catch (err) {
      setError('Login failed');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${process.env.REACT_APP_API_URL}/matches`, match, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSuccess('Match added successfully');
      setError(null);
    } catch (err) {
      setError('Failed to add match');
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setMatch(prev => ({ 
      ...prev, 
      [name]: name === 'tournament_id' || name === 'team1_id' || name === 'team2_id' || name === 'score_team1' || name === 'score_team2' ? parseInt(value) || 0 : value 
    }));
  };

  return (
    <div>
      <h1>Admin - Add Match</h1>
      {!token && (
        <div>
          <button onClick={handleLogin}>Login as Admin</button>
          {error && <p>{error}</p>}
        </div>
      )}
      {token && (
        <form onSubmit={handleSubmit}>
          <div>
            <label>Tournament ID:</label>
            <input type="number" name="tournament_id" value={match.tournament_id} onChange={handleChange} />
          </div>
          <div>
            <label>Team 1 ID:</label>
            <input type="number" name="team1_id" value={match.team1_id} onChange={handleChange} />
          </div>
          <div>
            <label>Team 2 ID:</label>
            <input type="number" name="team2_id" value={match.team2_id} onChange={handleChange} />
          </div>
          <div>
            <label>Date/Time:</label>
            <input 
              type="datetime-local" 
              name="match_dttm" 
              value={match.match_dttm.slice(0, 16)} 
              onChange={handleChange} 
            />
          </div>
          <div>
            <label>Score Team 1:</label>
            <input type="number" name="score_team1" value={match.score_team1} onChange={handleChange} />
          </div>
          <div>
            <label>Score Team 2:</label>
            <input type="number" name="score_team2" value={match.score_team2} onChange={handleChange} />
          </div>
          <button type="submit">Add Match</button>
          {error && <p>{error}</p>}
          {success && <p>{success}</p>}
        </form>
      )}
    </div>
  );
}

export default MatchForm;
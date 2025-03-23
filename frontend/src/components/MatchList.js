import React, { useState, useEffect } from 'react';
import axios from 'axios';

function MatchList({ token }) {
  const [matches, setMatches] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchMatches = async () => {
      const apiUrl = process.env.REACT_APP_API_URL;
      const fullUrl = `${apiUrl}/matches`;
      console.log('API_URL from .env:', apiUrl);
      console.log('Fetching from:', fullUrl);
      try {
        const response = await axios.get(fullUrl);
        console.log('Response data:', response.data);
        setMatches(response.data);
      } catch (err) {
        console.error('Fetch error:', err);
        setError(`Failed to load matches: ${err.message}`);
      }
    };
    fetchMatches();
  }, []);

  return (
    <div style={{ padding: '20px' }}>
      <h1>Matches</h1>
      {token && <p>You are logged in as Admin</p>}
      {error ? (
        <div style={{ color: 'red' }}>{error}</div>
      ) : matches.length > 0 ? (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {matches.map(match => (
            <li key={match.match_id} style={{ border: '1px solid #ccc', margin: '10px 0', padding: '10px', borderRadius: '5px' }}>
              <strong>Team {match.team1_id} vs Team {match.team2_id}</strong>: {match.score_team1} - {match.score_team2} 
              <br /> 
              <span>Date: {new Date(match.match_dttm).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div>No matches yet</div>
      )}
    </div>
  );
}

export default MatchList;
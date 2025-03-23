import React, { useState } from 'react';
import { BrowserRouter as Router, Route, Routes, Link, Navigate } from 'react-router-dom';
import MatchList from './components/MatchList';
import MatchForm from './components/MatchForm';
import Login from './components/Login';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');

  const handleLogin = (newToken) => {
    setToken(newToken);
    localStorage.setItem('token', newToken);
  };

  const handleLogout = () => {
    setToken('');
    localStorage.removeItem('token');
  };

  return (
    <Router>
      <div>
        <nav>
          <ul>
            <li><Link to="/">Matches</Link></li>
            <li><Link to="/admin">Admin</Link></li>
            {!token && <li><Link to="/login">Login</Link></li>}
            {token && <li><button onClick={handleLogout}>Logout</button></li>}
          </ul>
        </nav>
        <Routes>
          <Route path="/" element={<MatchList token={token} />} />
          <Route path="/login" element={<Login setToken={handleLogin} />} />
          <Route 
            path="/admin" 
            element={
              token ? (
                <MatchForm token={token} setToken={handleLogin} />
              ) : (
                <Navigate to="/login" replace />
              )
            } 
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
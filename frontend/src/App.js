// import logo from './logo.svg';
// import './App.css';

// function App() {
//   return (
//     <div className="App">
//       <header className="App-header">
//         <img src={logo} className="App-logo" alt="logo" />
//         <p>
//           Edit <code>src/App.js</code> and save to reload.
//         </p>
//         <a
//           className="App-link"
//           href="https://reactjs.org"
//           target="_blank"
//           rel="noopener noreferrer"
//         >
//           Learn React
//         </a>
//       </header>
//     </div>
//   );
// }

// export default App;

import React from 'react';
import CreateTournament from './main'; // Импорт твоего компонента из main.js

function App() {
  return (
    <div className="App">
      <h1>My Tournament App</h1> {/* Опционально: заголовок приложения */}
      <CreateTournament /> {/* Рендеринг твоего компонента */}
    </div>
  );
}

export default App;

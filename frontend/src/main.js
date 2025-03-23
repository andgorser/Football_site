import { useState } from "react";

export default function CreateTournament() {
  const [form, setForm] = useState({ tournament_nm: "", start_date: "", end_date: "" });
  const [message, setMessage] = useState("");

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    try {
      const response = await fetch("http://localhost:8000/create_tournament/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (response.ok) {
        setMessage("Tournament created successfully! ID: " + data.id);
      } else {
        setMessage("Error: " + data.detail);
      }
    } catch (error) {
      setMessage("Failed to connect to server.");
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white shadow-md rounded-xl">
      <h2 className="text-xl font-semibold mb-4">Create Tournament</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input 
          type="text" 
          name="tournament_nm" 
          placeholder="Tournament Name" 
          value={form.tournament_nm} 
          onChange={handleChange} 
          className="w-full p-2 border rounded"
          required
        />
        <input 
          type="date" 
          name="start_date" 
          value={form.start_date} 
          onChange={handleChange} 
          className="w-full p-2 border rounded"
          required
        />
        <input 
          type="date" 
          name="end_date" 
          value={form.end_date} 
          onChange={handleChange} 
          className="w-full p-2 border rounded"
        />
        <button type="submit" className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600">
          Create
        </button>
      </form>
      {message && <p className="mt-4 text-center text-gray-700">{message}</p>}
    </div>
  );
}

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database setup
const db = new Database(path.join(__dirname, 'tasks.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    due_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// API routes
app.get('/api/tasks', (req, res) => {
  const { view } = req.query;

  let tasks;
  if (view === 'inbox') {
    tasks = db.prepare('SELECT * FROM tasks WHERE due_date IS NULL ORDER BY created_at DESC').all();
  } else if (view === 'week') {
    const now = new Date();
    const day = now.getDay(); // 0 = Sunday
    const sunday = new Date(now);
    sunday.setDate(now.getDate() - day);
    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);

    const fmt = d => d.toISOString().split('T')[0];
    tasks = db.prepare('SELECT * FROM tasks WHERE due_date >= ? AND due_date <= ? ORDER BY due_date ASC, created_at DESC').all(fmt(sunday), fmt(saturday));
  } else if (view === 'overdue') {
    const today = new Date().toISOString().split('T')[0];
    tasks = db.prepare('SELECT * FROM tasks WHERE due_date < ? ORDER BY due_date ASC, created_at DESC').all(today);
  } else {
    tasks = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all();
  }

  res.json(tasks);
});

app.put('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  const { description, due_date } = req.body;
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Task not found' });
  db.prepare('UPDATE tasks SET description = ?, due_date = ? WHERE id = ?')
    .run(description?.trim() || null, due_date || null, id);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  res.json(task);
});

app.post('/api/tasks', (req, res) => {
  const { title, description, due_date } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
  const stmt = db.prepare('INSERT INTO tasks (title, description, due_date) VALUES (?, ?, ?)');
  const result = stmt.run(title.trim(), description?.trim() || null, due_date || null);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(task);
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

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
    completed INTEGER NOT NULL DEFAULT 0,
    recurrence_type TEXT,
    recurrence_days TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// Migrate existing tables: add new columns if missing
const cols = db.prepare("PRAGMA table_info(tasks)").all().map(c => c.name);
if (!cols.includes('completed')) db.exec("ALTER TABLE tasks ADD COLUMN completed INTEGER NOT NULL DEFAULT 0");
if (!cols.includes('recurrence_type')) db.exec("ALTER TABLE tasks ADD COLUMN recurrence_type TEXT");
if (!cols.includes('recurrence_days')) db.exec("ALTER TABLE tasks ADD COLUMN recurrence_days TEXT");

// API routes
app.get('/api/tasks', (req, res) => {
  const { view } = req.query;

  let tasks;
  if (view === 'inbox') {
    tasks = db.prepare('SELECT * FROM tasks WHERE due_date IS NULL AND completed = 0 ORDER BY created_at DESC').all();
  } else if (view === 'week') {
    const now = new Date();
    const day = now.getDay(); // 0 = Sunday
    const sunday = new Date(now);
    sunday.setDate(now.getDate() - day);
    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);

    const fmt = d => d.toISOString().split('T')[0];
    tasks = db.prepare('SELECT * FROM tasks WHERE due_date >= ? AND due_date <= ? AND completed = 0 ORDER BY due_date ASC, created_at DESC').all(fmt(sunday), fmt(saturday));
  } else if (view === 'overdue') {
    const today = new Date().toISOString().split('T')[0];
    tasks = db.prepare('SELECT * FROM tasks WHERE due_date < ? AND completed = 0 ORDER BY due_date ASC, created_at DESC').all(today);
  } else {
    tasks = db.prepare('SELECT * FROM tasks WHERE completed = 0 ORDER BY created_at DESC').all();
  }

  res.json(tasks);
});

app.put('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  const { description, due_date, recurrence_type, recurrence_days } = req.body;
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Task not found' });
  db.prepare('UPDATE tasks SET description = ?, due_date = ?, recurrence_type = ?, recurrence_days = ? WHERE id = ?')
    .run(
      description?.trim() || null,
      due_date || null,
      recurrence_type || null,
      recurrence_days ? JSON.stringify(recurrence_days) : null,
      id
    );
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  res.json(task);
});

app.post('/api/tasks', (req, res) => {
  const { title, description, due_date, recurrence_type, recurrence_days } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
  const stmt = db.prepare('INSERT INTO tasks (title, description, due_date, recurrence_type, recurrence_days) VALUES (?, ?, ?, ?, ?)');
  const result = stmt.run(
    title.trim(),
    description?.trim() || null,
    due_date || null,
    recurrence_type || null,
    recurrence_days ? JSON.stringify(recurrence_days) : null
  );
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(task);
});

// Complete a task; if recurring, create the next instance
app.post('/api/tasks/:id/complete', (req, res) => {
  const { id } = req.params;
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  db.prepare('UPDATE tasks SET completed = 1 WHERE id = ?').run(id);

  let nextTask = null;
  if (task.recurrence_type && task.recurrence_days) {
    const days = JSON.parse(task.recurrence_days);
    const nextDue = computeNextDueDate(task.recurrence_type, days, task.due_date);
    if (nextDue) {
      const stmt = db.prepare('INSERT INTO tasks (title, description, due_date, recurrence_type, recurrence_days) VALUES (?, ?, ?, ?, ?)');
      const result = stmt.run(task.title, task.description, nextDue, task.recurrence_type, task.recurrence_days);
      nextTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
    }
  }

  res.json({ completed: db.prepare('SELECT * FROM tasks WHERE id = ?').get(id), nextTask });
});

function computeNextDueDate(type, days, currentDueDate) {
  // days is the recurrence config:
  //   weekly: { weekdays: [0,1,...6] }  (0=Sun, 1=Mon, ... 6=Sat)
  //   monthly/quarterly: { option: "first" | "last" | number(1-31) }
  const base = currentDueDate ? new Date(currentDueDate + 'T00:00:00') : new Date();
  const fmt = d => d.toISOString().split('T')[0];

  if (type === 'weekly') {
    const selected = days.weekdays.sort((a, b) => a - b);
    if (!selected.length) return null;
    const currentDay = base.getDay();
    // Find next selected day after current
    let next = selected.find(d => d > currentDay);
    const d = new Date(base);
    if (next !== undefined) {
      d.setDate(d.getDate() + (next - currentDay));
    } else {
      // Wrap to next week's first selected day
      d.setDate(d.getDate() + (7 - currentDay + selected[0]));
    }
    return fmt(d);
  }

  if (type === 'monthly' || type === 'quarterly') {
    const monthsToAdd = type === 'quarterly' ? 3 : 1;
    let year = base.getFullYear();
    let month = base.getMonth() + monthsToAdd;
    if (month > 11) { year += Math.floor(month / 12); month = month % 12; }

    if (days.option === 'first') {
      return fmt(new Date(year, month, 1));
    } else if (days.option === 'last') {
      return fmt(new Date(year, month + 1, 0));
    } else {
      const specificDay = parseInt(days.option);
      const lastDay = new Date(year, month + 1, 0).getDate();
      return fmt(new Date(year, month, Math.min(specificDay, lastDay)));
    }
  }

  return null;
}

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

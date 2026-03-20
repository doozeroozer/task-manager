const form = document.getElementById('task-form');
const taskList = document.getElementById('task-list');
let currentView = 'inbox';

async function loadTasks() {
  const res = await fetch(`/api/tasks?view=${currentView}`);
  const tasks = await res.json();
  renderTasks(tasks);
}

document.querySelector('.tab-bar').addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  currentView = tab.dataset.view;
  loadTasks();
});

function formatDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });
}

function formatTimestamp(ts) {
  return new Date(ts + 'Z').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  });
}

function renderTasks(tasks) {
  if (tasks.length === 0) {
    taskList.innerHTML = '<div class="empty-state">No tasks yet. Add one above!</div>';
    return;
  }

  taskList.innerHTML = tasks.map(task => `
    <div class="task-card" data-id="${task.id}">
      <h3>${escapeHtml(task.title)}</h3>
      ${task.description ? `<p>${escapeHtml(task.description)}</p>` : ''}
      <div class="task-meta">
        ${task.due_date ? `<span>Due: ${formatDate(task.due_date)}</span>` : ''}
        <span>Created: ${formatTimestamp(task.created_at)}</span>
      </div>
    </div>
  `).join('');

  taskList.querySelectorAll('.task-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      const task = tasks.find(t => t.id == id);
      openEditForm(card, task);
    });
  });
}

function openEditForm(card, task) {
  if (card.classList.contains('editing')) return;
  card.classList.add('editing');

  card.innerHTML = `
    <div class="edit-form">
      <h3 class="edit-title">${escapeHtml(task.title)}</h3>
      <div class="form-group">
        <label>Description</label>
        <textarea class="edit-description" rows="2">${escapeHtml(task.description || '')}</textarea>
      </div>
      <div class="edit-row">
        <div class="form-group">
          <label>Due Date</label>
          <input type="date" class="edit-due-date" value="${task.due_date || ''}">
        </div>
        <div class="edit-actions">
          <button class="btn-save">Save</button>
          <button class="btn-cancel">Cancel</button>
        </div>
      </div>
    </div>
  `;

  card.querySelector('.btn-save').addEventListener('click', async (e) => {
    e.stopPropagation();
    const description = card.querySelector('.edit-description').value;
    const due_date = card.querySelector('.edit-due-date').value;
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, due_date })
    });
    if (res.ok) loadTasks();
  });

  card.querySelector('.btn-cancel').addEventListener('click', (e) => {
    e.stopPropagation();
    loadTasks();
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('title').value;
  const description = document.getElementById('description').value;
  const due_date = document.getElementById('due_date').value;

  const res = await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, description, due_date })
  });

  if (res.ok) {
    form.reset();
    loadTasks();
  }
});

loadTasks();

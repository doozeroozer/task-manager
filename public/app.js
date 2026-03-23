const form = document.getElementById('task-form');
const taskList = document.getElementById('task-list');
let currentView = 'inbox';
let currentLabelFilter = null;

// Label filter bar elements
const labelFilterEl = document.getElementById('label-filter');
const labelFilterName = labelFilterEl.querySelector('.label-filter-name');
const topLabelsEl = document.getElementById('top-labels');
labelFilterEl.querySelector('.label-filter-clear').addEventListener('click', () => {
  currentLabelFilter = null;
  labelFilterEl.classList.add('hidden');
  refreshTopLabels();
  loadTasks();
});

async function refreshTopLabels() {
  const res = await fetch('/api/labels/top');
  const labels = await res.json();
  if (!labels.length) {
    topLabelsEl.innerHTML = '';
    return;
  }
  topLabelsEl.innerHTML = labels.map(l =>
    `<button class="top-label-btn ${currentLabelFilter == l.id ? 'active' : ''}" data-label-id="${l.id}" data-label-name="${escapeHtml(l.name)}">${escapeHtml(l.name)}</button>`
  ).join('');
  topLabelsEl.querySelectorAll('.top-label-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.labelId;
      if (currentLabelFilter == id) {
        currentLabelFilter = null;
        labelFilterEl.classList.add('hidden');
      } else {
        currentLabelFilter = id;
        labelFilterName.textContent = btn.dataset.labelName;
        labelFilterEl.classList.remove('hidden');
      }
      refreshTopLabels();
      loadTasks();
    });
  });
}

// Populate day selects for monthly/quarterly
['monthly-option', 'quarterly-option'].forEach(selId => {
  const sel = document.getElementById(selId);
  const optgroup = sel.querySelector('optgroup');
  for (let i = 1; i <= 31; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `Day ${i}`;
    optgroup.appendChild(opt);
  }
});

// Recurring toggle
const recurringToggle = document.getElementById('recurring-toggle');
const recurrenceOptions = document.getElementById('recurrence-options');
recurringToggle.addEventListener('change', () => {
  recurrenceOptions.classList.toggle('hidden', !recurringToggle.checked);
});

// Recurrence type buttons
let currentRecType = 'weekly';
document.querySelector('.recurrence-type-buttons').addEventListener('click', (e) => {
  const btn = e.target.closest('.rec-type-btn');
  if (!btn) return;
  document.querySelectorAll('.rec-type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentRecType = btn.dataset.type;
  document.querySelectorAll('.rec-config').forEach(c => c.classList.add('hidden'));
  document.getElementById(`rec-${currentRecType}`).classList.remove('hidden');
});

async function loadTasks() {
  let url = `/api/tasks?view=${currentView}`;
  if (currentLabelFilter) url += `&label=${currentLabelFilter}`;
  const res = await fetch(url);
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

function recurrenceLabel(task) {
  if (!task.recurrence_type) return '';
  const days = typeof task.recurrence_days === 'string' ? JSON.parse(task.recurrence_days) : task.recurrence_days;
  if (!days) return '';
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (task.recurrence_type === 'weekly') {
    const selected = (days.weekdays || []).map(d => dayNames[d]).join(', ');
    return `Repeats weekly: ${selected}`;
  }
  const label = task.recurrence_type === 'quarterly' ? 'quarterly' : 'monthly';
  if (days.option === 'first') return `Repeats ${label}: 1st`;
  if (days.option === 'last') return `Repeats ${label}: last day`;
  return `Repeats ${label}: day ${days.option}`;
}

function renderTasks(tasks) {
  if (tasks.length === 0) {
    taskList.innerHTML = '<div class="empty-state">No tasks yet. Add one above!</div>';
    return;
  }

  taskList.innerHTML = tasks.map(task => `
    <div class="task-card" data-id="${task.id}">
      <div class="task-header">
        <h3>${escapeHtml(task.title)}</h3>
        <button class="btn-complete" title="Complete task">&#10003;</button>
      </div>
      ${task.description ? `<p>${escapeHtml(task.description)}</p>` : ''}
      <div class="task-labels">
        ${(task.labels || []).map(l => `<button class="label-badge" data-label-id="${l.id}" data-label-name="${escapeHtml(l.name)}">${escapeHtml(l.name)}</button>`).join('')}
        <button class="btn-add-label">+ Label</button>
      </div>
      <div class="task-meta">
        ${task.due_date ? `<span>Due: ${formatDate(task.due_date)}</span>` : ''}
        ${task.recurrence_type ? `<span class="recurrence-badge">${escapeHtml(recurrenceLabel(task))}</span>` : ''}
        <span>Created: ${formatTimestamp(task.created_at)}</span>
      </div>
    </div>
  `).join('');

  taskList.querySelectorAll('.btn-complete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const card = btn.closest('.task-card');
      const id = card.dataset.id;
      await fetch(`/api/tasks/${id}/complete`, { method: 'POST' });
      loadTasks();
    });
  });

  // Label badge click -> filter by label
  taskList.querySelectorAll('.label-badge').forEach(badge => {
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      currentLabelFilter = badge.dataset.labelId;
      labelFilterName.textContent = badge.dataset.labelName;
      labelFilterEl.classList.remove('hidden');
      loadTasks();
    });
  });

  // + Label button -> open popover
  taskList.querySelectorAll('.btn-add-label').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = btn.closest('.task-card');
      const id = card.dataset.id;
      const task = tasks.find(t => t.id == id);
      openLabelPopover(btn, id, task.labels || []);
    });
  });

  taskList.querySelectorAll('.task-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      const task = tasks.find(t => t.id == id);
      openEditForm(card, task);
    });
  });
}

// Label popover
function openLabelPopover(anchorBtn, taskId, currentLabels) {
  // Close any existing popover
  const existing = document.querySelector('.label-popover');
  if (existing) existing.remove();

  const popover = document.createElement('div');
  popover.className = 'label-popover';
  popover.innerHTML = `
    <input type="text" class="label-search" placeholder="Search or create label...">
    <div class="label-list"></div>
  `;
  document.body.appendChild(popover);

  const rect = anchorBtn.getBoundingClientRect();
  popover.style.top = (rect.bottom + 4) + 'px';
  popover.style.left = rect.left + 'px';

  // Adjust if overflowing right
  if (rect.left + 240 > window.innerWidth) {
    popover.style.left = (window.innerWidth - 248) + 'px';
  }
  // Adjust if overflowing bottom
  if (rect.bottom + 284 > window.innerHeight) {
    popover.style.top = (rect.top - 284) + 'px';
  }

  const searchInput = popover.querySelector('.label-search');
  const labelList = popover.querySelector('.label-list');
  let allLabels = [];
  const assignedIds = new Set(currentLabels.map(l => l.id));

  async function fetchAndRender() {
    const res = await fetch('/api/labels');
    allLabels = await res.json();
    renderList('');
  }

  function renderList(query) {
    const q = query.toLowerCase();
    const filtered = q ? allLabels.filter(l => l.name.toLowerCase().includes(q)) : allLabels;

    if (filtered.length === 0 && !q) {
      labelList.innerHTML = '<div class="label-list-empty">No labels yet. Type to create one.</div>';
      return;
    }

    if (filtered.length === 0) {
      labelList.innerHTML = `<div class="label-list-empty">Press Enter to create "${escapeHtml(query)}"</div>`;
      return;
    }

    labelList.innerHTML = filtered.map(l =>
      `<div class="label-list-item ${assignedIds.has(l.id) ? 'assigned' : ''}" data-id="${l.id}" data-name="${escapeHtml(l.name)}">${escapeHtml(l.name)}</div>`
    ).join('');

    labelList.querySelectorAll('.label-list-item').forEach(item => {
      item.addEventListener('click', async () => {
        const labelId = parseInt(item.dataset.id);
        if (assignedIds.has(labelId)) {
          await fetch(`/api/tasks/${taskId}/labels/${labelId}`, { method: 'DELETE' });
          assignedIds.delete(labelId);
        } else {
          await fetch(`/api/tasks/${taskId}/labels`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: item.dataset.name })
          });
          assignedIds.add(labelId);
        }
        item.classList.toggle('assigned');
      });
    });
  }

  searchInput.addEventListener('input', () => renderList(searchInput.value));

  searchInput.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const val = searchInput.value.trim();
    if (!val) return;

    const match = allLabels.find(l => l.name.toLowerCase() === val.toLowerCase());
    if (match) {
      // Toggle existing label
      if (assignedIds.has(match.id)) {
        await fetch(`/api/tasks/${taskId}/labels/${match.id}`, { method: 'DELETE' });
        assignedIds.delete(match.id);
      } else {
        await fetch(`/api/tasks/${taskId}/labels`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: val })
        });
        assignedIds.add(match.id);
      }
    } else {
      // Create new label and assign
      const res = await fetch(`/api/tasks/${taskId}/labels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: val })
      });
      const label = await res.json();
      allLabels.push(label);
      assignedIds.add(label.id);
    }

    searchInput.value = '';
    renderList('');
  });

  // Close on click outside
  function onClickOutside(e) {
    if (!popover.contains(e.target) && e.target !== anchorBtn) {
      popover.remove();
      document.removeEventListener('mousedown', onClickOutside);
      refreshTopLabels();
      loadTasks();
    }
  }
  setTimeout(() => document.addEventListener('mousedown', onClickOutside), 0);

  searchInput.focus();
  fetchAndRender();
}

function buildRecurrenceEditor(prefix, task) {
  const days = task.recurrence_type && task.recurrence_days
    ? (typeof task.recurrence_days === 'string' ? JSON.parse(task.recurrence_days) : task.recurrence_days)
    : null;
  const recType = task.recurrence_type || 'weekly';
  const isRecurring = !!task.recurrence_type;

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekdayOrder = [1, 2, 3, 4, 5, 6, 0]; // Mon-Sun display order
  const selectedWeekdays = days && days.weekdays ? days.weekdays : [];
  const monthlyOption = days && days.option ? days.option : 'first';

  let monthlyOpts = '<option value="first">1st of the month</option><option value="last">Last day of the month</option>';
  for (let i = 1; i <= 31; i++) monthlyOpts += `<option value="${i}">Day ${i}</option>`;

  return `
    <div class="form-group recurring-toggle">
      <label class="toggle-label">
        <input type="checkbox" class="${prefix}-recurring-toggle" ${isRecurring ? 'checked' : ''}>
        <span class="toggle-switch"></span>
        Recurring
      </label>
    </div>
    <div class="${prefix}-recurrence-options recurrence-options ${isRecurring ? '' : 'hidden'}">
      <div class="form-group">
        <label>Recurrence Type</label>
        <div class="recurrence-type-buttons ${prefix}-rec-type-buttons">
          <button type="button" class="rec-type-btn ${recType === 'weekly' ? 'active' : ''}" data-type="weekly">Weekly</button>
          <button type="button" class="rec-type-btn ${recType === 'monthly' ? 'active' : ''}" data-type="monthly">Monthly</button>
          <button type="button" class="rec-type-btn ${recType === 'quarterly' ? 'active' : ''}" data-type="quarterly">Quarterly</button>
        </div>
      </div>
      <div class="${prefix}-rec-weekly rec-config ${recType === 'weekly' ? '' : 'hidden'}">
        <label>Repeat on</label>
        <div class="weekday-checkboxes">
          ${weekdayOrder.map(d => `<label><input type="checkbox" value="${d}" ${selectedWeekdays.includes(d) ? 'checked' : ''}> ${dayNames[d]}</label>`).join('')}
        </div>
      </div>
      <div class="${prefix}-rec-monthly rec-config ${recType === 'monthly' ? '' : 'hidden'}">
        <label>Day of month</label>
        <select class="${prefix}-monthly-option">${monthlyOpts.replace(`value="${monthlyOption}"`, `value="${monthlyOption}" selected`)}</select>
      </div>
      <div class="${prefix}-rec-quarterly rec-config ${recType === 'quarterly' ? '' : 'hidden'}">
        <label>Day of quarter start</label>
        <select class="${prefix}-quarterly-option">${monthlyOpts.replace(`value="${monthlyOption}"`, `value="${monthlyOption}" selected`)}</select>
      </div>
    </div>
  `;
}

function wireRecurrenceEditor(container, prefix) {
  let editRecType = container.querySelector(`.${prefix}-rec-type-buttons .rec-type-btn.active`)?.dataset.type || 'weekly';

  const toggle = container.querySelector(`.${prefix}-recurring-toggle`);
  const opts = container.querySelector(`.${prefix}-recurrence-options`);
  toggle.addEventListener('change', () => opts.classList.toggle('hidden', !toggle.checked));

  container.querySelector(`.${prefix}-rec-type-buttons`).addEventListener('click', (e) => {
    const btn = e.target.closest('.rec-type-btn');
    if (!btn) return;
    container.querySelectorAll(`.${prefix}-rec-type-buttons .rec-type-btn`).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    editRecType = btn.dataset.type;
    container.querySelectorAll(`.${prefix}-recurrence-options .rec-config`).forEach(c => c.classList.add('hidden'));
    container.querySelector(`.${prefix}-rec-${editRecType}`).classList.remove('hidden');
  });

  return () => {
    if (!toggle.checked) return { recurrence_type: null, recurrence_days: null };
    if (editRecType === 'weekly') {
      const weekdays = Array.from(container.querySelectorAll(`.${prefix}-rec-weekly input:checked`)).map(cb => parseInt(cb.value));
      return { recurrence_type: 'weekly', recurrence_days: { weekdays } };
    }
    const option = container.querySelector(`.${prefix}-${editRecType}-option`).value;
    return { recurrence_type: editRecType, recurrence_days: { option } };
  };
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
      ${buildRecurrenceEditor('edit', task)}
    </div>
  `;

  const getRecurrence = wireRecurrenceEditor(card, 'edit');

  card.querySelector('.btn-save').addEventListener('click', async (e) => {
    e.stopPropagation();
    const description = card.querySelector('.edit-description').value;
    const due_date = card.querySelector('.edit-due-date').value;
    const { recurrence_type, recurrence_days } = getRecurrence();
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, due_date, recurrence_type, recurrence_days })
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

function getCreateFormRecurrence() {
  if (!recurringToggle.checked) return { recurrence_type: null, recurrence_days: null };
  if (currentRecType === 'weekly') {
    const weekdays = Array.from(document.querySelectorAll('#rec-weekly input:checked')).map(cb => parseInt(cb.value));
    return { recurrence_type: 'weekly', recurrence_days: { weekdays } };
  }
  const option = document.getElementById(`${currentRecType}-option`).value;
  return { recurrence_type: currentRecType, recurrence_days: { option } };
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('title').value;
  const description = document.getElementById('description').value;
  const due_date = document.getElementById('due_date').value;
  const { recurrence_type, recurrence_days } = getCreateFormRecurrence();

  const res = await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, description, due_date, recurrence_type, recurrence_days })
  });

  if (res.ok) {
    form.reset();
    recurrenceOptions.classList.add('hidden');
    document.querySelectorAll('.rec-config').forEach(c => c.classList.add('hidden'));
    document.getElementById('rec-weekly').classList.remove('hidden');
    document.querySelectorAll('.rec-type-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.rec-type-btn[data-type="weekly"]').classList.add('active');
    currentRecType = 'weekly';
    loadTasks();
  }
});

refreshTopLabels();
loadTasks();

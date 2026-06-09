const API_URL = '/entries';

// ── Local storage keys ────────────────────────────────────────────────────────
const LS_NAME    = 'gt_name';
const LS_ENTRIES = 'gt_entries';   // cached copy of server entries
const LS_QUEUE   = 'gt_queue';     // entries saved while offline

// ── DOM refs ──────────────────────────────────────────────────────────────────
const form           = document.getElementById('entry-form');
const entriesTable   = document.querySelector('#entries-table tbody');
const totalCount     = document.getElementById('total-count');
const totalSpent     = document.getElementById('total-spent');
const avgPerGal      = document.getElementById('avg-per-gal');
const totalGallons   = document.getElementById('total-gallons');
const exportButton   = document.getElementById('export-csv');
const dateInput      = document.getElementById('date');
const amountInput    = document.getElementById('amount');
const priceInput     = document.getElementById('price');
const unitSelect     = document.getElementById('unit');
const currencySelect = document.getElementById('currency');
const stationInput   = document.getElementById('station');
const addedByInput   = document.getElementById('added_by');
const statusBar      = document.getElementById('status-bar');

const getTodayDate = () => new Date().toISOString().slice(0, 10);

// ── Status bar ────────────────────────────────────────────────────────────────
function showStatus(msg, type = 'info') {
  statusBar.textContent = msg;
  statusBar.className   = `status-bar status-${type}`;
  statusBar.hidden      = false;
}
function hideStatus() {
  statusBar.hidden = true;
}

function updateOnlineStatus() {
  const q = getQueue();
  if (!navigator.onLine) {
    showStatus('⚡ Offline — entries will sync when you reconnect', 'offline');
  } else if (q.length > 0) {
    showStatus(`⏳ Syncing ${q.length} pending entr${q.length === 1 ? 'y' : 'ies'}…`, 'syncing');
  } else {
    hideStatus();
  }
}

// ── Local storage helpers ─────────────────────────────────────────────────────
function getLocalEntries() {
  try { return JSON.parse(localStorage.getItem(LS_ENTRIES) || '[]'); } catch { return []; }
}
function setLocalEntries(entries) {
  localStorage.setItem(LS_ENTRIES, JSON.stringify(entries));
}
function getQueue() {
  try { return JSON.parse(localStorage.getItem(LS_QUEUE) || '[]'); } catch { return []; }
}
function setQueue(q) {
  localStorage.setItem(LS_QUEUE, JSON.stringify(q));
}

// ── Display helpers ───────────────────────────────────────────────────────────
function fmt$(value, currency) {
  const symbol = currency === 'CAD' ? 'C$' : '$';
  return `${symbol}${parseFloat(value).toFixed(2)}`;
}
function computePerGal(entry) {
  if (!entry.amount || entry.unit !== 'gallons') return null;
  return entry.price / entry.amount;
}
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Summary ───────────────────────────────────────────────────────────────────
function updateSummary(entries) {
  if (!entries.length) {
    [totalCount, totalSpent, avgPerGal, totalGallons].forEach(el => { el.textContent = '—'; });
    return;
  }
  const spent       = entries.reduce((s, e) => s + parseFloat(e.price), 0);
  const galEntries  = entries.filter(e => e.unit === 'gallons');
  const gals        = galEntries.reduce((s, e) => s + parseFloat(e.amount), 0);
  const currencies  = [...new Set(entries.map(e => e.currency))];
  const cur         = currencies.length === 1 ? currencies[0] : 'USD';

  totalCount.textContent   = entries.length;
  totalSpent.textContent   = fmt$(spent, cur);
  totalGallons.textContent = gals.toFixed(1) + ' gal';
  avgPerGal.textContent    = gals > 0 ? fmt$(spent / gals, cur) + '/gal' : '—';
}

// ── Table ─────────────────────────────────────────────────────────────────────
function renderEntries(entries) {
  // Pending queue items shown at top with a marker
  const queue = getQueue();
  const all   = [
    ...queue.map(e => ({ ...e, _pending: true })),
    ...entries,
  ];

  entriesTable.innerHTML = '';
  all.forEach(entry => {
    const perGal = computePerGal(entry);
    const row    = document.createElement('tr');
    if (entry._pending) row.classList.add('row-pending');
    row.innerHTML = `
      <td>${entry.date}${entry._pending ? ' <span class="pending-badge">pending</span>' : ''}</td>
      <td class="who">${esc(entry.added_by) || '<span class="muted">—</span>'}</td>
      <td>${esc(entry.station) || '<span class="muted">—</span>'}</td>
      <td>${parseFloat(entry.amount).toFixed(2)} ${entry.unit === 'gallons' ? 'gal' : 'L'}</td>
      <td>${fmt$(entry.price, entry.currency)}</td>
      <td>${perGal !== null ? fmt$(perGal, entry.currency) : '<span class="muted">—</span>'}</td>
      <td>${entry._pending ? '' : `<button class="remove-button" data-id="${entry.id}" title="Remove">✕</button>`}</td>
    `;
    entriesTable.appendChild(row);
  });

  updateSummary(all);
}

// ── Server sync ───────────────────────────────────────────────────────────────
async function flushQueue() {
  const queue = getQueue();
  if (!queue.length || !navigator.onLine) return;

  const remaining = [];
  for (const entry of queue) {
    try {
      const res = await fetch(API_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(entry),
      });
      if (!res.ok) remaining.push(entry);
    } catch {
      remaining.push(entry);
    }
  }
  setQueue(remaining);
}

async function refresh() {
  if (!navigator.onLine) {
    renderEntries(getLocalEntries());
    updateOnlineStatus();
    return;
  }
  try {
    await flushQueue();
    const res     = await fetch(API_URL);
    const entries = await res.json();
    setLocalEntries(entries);
    renderEntries(entries);
  } catch {
    renderEntries(getLocalEntries());
  }
  updateOnlineStatus();
}

// ── Form submit ───────────────────────────────────────────────────────────────
form.addEventListener('submit', async event => {
  event.preventDefault();

  const name = addedByInput.value.trim();
  if (name) localStorage.setItem(LS_NAME, name);

  const entry = {
    amount:   parseFloat(amountInput.value.replace(',', '.')) || 0,
    unit:     unitSelect.value,
    price:    parseFloat(priceInput.value.replace(',', '.')) || 0,
    currency: currencySelect.value,
    station:  stationInput.value.trim(),
    date:     dateInput.value || getTodayDate(),
    added_by: name,
  };

  const btn       = form.querySelector('button[type="submit"]');
  btn.disabled    = true;
  btn.textContent = 'Saving…';

  if (!navigator.onLine) {
    // Queue for later, show immediately in local cache
    const queue = getQueue();
    queue.unshift(entry);
    setQueue(queue);

    const saved = addedByInput.value;
    form.reset();
    addedByInput.value = saved;
    dateInput.value    = getTodayDate();

    renderEntries(getLocalEntries());
    showStatus(`⚡ Saved offline — will sync when you reconnect (${queue.length} pending)`, 'offline');
  } else {
    try {
      await fetch(API_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(entry),
      });
      const saved = addedByInput.value;
      form.reset();
      addedByInput.value = saved;
      dateInput.value    = getTodayDate();
      await refresh();
    } catch {
      // Server unreachable even though browser says online — queue it
      const queue = getQueue();
      queue.unshift(entry);
      setQueue(queue);
      renderEntries(getLocalEntries());
      showStatus('⚡ Could not reach server — saved locally', 'offline');
    }
  }

  btn.disabled    = false;
  btn.textContent = 'Save fill-up';
});

// ── Delete ────────────────────────────────────────────────────────────────────
entriesTable.addEventListener('click', async event => {
  const btn = event.target.closest('.remove-button');
  if (!btn) return;
  if (!confirm('Remove this entry?')) return;
  await fetch(`${API_URL}/${btn.dataset.id}`, { method: 'DELETE' });
  refresh();
});

// ── Export ────────────────────────────────────────────────────────────────────
exportButton.addEventListener('click', () => {
  const entries = getLocalEntries();
  if (!entries.length) return;
  const header = ['Date', 'Who', 'Station', 'Gallons', 'Unit', 'Total', 'Currency', '$/gal'];
  const rows   = entries.map(e => [
    e.date, e.added_by, e.station, e.amount, e.unit, e.price, e.currency,
    computePerGal(e) !== null ? computePerGal(e).toFixed(3) : '',
  ]);
  const csv  = [header, ...rows]
    .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'gas-entries.csv';
  a.click();
  URL.revokeObjectURL(url);
});

// ── Online/offline events ─────────────────────────────────────────────────────
window.addEventListener('online',  () => refresh());
window.addEventListener('offline', () => {
  renderEntries(getLocalEntries());
  updateOnlineStatus();
});

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('load', () => {
  dateInput.value = getTodayDate();

  const savedName = localStorage.getItem(LS_NAME);
  if (savedName) addedByInput.value = savedName;

  // Show cached data immediately so the app feels instant
  renderEntries(getLocalEntries());
  updateOnlineStatus();

  // Then fetch fresh data in the background
  refresh();
});

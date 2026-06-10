const API_URL = '/entries';

// ── Local storage keys ────────────────────────────────────────────────────────
const LS_ENTRIES = 'gt_entries';
const LS_QUEUE   = 'gt_queue';

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
const efsInput       = document.getElementById('efs_card');
const milesInput     = document.getElementById('miles');
const tripMilesInput = document.getElementById('trip-miles');
const usdHint        = document.getElementById('usd-hint');
const statusBar      = document.getElementById('status-bar');
const findNearbyBtn  = document.getElementById('find-nearby');
const nearbyList     = document.getElementById('nearby-list');
const submitBtn      = document.getElementById('submit-btn');
const cancelEditBtn  = document.getElementById('cancel-edit-btn');

const getTodayDate = () => new Date().toISOString().slice(0, 10);

let editingId = null;

function startEdit(entry) {
  editingId             = entry.id;
  amountInput.value     = entry.amount;
  unitSelect.value      = entry.unit;
  priceInput.value      = entry.price;
  currencySelect.value  = entry.currency;
  stationInput.value    = entry.station || '';
  dateInput.value       = entry.date;
  efsInput.checked      = !!entry.efs_card;
  milesInput.value      = entry.miles || '';
  submitBtn.textContent = 'Update entry';
  cancelEditBtn.hidden  = false;
  updateUsdHint();
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelEdit() {
  editingId             = null;
  form.reset();
  dateInput.value       = getTodayDate();
  tripMilesInput.value  = '';
  submitBtn.textContent = 'Save fill-up';
  cancelEditBtn.hidden  = true;
  hideStatus();
}

cancelEditBtn.addEventListener('click', cancelEdit);

// ── Trip miles ────────────────────────────────────────────────────────────────
function updateTripMiles() {
  const current = parseInt(milesInput.value);
  if (!current) { tripMilesInput.value = ''; return; }
  const entries  = getLocalEntries();
  const lastMiles = entries.find(e => e.miles && (!editingId || e.id !== editingId))?.miles;
  if (!lastMiles) { tripMilesInput.value = ''; return; }
  const trip = current - lastMiles;
  tripMilesInput.value = trip > 0 ? `${trip.toLocaleString()} mi` : '';
}

milesInput.addEventListener('input', updateTripMiles);

// ── CAD → USD rate ────────────────────────────────────────────────────────────
let cadToUsd = null;
async function getCadRate() {
  if (cadToUsd !== null) return cadToUsd;
  try {
    const res  = await fetch('https://api.frankfurter.app/latest?from=CAD&to=USD');
    const data = await res.json();
    cadToUsd   = data.rates.USD;
  } catch {
    cadToUsd = 0.73;
  }
  return cadToUsd;
}
async function updateUsdHint() {
  if (currencySelect.value !== 'CAD') { usdHint.hidden = true; return; }
  const price = parseFloat(priceInput.value.replace(',', '.'));
  if (!price)  { usdHint.hidden = true; return; }
  const rate = await getCadRate();
  usdHint.textContent = `≈ $${(price * rate).toFixed(2)} USD`;
  usdHint.hidden = false;
}

// ── Status bar ────────────────────────────────────────────────────────────────
function showStatus(msg, type = 'info') {
  statusBar.textContent = msg;
  statusBar.className   = `status-bar status-${type}`;
  statusBar.hidden      = false;
}
function hideStatus() { statusBar.hidden = true; }

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
  if (!entry.amount) return null;
  const gals    = entry.unit === 'liters' ? entry.amount / 3.78541 : entry.amount;
  const rate    = cadToUsd || 0.73;
  const priceUsd = entry.currency === 'CAD' ? entry.price * rate : entry.price;
  return priceUsd / gals;
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

  const LITERS_TO_GAL = 3.78541;
  const rate = cadToUsd || 0.73;

  const spentUsd = entries.reduce((s, e) => {
    const price = parseFloat(e.price);
    return s + (e.currency === 'CAD' ? price * rate : price);
  }, 0);

  const gals = entries.reduce((s, e) => {
    const amt = parseFloat(e.amount);
    return s + (e.unit === 'liters' ? amt / LITERS_TO_GAL : amt);
  }, 0);

  totalCount.textContent   = entries.length;
  totalSpent.textContent   = `$${spentUsd.toFixed(2)} USD`;
  totalGallons.textContent = gals.toFixed(1) + ' gal';
  avgPerGal.textContent    = gals > 0 ? `$${(spentUsd / gals).toFixed(2)}/gal` : '—';
}

// ── Table ─────────────────────────────────────────────────────────────────────
function renderEntries(entries) {
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
    const usdEquiv = (entry.currency === 'CAD' && cadToUsd)
      ? `<br><span class="usd-equiv">≈ $${(entry.price * cadToUsd).toFixed(2)} USD</span>`
      : '';
    row.innerHTML = `
      <td>${entry.date}${entry._pending ? ' <span class="pending-badge">pending</span>' : ''}</td>
      <td>${esc(entry.station) || '<span class="muted">—</span>'}</td>
      <td>${entry.miles ? entry.miles.toLocaleString() : '<span class="muted">—</span>'}</td>
      <td>${parseFloat(entry.amount).toFixed(2)} ${entry.unit === 'gallons' ? 'gal' : 'L'}</td>
      <td>${fmt$(entry.price, entry.currency)}${usdEquiv}</td>
      <td>${perGal !== null ? `$${perGal.toFixed(3)} USD` : '<span class="muted">—</span>'}</td>
      <td class="efs-cell">${entry.efs_card ? '<span class="efs-check">✓</span>' : '<span class="muted">—</span>'}</td>
      <td>${entry._pending ? '' : `<button class="edit-button" data-id="${entry.id}" title="Edit">✎</button>`}</td>
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

priceInput.addEventListener('input', updateUsdHint);
currencySelect.addEventListener('change', updateUsdHint);

// ── Form submit ───────────────────────────────────────────────────────────────
form.addEventListener('submit', async event => {
  event.preventDefault();

  const entry = {
    amount:   parseFloat(amountInput.value.replace(',', '.')) || 0,
    unit:     unitSelect.value,
    price:    parseFloat(priceInput.value.replace(',', '.')) || 0,
    currency: currencySelect.value,
    station:  stationInput.value.trim(),
    date:     dateInput.value || getTodayDate(),
    efs_card:   efsInput.checked,
    miles:      parseInt(milesInput.value) || null,
    trip_miles: parseInt(tripMilesInput.value.replace(/[^0-9]/g, '')) || null,
  };

  submitBtn.disabled    = true;
  submitBtn.textContent = editingId ? 'Updating…' : 'Saving…';

  if (editingId) {
    try {
      await fetch(`${API_URL}/${editingId}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(entry),
      });
      cancelEdit();
      await refresh();
    } catch {
      showStatus('⚠️ Could not update entry', 'offline');
      setTimeout(hideStatus, 3000);
    }
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Update entry';
    return;
  }

  if (!navigator.onLine) {
    const queue = getQueue();
    queue.unshift(entry);
    setQueue(queue);
    form.reset();
    dateInput.value      = getTodayDate();
    tripMilesInput.value = '';
    renderEntries(getLocalEntries());
    showStatus(`⚡ Saved offline — will sync when you reconnect (${queue.length} pending)`, 'offline');
  } else {
    try {
      await fetch(API_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(entry),
      });
      form.reset();
      dateInput.value      = getTodayDate();
      tripMilesInput.value = '';
      await refresh();
    } catch {
      const queue = getQueue();
      queue.unshift(entry);
      setQueue(queue);
      renderEntries(getLocalEntries());
      showStatus('⚡ Could not reach server — saved locally', 'offline');
    }
  }

  submitBtn.disabled    = false;
  submitBtn.textContent = 'Save fill-up';
});

// ── Nearby stations ───────────────────────────────────────────────────────────
findNearbyBtn.addEventListener('click', async () => {
  findNearbyBtn.textContent = '⏳';
  findNearbyBtn.disabled    = true;
  nearbyList.hidden         = true;

  try {
    const pos = await new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
    );
    const { latitude: lat, longitude: lon } = pos.coords;

    const query = `[out:json][timeout:25];nwr["amenity"="fuel"](around:3218,${lat},${lon});out tags;`;
    const res   = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body:   query,
    });
    const data = await res.json();

    const stations = [...new Set(
      data.elements
        .map(el => el.tags.name || el.tags.brand || el.tags.operator)
        .filter(Boolean)
    )].sort();

    showNearbyList(stations.length ? stations : ['No stations found nearby']);
  } catch (e) {
    showNearbyList([e.code === 1 ? 'Location access denied' : 'Could not find nearby stations']);
  } finally {
    findNearbyBtn.textContent = '📍';
    findNearbyBtn.disabled    = false;
  }
});

function showNearbyList(items) {
  nearbyList.innerHTML = '';
  items.forEach(name => {
    const btn  = document.createElement('button');
    btn.type        = 'button';
    btn.className   = 'nearby-item';
    btn.textContent = name;
    btn.addEventListener('click', () => {
      stationInput.value = name;
      nearbyList.hidden  = true;
    });
    nearbyList.appendChild(btn);
  });
  nearbyList.hidden = false;
}

document.addEventListener('click', e => {
  if (!nearbyList.contains(e.target) && e.target !== findNearbyBtn) {
    nearbyList.hidden = true;
  }
});

// ── Edit / Delete ─────────────────────────────────────────────────────────────
entriesTable.addEventListener('click', async event => {
  const editBtn = event.target.closest('.edit-button');
  if (editBtn) {
    const entries = getLocalEntries();
    const entry   = entries.find(e => e.id === parseInt(editBtn.dataset.id));
    if (entry) startEdit(entry);
    return;
  }

  const removeBtn = event.target.closest('.remove-button');
  if (!removeBtn) return;
  if (!confirm('Remove this entry?')) return;
  await fetch(`${API_URL}/${removeBtn.dataset.id}`, { method: 'DELETE' });
  refresh();
});

// ── Export ────────────────────────────────────────────────────────────────────
exportButton.addEventListener('click', () => {
  const entries = getLocalEntries();
  if (!entries.length) return;
  const header = ['Date', 'Station', 'Gallons', 'Unit', 'Total', 'Currency', '$/gal', 'EFS Card'];
  const rows   = entries.map(e => [
    e.date, e.station, e.amount, e.unit, e.price, e.currency,
    computePerGal(e) !== null ? computePerGal(e).toFixed(3) : '',
    e.efs_card ? 'Yes' : 'No',
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
  renderEntries(getLocalEntries());
  updateOnlineStatus();
  getCadRate().then(() => refresh());
});

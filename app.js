const storageKey = 'gas-tracker-entries';
const form = document.getElementById('entry-form');
const entriesTable = document.querySelector('#entries-table tbody');
const summaryText = document.getElementById('summary-text');
const totalCount = document.getElementById('total-count');
const totalSpent = document.getElementById('total-spent');
const avgPrice = document.getElementById('avg-price');
const exportButton = document.getElementById('export-csv');
const clearButton = document.getElementById('clear-entries');
const dateInput = document.getElementById('date');
const amountInput = document.getElementById('amount');
const priceInput = document.getElementById('price');
const unitSelect = document.getElementById('unit');
const currencySelect = document.getElementById('currency');
const stationInput = document.getElementById('station');

const getTodayDate = () => new Date().toISOString().slice(0, 10);

function loadEntries() {
  const raw = localStorage.getItem(storageKey);
  return raw ? JSON.parse(raw) : [];
}

function saveEntries(entries) {
  localStorage.setItem(storageKey, JSON.stringify(entries));
}

function formatCurrency(value, currency) {
  const symbol = currency === 'CAD' ? 'C$' : '$';
  return `${symbol}${value.toFixed(2)}`;
}

function formatAmount(amount, unit) {
  return `${amount.toFixed(2)} ${unit}`;
}

function computePerUnit(entry) {
  return entry.amount ? (entry.price / entry.amount).toFixed(2) : '0.00';
}

function updateSummary(entries) {
  if (!entries.length) {
    summaryText.textContent = 'No entries yet.';
    totalCount.textContent = '0';
    totalSpent.textContent = '$0.00';
    avgPrice.textContent = '$0.00';
    return;
  }

  const total = entries.reduce((sum, entry) => sum + entry.price, 0);
  const average = total / entries.length;
  const currencies = [...new Set(entries.map((entry) => entry.currency))];
  const summaryCurrency = currencies.length === 1 ? currencies[0] : 'USD';

  summaryText.textContent = `Showing ${entries.length} saved fill-up(s).`;
  totalCount.textContent = `${entries.length}`;
  totalSpent.textContent = formatCurrency(total, summaryCurrency);
  avgPrice.textContent = formatCurrency(average, summaryCurrency);
}

function renderEntries(entries) {
  entriesTable.innerHTML = '';

  entries.forEach((entry, index) => {
    const row = document.createElement('tr');

    row.innerHTML = `
      <td>${entry.date}</td>
      <td>${entry.station || '—'}</td>
      <td>${formatAmount(entry.amount, entry.unit)}</td>
      <td>${formatCurrency(entry.price, entry.currency)}</td>
      <td>${entry.currency}</td>
      <td>${formatCurrency(parseFloat(computePerUnit(entry)), entry.currency)} / ${entry.unit}</td>
      <td><button class="remove-button" data-index="${index}">Remove</button></td>
    `;

    entriesTable.appendChild(row);
  });
}

function refresh() {
  const entries = loadEntries();
  renderEntries(entries);
  updateSummary(entries);
}

function exportCsv(entries) {
  if (!entries.length) {
    return;
  }

  const header = ['Date', 'Station', 'Amount', 'Unit', 'Price', 'Currency', 'Per-unit'];
  const rows = entries.map((entry) => [
    entry.date,
    entry.station,
    entry.amount,
    entry.unit,
    entry.price,
    entry.currency,
    computePerUnit(entry),
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'gas-spending-entries.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const amountValue = amountInput.value.replace(',', '.');
  const priceValue = priceInput.value.replace(',', '.');

  const entry = {
    amount: parseFloat(amountValue) || 0,
    unit: unitSelect.value,
    price: parseFloat(priceValue) || 0,
    currency: currencySelect.value,
    station: stationInput.value.trim(),
    date: dateInput.value || getTodayDate(),
  };

  const entries = loadEntries();
  entries.unshift(entry);
  saveEntries(entries);
  refresh();
  form.reset();
  dateInput.value = getTodayDate();
});

entriesTable.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) {
    return;
  }

  const index = Number(button.dataset.index);
  if (Number.isNaN(index)) {
    return;
  }

  const entries = loadEntries();
  entries.splice(index, 1);
  saveEntries(entries);
  refresh();
});

exportButton.addEventListener('click', () => {
  const entries = loadEntries();
  exportCsv(entries);
});

clearButton.addEventListener('click', () => {
  if (!confirm('Clear all saved fill-up entries?')) {
    return;
  }

  localStorage.removeItem(storageKey);
  refresh();
});

window.addEventListener('load', () => {
  dateInput.value = getTodayDate();
  refresh();
});

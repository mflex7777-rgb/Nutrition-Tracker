(function () {
  const itemsEl = document.getElementById('items');
  const addItemBtn = document.getElementById('addItem');
  const lookupBtn = document.getElementById('lookupBtn');
  const errorBanner = document.getElementById('errorBanner');
  const resultsEl = document.getElementById('results');
  const unitBtns = document.querySelectorAll('.unit-btn');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const totalsPanel = document.getElementById('totalsPanel');
  const breakdownPanel = document.getElementById('breakdownPanel');

  let unit = 'g';
  let rowId = 0;

  function addRow(name = '', qty = '') {
    rowId += 1;
    const id = `row-${rowId}`;
    const row = document.createElement('div');
    row.className = 'item-row';
    row.dataset.id = id;
    row.innerHTML = `
      <input type="text" placeholder="Food name" value="${escapeHtml(name)}" data-role="name" />
      <input type="number" min="0" step="any" placeholder="Qty (${unit})" value="${escapeHtml(String(qty))}" data-role="qty" />
      <button type="button" class="remove-btn" aria-label="Remove item">×</button>
    `;
    row.querySelector('.remove-btn').addEventListener('click', () => {
      row.remove();
      if (!itemsEl.children.length) addRow();
    });
    itemsEl.appendChild(row);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function updateQtyPlaceholders() {
    itemsEl.querySelectorAll('input[data-role="qty"]').forEach((input) => {
      input.placeholder = `Qty (${unit})`;
    });
  }

  unitBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      unitBtns.forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      unit = btn.dataset.unit;
      updateQtyPlaceholders();
    });
  });

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      const showTotals = btn.dataset.tab === 'totals';
      totalsPanel.hidden = !showTotals;
      breakdownPanel.hidden = showTotals;
    });
  });

  addItemBtn.addEventListener('click', () => addRow());

  function collectItems() {
    const rows = Array.from(itemsEl.querySelectorAll('.item-row'));
    const items = [];
    for (const row of rows) {
      const name = row.querySelector('[data-role="name"]').value.trim();
      const qtyRaw = row.querySelector('[data-role="qty"]').value;
      if (!name && !qtyRaw) continue; // skip fully empty rows
      const qty = Number(qtyRaw);
      if (!name) throw new Error('Every food item needs a name.');
      if (!qty || qty <= 0) throw new Error(`"${name}" needs a quantity greater than 0.`);
      items.push({ name, qty, unit });
    }
    if (!items.length) throw new Error('Add at least one food item first.');
    return items;
  }

  function showError(message) {
    errorBanner.textContent = message;
    errorBanner.hidden = false;
  }

  function clearError() {
    errorBanner.hidden = true;
    errorBanner.textContent = '';
  }

  function renderResults(data) {
    document.getElementById('totalCalories').textContent = data.totals.calories;
    document.getElementById('totalProtein').textContent = `${data.totals.protein_g}g`;
    document.getElementById('totalFiber').textContent = `${data.totals.fiber_g}g`;

    const body = document.getElementById('breakdownBody');
    body.innerHTML = '';
    data.results.forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(r.name)}</td>
        <td>${r.qty}${escapeHtml(r.unit)}</td>
        <td>${r.calories}</td>
        <td>${r.protein_g}g</td>
        <td>${r.fiber_g}g</td>
      `;
      body.appendChild(tr);
    });

    resultsEl.hidden = false;
  }

  lookupBtn.addEventListener('click', async () => {
    clearError();
    let items;
    try {
      items = collectItems();
    } catch (e) {
      showError(e.message);
      return;
    }

    lookupBtn.disabled = true;
    lookupBtn.textContent = 'Looking up…';

    try {
      const resp = await fetch('/api/nutrition', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Something went wrong.');
      }
      renderResults(data);
    } catch (e) {
      showError(e.message || 'Something went wrong. Please try again.');
    } finally {
      lookupBtn.disabled = false;
      lookupBtn.textContent = 'Look up nutrition';
    }
  });

  // Start with two empty rows so the form doesn't look bare.
  addRow();
  addRow();
})();

(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const search = byId('searchForm');
  const input = byId('poNumber');
  const button = byId('loadBtn');
  const status = byId('statusMsg');
  const card = byId('resultCard');
  const fmt = num => Number(num || 0).toFixed(2);
  const show = (id, value) => { byId(id).textContent = String(value || '—'); };

  async function load(po) {
    card.classList.add('hidden');
    button.disabled = true;
    status.className = 'notice';
    status.textContent = `Checking ${po}...`;
    try {
      const response = await fetch(`../database/get-buyer-test-goods-receipt.php?po_number=${encodeURIComponent(po)}`, {
        method: 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store'
      });
      const data = await response.json();
      if (!response.ok || data.success !== true) throw new Error(data.message || `Server returned HTTP ${response.status}`);

      const p = data.purchase_order;
      const gr = data.test_receipt;
      show('title', p.po_number);
      show('poStatus', p.po_status.toUpperCase());
      show('pr', p.pr_number);
      show('request', p.inventory_request_number);
      show('supplier', p.supplier_name);
      show('gr', gr?.test_gr_number || 'No test receipt saved');
      show('date', gr?.received_date || '—');

      const tbody = byId('items');
      tbody.replaceChildren();
      for (const item of data.items) {
        const row = document.createElement('tr');
        for (const value of [item.item_name, fmt(item.qty_ordered), item.unit,
          item.test_delivered === null ? '—' : fmt(item.test_delivered),
          item.test_accepted === null ? '—' : fmt(item.test_accepted),
          item.test_rejected === null ? '—' : fmt(item.test_rejected),
          fmt(item.procurement_received)]) {
          const td = document.createElement('td'); td.textContent = String(value); row.appendChild(td);
        }
        tbody.appendChild(row);
      }
      const sum = (key) => data.items.reduce((acc, it) => acc + (Number(it[key]) || 0), 0);
      const accepted = sum('test_accepted');
      const recorded = sum('procurement_received');
      byId('matchNote').textContent = gr
        ? `TEST accepted: ${fmt(accepted)} | Procurement recorded received: ${fmt(recorded)}. No automatic synchronization was performed.`
        : 'No Inventory GR-TEST has been recorded for this PO. Procurement records remain unchanged.';
      status.textContent = gr
        ? 'Inventory GR-TEST found. Read-only comparison loaded successfully.'
        : 'PO found, but no Inventory GR-TEST is saved yet.';
      card.classList.remove('hidden');
    } catch (error) {
      status.className = 'error';
      status.textContent = error.message || 'Unable to load the test receipt.';
    } finally { button.disabled = false; }
  }

  search.addEventListener('submit', event => {
    event.preventDefault();
    const po = input.value.trim().toUpperCase();
    if (!/^PO-[A-Z0-9-]{1,26}$/.test(po)) {
      status.className = 'error'; status.textContent = 'Invalid PO number.'; return;
    }
    history.replaceState(null, '', `?po_number=${encodeURIComponent(po)}`);
    load(po);
  });

  const initial = new URLSearchParams(location.search).get('po_number');
  if (initial && /^PO-[A-Za-z0-9-]{1,26}$/.test(initial)) input.value = initial.toUpperCase();
  load(input.value.trim().toUpperCase());
})();

/* UniProcur Classroom Demo: browser-only, no API calls, no storage, no DB writes. */
'use strict';
(() => {
  const titles = [
    'PO Approved (Demo)', 'Supplier Confirmed (Demo)', 'In Transit (Demo)',
    'Out for Delivery (Demo)', 'Goods Received (Demo)',
    'Invoice Matched (Demo)', 'Finance Review Pending (Demo)',
    'Finance Approved (Demo)'
  ];
  const descriptions = [
    'The sample Purchase Order has been approved for demonstration.',
    'The example supplier confirmed the sample order. No message was sent.',
    'Materials are moving in the simulated delivery timeline.',
    'The demonstration delivery is marked out for delivery.',
    'A sample Goods Receipt is visible. No real stock or PO quantities were changed.',
    'The illustrative invoice matches the sample PO and sample Goods Receipt.',
    'Example invoice is awaiting simulated Finance review. No Finance API was called.',
    'The example review was approved only on this preview page. No real Finance decision or payment exists.'
  ];
  const actions = [
    'Simulate supplier confirmation', 'Simulate in transit', 'Simulate out for delivery',
    'Simulate Goods Receipt', 'Simulate invoice matching',
    'Simulate Finance review', 'Simulate Finance approval'
  ];
  const byId = id => document.getElementById(id);
  let stage = 0;
  function render() {
    byId('stagePill').textContent = titles[stage];
    byId('phaseDescription').textContent = descriptions[stage];
    byId('advanceDemo').textContent = actions[stage] || 'Demonstration completed';
    byId('advanceDemo').disabled = stage === titles.length - 1;
    const completed = stage < 6 ? stage : 6;
    byId('stageList').querySelectorAll('li').forEach((li, i) => {
      li.classList.toggle('done', i < completed);
      li.classList.toggle('current', i === completed);
      if (i === completed) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    byId('poStatus').textContent = titles[Math.min(stage, 4)];
    byId('grStatus').textContent = stage >= 4 ? 'Received (Demo)' : 'Awaiting simulated receipt';
    byId('acceptedQty').textContent = stage >= 4 ? '10 pairs (demo only)' : '—';
    byId('grNote').textContent = stage >= 4
      ? 'SIM-GR-0001 exists only in this browser preview. Inventory records were not created or updated.'
      : 'Click through the simulated delivery stages to reveal a sample receipt. No actual receiving occurs.';
    byId('invStatus').textContent = stage >= 5 ? 'Matched (Demo)' : 'Not verified (Demo)';
    byId('invGr').textContent = stage >= 4 ? '₱1,250.00 (Demo)' : 'Awaiting demo';
    byId('invNote').textContent = stage >= 5
      ? 'Simulated 3-way match only. Genuine supplier documents and actual Inventory receiving remain required.'
      : 'No actual invoice matching has occurred. The values shown are illustrative.';
    byId('financeStatus').textContent = stage >= 7 ? 'Approved (Demo)' : stage >= 6 ? 'Pending (Demo)' : 'Not started (Demo)';
    byId('financeState').textContent = stage >= 7 ? 'Simulated approval only' : stage >= 6 ? 'Simulated review pending' : 'Not submitted';
  }
  function tab(name) {
    ['po','gr','inv','fin'].forEach(value => {
      const selected = value === name;
      byId('tab-' + value).setAttribute('aria-selected', String(selected));
      byId('tab-' + value).tabIndex = selected ? 0 : -1;
      byId('pane-' + value).hidden = !selected;
    });
  }
  byId('advanceDemo').addEventListener('click', () => {
    if (stage < titles.length - 1) stage++;
    render();
    if (stage === 4) tab('gr');
    if (stage === 5) tab('inv');
    if (stage >= 6) tab('fin');
  });
  byId('resetDemo').addEventListener('click', () => { stage = 0; tab('po'); render(); });
  document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => tab(button.dataset.tab)));
  render();
})();

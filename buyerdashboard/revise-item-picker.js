/* UniProcur - Figma-style Add Item Picker for Rejected PR revisions.
 * Item catalog mirrors buyerdashboard/item-catalog.js (2026-11-13).
 * Selection is local to the open form; the user must Save Draft or Resubmit to write MySQL.
 */
'use strict';
(() => {
  const ITEMS = Object.freeze([
    {code:'LEA-0001', name:'Full-Grain Leather', category:'Leather', unit:'square feet'},
    {code:'LEA-0004', name:'Black Leather', category:'Leather', unit:'square feet'},
    {code:'LEA-0003', name:'Nubuck Leather', category:'Leather', unit:'square feet'},
    {code:'TEX-0001', name:'Mesh Fabric', category:'Textile', unit:'meters'},
    {code:'TEX-0003', name:'Canvas Fabric', category:'Textile', unit:'meters'},
    {code:'TEX-0004', name:'PU Leather', category:'Synthetic', unit:'meters'},
    {code:'COM-0001', name:'Rubber Sole', category:'Components', unit:'pairs'},
    {code:'COM-0002', name:'EVA Foam Sheets', category:'Components', unit:'pairs'},
    {code:'COM-0004', name:'Foam Insole', category:'Components', unit:'pairs'},
    {code:'HAR-0001', name:'Metal Eyelets', category:'Hardware', unit:'gross'},
    {code:'HAR-0002', name:'Metal Buckles', category:'Hardware', unit:'pieces'},
    {code:'HAR-0004', name:'Shoelaces', category:'Hardware', unit:'pieces'},
    {code:'PKG-0001', name:'Shoe Boxes', category:'Packaging', unit:'pieces'},
    {code:'PKG-0002', name:'Tissue Paper Rolls', category:'Packaging', unit:'pieces'},
    {code:'PKG-0003', name:'Packaging Tape', category:'Packaging', unit:'rolls'},
    {code:'ADH-0001', name:'Shoe Adhesive', category:'Adhesive', unit:'liters'}
  ]);

  function init() {
    if (!document.getElementById('itemRows') || document.getElementById('revItemPicker')) return;
    const markup = `
      <div class="rip-shell" role="dialog" aria-modal="true" aria-labelledby="ripTitle">
        <header class="rip-header">
          <div class="rip-brand">
            <span class="rip-logo"><img src="../assets/Pro%204.svg" alt=""></span>
            <span><small>Edit Purchase Request</small><strong id="ripTitle">Select an Item</strong></span>
          </div>
          <div class="rip-account"><strong id="ripBuyer">Buyer</strong><span class="rip-avatar" aria-hidden="true">B</span></div>
        </header>
        <div class="rip-paper">
          <div class="rip-inner">
            <div class="rip-toolbar">
              <form class="rip-search" id="ripSearchForm" role="search">
                <span class="rip-search-icon" aria-hidden="true"><img src="../assets/invoice-search.svg" alt=""></span>
                <input id="ripSearch" type="search" placeholder="search" aria-label="Search item code, name, category, or unit" autocomplete="off">
                <button class="rip-search-submit" type="submit">Search</button>
              </form>
              <div class="rip-filter-wrap">
                <button id="ripFilterToggle" type="button" class="rip-filter-btn" aria-expanded="false" aria-controls="ripFilterPanel"><span aria-hidden="true">☷</span> Filter</button>
                <div id="ripFilterPanel" class="rip-filter-panel" hidden>
                  <label for="ripCategory">Category</label>
                  <select id="ripCategory"><option value="all">All categories</option></select>
                  <button type="button" id="ripClear">Clear filter</button>
                </div>
              </div>
              <button id="ripCancel" class="rip-cancel" type="button">Cancel</button>
            </div>
            <div class="rip-table-caption"><strong>Available Materials</strong><span id="ripCount">16 items</span></div>
            <div class="rip-table-scroller" tabindex="0" aria-label="Available materials, scroll for more">
              <table class="rip-table">
                <thead><tr><th scope="col">Item Code</th><th scope="col">Item Name</th><th scope="col">Category</th><th scope="col">Unit of Measure</th><th scope="col"><span class="rip-sr">Action</span></th></tr></thead>
                <tbody id="ripRows"></tbody>
              </table>
            </div>
            <p class="rip-footnote">Choose a catalog item to add it to this Purchase Request. The item is not saved until you click Save Draft or Resubmit for Approval.</p>
          </div>
        </div>
      </div>`;
    const overlay = document.createElement('section');
    overlay.id = 'revItemPicker';
    overlay.className = 'rip-overlay';
    overlay.setAttribute('aria-label', 'Add a catalog item to the rejected Purchase Request');
    overlay.hidden = true;
    overlay.innerHTML = markup; // Static, developer-authored markup. No user data injected.
    document.body.appendChild(overlay);
    const $ = id => overlay.querySelector('#' + id);
    let priorFocus = null;
    let search = '';
    let category = 'all';

    for (const c of [...new Set(ITEMS.map(x => x.category))]) {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      $('ripCategory').append(opt);
    }

    function alreadyAdded(item) {
      return [...document.querySelectorAll('#itemRows .rev-item')].some(card => {
        const code = (card.querySelector('[data-field="code"]')?.value || '').trim().toLowerCase();
        const name = (card.querySelector('[data-field="name"]')?.value || '').trim().toLowerCase();
        return code === item.code.toLowerCase() || name === item.name.toLowerCase();
      });
    }

    function render() {
      const q = search.toLowerCase();
      const filtered = ITEMS.filter(item => (category === 'all' || category === item.category) &&
        (!q || [item.code, item.name, item.category, item.unit].some(val => val.toLowerCase().includes(q))));
      $('ripRows').replaceChildren();
      $('ripCount').textContent = `${filtered.length} item${filtered.length === 1 ? '' : 's'}`;
      if (!filtered.length) {
        const tr = document.createElement('tr'); const td = document.createElement('td');
        td.colSpan = 5; td.className = 'rip-empty'; td.textContent = 'No matching items found.';
        tr.append(td); $('ripRows').append(tr);
        return;
      }
      for (const item of filtered) {
        const tr = document.createElement('tr');
        for (const value of [item.code, item.name, item.category, item.unit]) {
          const td = document.createElement('td'); td.textContent = value; tr.append(td);
        }
        const actionTd = document.createElement('td'); actionTd.className = 'rip-action-cell';
        const button = document.createElement('button'); button.type = 'button';
        button.className = 'rip-add-button';
        const exists = alreadyAdded(item);
        button.textContent = exists ? 'Added' : 'Add Item';
        button.disabled = exists;
        button.setAttribute('aria-label', exists ? `${item.name} already in Purchase Request` : `Add ${item.name}`);
        button.addEventListener('click', () => {
          if (alreadyAdded(item)) { render(); return; }
          const before = document.querySelectorAll('#itemRows .rev-item').length;
          document.dispatchEvent(new CustomEvent('uniprocur:catalog-item-selected', { detail: { ...item } }));
          const after = document.querySelectorAll('#itemRows .rev-item').length;
          if (after !== before + 1) { window.alert('Could not add item. Refresh the Revise PR page and try again.'); return; }
          close();
        });
        actionTd.append(button); tr.append(actionTd); $('ripRows').append(tr);
      }
    }

    function open() {
      if (!overlay.hidden) return;
      priorFocus = document.activeElement;
      search = ''; category = 'all';
      $('ripSearch').value = '';
      $('ripCategory').value = 'all';
      $('ripFilterPanel').hidden = true;
      $('ripFilterToggle').setAttribute('aria-expanded','false');
      $('ripBuyer').textContent = document.getElementById('buyerName')?.textContent || 'Buyer';
      $('ripTitle').textContent = document.getElementById('prNumber')?.textContent || 'Select an Item';
      overlay.hidden = false;
      document.body.classList.add('rip-dialog-open');
      render();
      $('ripSearch').focus();
    }
    function close() {
      overlay.hidden = true;
      document.body.classList.remove('rip-dialog-open');
      if (priorFocus instanceof HTMLElement && priorFocus.isConnected) priorFocus.focus();
    }
    document.addEventListener('uniprocur:open-item-picker', open);
    $('ripCancel').addEventListener('click', close);
    $('ripSearchForm').addEventListener('submit', e => { e.preventDefault(); search = $('ripSearch').value.trim(); render(); });
    $('ripSearch').addEventListener('input', () => { search = $('ripSearch').value.trim(); render(); });
    $('ripFilterToggle').addEventListener('click', () => {
      const expanded = $('ripFilterPanel').hidden;
      $('ripFilterPanel').hidden = !expanded;
      $('ripFilterToggle').setAttribute('aria-expanded', String(expanded));
      if (expanded) $('ripCategory').focus();
    });
    $('ripCategory').addEventListener('change', () => { category = $('ripCategory').value; render(); });
    $('ripClear').addEventListener('click', () => { category = 'all'; $('ripCategory').value = 'all'; render(); });
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab') return;
      const focusable = [...overlay.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')].filter(el => el.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();

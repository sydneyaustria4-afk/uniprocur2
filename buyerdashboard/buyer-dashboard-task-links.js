/* UniProcur My Task navigation fix - navigation only, no database writes. */
'use strict';
(() => {
  const unavailable = new Map([
    ['Send Reminder', 'Supplier email reminders are not connected yet. Use View RFQ to review its status.'],
    ['Escalate to Manager', 'Manager escalation is not connected yet. Use View Task to inspect the rejected PR.'],
    ['Update Deadline', 'Rejected PR deadline editing is not connected yet. Use View Task to inspect the request.']
  ]);

  function markUnavailableButtons() {
    document.querySelectorAll('.task-board .task-action-button').forEach(button => {
      const label = button.textContent.replace(/\s+/g, ' ').trim();
      if (!unavailable.has(label)) return;
      button.disabled = true;
      button.title = unavailable.get(label);
      button.setAttribute('aria-label', `${label} - unavailable`);
    });
  }

  function go(page, parameter, number, extras = {}) {
    const query = new URLSearchParams({ [parameter]: number, ...extras });
    window.location.assign(`${page}?${query.toString()}`);
  }

  function notify(message) {
    const toast = document.getElementById('toast');
    if (!toast) { window.alert(message); return; }
    toast.textContent = message;
    toast.classList.add('show', 'visible', 'is-visible');
    window.setTimeout(() => toast.classList.remove('show', 'visible', 'is-visible'), 4500);
  }

  async function openRfQEditor(button, prNumber) {
    if (!/^PR-[A-Za-z0-9-]+$/.test(prNumber)) {
      notify('Cannot identify the selected Purchase Request.');
      return;
    }
    button.disabled = true;
    const previous = button.textContent;
    button.textContent = 'Opening RFQ...';
    try {
      const response = await fetch(
        '../database/get-purchase-request.php?pr_number=' + encodeURIComponent(prNumber),
        { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success !== true || !payload.purchase_request) {
        throw new Error(payload.message || 'Could not load the selected Purchase Request.');
      }
      const pr = payload.purchase_request;
      if (String(pr.pr_number) !== prNumber) {
        throw new Error('Purchase Request reference did not match.');
      }
      if (String(pr.status || '').toLowerCase() !== 'approved') {
        throw new Error('Only Manager-approved Purchase Requests can create an RFQ.');
      }
      if (!Number.isInteger(Number(pr.id)) || Number(pr.id) <= 0) {
        throw new Error('Missing Purchase Request ID.');
      }
      const query = new URLSearchParams({pr_id: String(pr.id), pr_number: pr.pr_number});
      window.location.assign('../PR202601/edit-rfq2.html?' + query.toString());
    } catch (error) {
      notify(error.message || 'Unable to open RFQ editor.');
      button.disabled = false;
      button.textContent = previous;
    }
  }

  // Capture before the legacy dashboard's document-level bubbling handler so its
  // placeholder data-toast cannot run after a real navigation action.
  document.addEventListener('click', event => {
    const source = event.target;
    if (!(source instanceof Element)) return;
    const button = source.closest('.task-board .task-action-button');
    if (!button || button.disabled) return;
    const label = button.textContent.replace(/\s+/g, ' ').trim();
    const supported = new Set([
      'Create RFQ', 'Print PR', 'View RFQ', 'View Invoice',
      'Print Invoice', 'Post Accounting', 'View Task'
    ]);
    if (!supported.has(label)) return; // Existing working handlers remain intact.
    event.preventDefault();
    event.stopImmediatePropagation();

    const card = button.closest('.task-item');
    const number = card?.querySelector('.task-reference')?.textContent?.trim() || '';
    if (!number) return notify('This task has no reference number. Refresh the dashboard.');

    if (label === 'Create RFQ') return void openRfQEditor(button, number);
    if (label === 'Print PR' && number.startsWith('PR-')) return go('view-purchase-request.html', 'pr', number, {print:'1'});
    if (label === 'View Task' && number.startsWith('PR-')) return go('view-purchase-request.html', 'pr', number);
    if (label === 'View RFQ' && number.startsWith('RFQ-')) return go('view-rfq.html', 'rfq_number', number);
    if ((label === 'View Invoice' || label === 'Print Invoice' || label === 'Post Accounting') && number.startsWith('INV-')) {
      // Accounting posting is NOT performed here. Open the authenticated invoice view;
      // its existing rules determine what can actually be done.
      return go('buyer-view-invoice.html', 'invoice_number', number, label === 'Print Invoice' ? {print:'1'} : {});
    }
    notify('The selected task has an unexpected reference number: ' + number);
  }, true);

  function init() {
    const board = document.querySelector('.task-board');
    if (!board) return;
    markUnavailableButtons();
    new MutationObserver(markUnavailableButtons).observe(board, {childList:true, subtree:true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();

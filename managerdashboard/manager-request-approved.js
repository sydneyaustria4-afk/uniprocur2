(() => {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const prNumber = String(params.get('pr') || '').trim();
  const API_URL = '../database/get-manager-purchase-request.php';

  const loadingState = document.getElementById('loading-state');
  const errorState = document.getElementById('error-state');
  const content = document.getElementById('approved-content');
  const toast = document.getElementById('approved-toast');
  let manager = null;
  let request = null;

  function safeText(value, fallback = '—') {
    const result = String(value ?? '').trim();
    return result || fallback;
  }

  function setText(id, value, fallback = '—') {
    const element = document.getElementById(id);
    if (element) element.textContent = safeText(value, fallback);
  }

  function formatDate(value, includeTime = false) {
    if (!value) return '—';
    const normalized = String(value).trim().replace(' ', 'T');
    const date = new Date(normalized.length === 10 ? `${normalized}T00:00:00` : normalized);
    if (Number.isNaN(date.getTime())) return String(value);
    const options = includeTime
      ? { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }
      : { year: 'numeric', month: 'long', day: '2-digit' };
    return new Intl.DateTimeFormat('en-PH', options).format(date);
  }

  function formatQuantity(value) {
    const number = Number(value);
    return Number.isFinite(number)
      ? number.toLocaleString('en-PH', { maximumFractionDigits: 2 })
      : safeText(value);
  }

  function renderItems(items) {
    const tbody = document.getElementById('approved-items');
    tbody.replaceChildren();
    if (!Array.isArray(items) || items.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 4;
      cell.className = 'empty-row';
      cell.textContent = 'No item rows were found for this Purchase Request.';
      row.append(cell);
      tbody.append(row);
      return;
    }

    items.forEach((item, index) => {
      const row = document.createElement('tr');
      const values = [String(index + 1), safeText(item.item_name), formatQuantity(item.qty), safeText(item.unit)];
      values.forEach((value) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      });
      tbody.append(row);
    });
  }

  function createHistoryItem(heading, lines) {
    const item = document.createElement('li');
    item.className = 'timeline-item complete';
    const dot = document.createElement('span');
    dot.className = 'timeline-dot';
    dot.setAttribute('aria-hidden', 'true');
    const details = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = heading;
    details.append(title);
    lines.filter(Boolean).forEach((line) => {
      const small = document.createElement('small');
      small.textContent = line;
      details.append(small);
    });
    item.append(dot, details);
    return item;
  }

  function renderHistory(pr, managerName) {
    const list = document.getElementById('approval-history');
    list.replaceChildren();
    list.append(
      createHistoryItem('Submitted', [
        formatDate(pr.created_at, true),
        `by ${safeText(pr.created_by_name, 'Buyer')}`
      ]),
      createHistoryItem('Reviewed', [`by ${managerName}`]),
      createHistoryItem('Approved / Rejected', [
        `${formatDate(pr.approved_at, true)} · by ${managerName}`
      ])
    );
  }

  function showToast(message) {
    if (!toast || !message) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.setTimeout(() => toast.classList.remove('is-visible'), 2600);
  }

  function showError(message) {
    loadingState.hidden = true;
    content.hidden = true;
    errorState.textContent = message;
    errorState.hidden = false;
  }

  function navigateToDetail() {
    if (!prNumber) {
      window.location.href = 'manager-purchase-requests.html';
      return;
    }
    window.location.href = `manager-view-purchase-request.html?pr=${encodeURIComponent(prNumber)}`;
  }

  async function loadApprovedRequest() {
    if (!prNumber) {
      showError('The Purchase Request number is missing from the page URL. Return to the Manager list and select a request again.');
      return;
    }

    try {
      const response = await fetch(`${API_URL}?pr_number=${encodeURIComponent(prNumber)}`, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Unable to load the approved Purchase Request.');
      }

      request = result.purchase_request;
      manager = result.manager || {};
      if (String(request.status || '').toLowerCase() !== 'approved') {
        throw new Error(`PR ${safeText(request.pr_number, prNumber)} is not marked as approved in the database. The success page cannot be displayed yet.`);
      }

      const managerName = safeText(request.approved_by_name, manager.full_name || 'Manager');
      setText('topbar-pr-number', request.pr_number);
      setText('approved-pr-number', request.pr_number);
      setText('approved-pr-inline', request.pr_number);
      setText('manager-name', manager.full_name || managerName, 'Manager');
      setText('manager-email', manager.email, '');
      setText('manager-avatar', (manager.full_name || managerName).charAt(0).toUpperCase());

      const remarks = String(request.manager_remarks || '').trim();
      setText('approval-remarks', remarks, 'No remarks were provided by the manager for this approval.');
      setText('decision-by', `Decision by ${managerName} · Manager`);
      renderItems(Array.isArray(result.items) ? result.items : []);
      renderHistory(request, managerName);

      loadingState.hidden = true;
      errorState.hidden = true;
      content.hidden = false;
    } catch (error) {
      console.error('Manager Approved page error:', error);
      showError(error.message || 'Unable to load the approved Purchase Request.');
    }
  }

  document.getElementById('back-to-detail').addEventListener('click', navigateToDetail);
  document.getElementById('back-to-list').addEventListener('click', () => {
    window.location.href = 'manager-purchase-requests.html';
  });
  document.getElementById('notifications-button').addEventListener('click', () => showToast('No new notifications.'));

  loadApprovedRequest();
})();

(() => {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const prNumber = String(params.get('pr') || '').trim();
  const API_URL = '../database/get-manager-purchase-request.php';
  const DECISION_URL = '../database/update-purchase-request-decision.php';
  const DOWNLOAD_URL = '../database/download-purchase-request-attachment.php';

  const loadingState = document.getElementById('loading-state');
  const errorState = document.getElementById('error-state');
  const content = document.getElementById('request-content');
  const backdrop = document.getElementById('decision-backdrop');
  const modal = document.querySelector('.decision-modal');
  const remarksInput = document.getElementById('manager-remarks');
  const modalError = document.getElementById('modal-error');
  const toast = document.getElementById('review-toast');

  let currentRequest = null;
  let currentItems = [];
  let currentManager = null;
  let csrfToken = '';
  let activeDecision = 'approve';
  let toastTimer = null;
  let previousFocus = null;

  function showToast(message) {
    if (!message) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2700);
  }

  function safeText(value, fallback = '—') {
    const result = String(value ?? '').trim();
    return result || fallback;
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
    if (!Number.isFinite(number)) return safeText(value);
    return number.toLocaleString('en-PH', { maximumFractionDigits: 2 });
  }

  function formatFileSize(bytes) {
    const size = Number(bytes || 0);
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  function setText(id, value, fallback = '—') {
    const element = document.getElementById(id);
    if (element) element.textContent = safeText(value, fallback);
  }

  function normalizeStatus(value) {
    const status = String(value || '').toLowerCase();
    if (status === 'submitted' || status === 'pending' || status === 'pending approval') return 'pending';
    if (status === 'approved') return 'approved';
    if (status === 'rejected') return 'rejected';
    return status || 'pending';
  }

  function statusLabel(status) {
    if (status === 'pending') return 'Pending Approval';
    if (status === 'approved') return 'Approved';
    if (status === 'rejected') return 'Rejected';
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  function calculateQuantitySummary(items) {
    const totals = new Map();
    items.forEach((item) => {
      const unit = safeText(item.unit, 'unit');
      totals.set(unit, (totals.get(unit) || 0) + Number(item.qty || 0));
    });
    return Array.from(totals.entries())
      .map(([unit, quantity]) => `${formatQuantity(quantity)} ${unit}`)
      .join(' / ') || '—';
  }

  function renderItems(items) {
    const tbody = document.getElementById('request-items');
    tbody.replaceChildren();

    if (!items.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 4;
      cell.className = 'empty-row';
      cell.textContent = 'No item rows were found for this request.';
      row.append(cell);
      tbody.append(row);
      return;
    }

    items.forEach((item, index) => {
      const row = document.createElement('tr');
      [String(index + 1), safeText(item.item_name), formatQuantity(item.qty), safeText(item.unit)].forEach((value) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      });
      tbody.append(row);
    });
  }

  function renderAttachments(attachments) {
    const list = document.getElementById('attachments-list');
    list.replaceChildren();

    if (!attachments.length) {
      const empty = document.createElement('p');
      empty.className = 'attachment-empty';
      empty.textContent = 'No attachments were added to this request.';
      list.append(empty);
      return;
    }

    attachments.forEach((file) => {
      const row = document.createElement('div');
      row.className = 'attachment-row';

      const icon = document.createElement('span');
      icon.className = 'file-icon';
      icon.textContent = String(file.name || '').toLowerCase().endsWith('.pdf') ? 'PDF' : 'FILE';
      icon.setAttribute('aria-hidden', 'true');

      const info = document.createElement('span');
      info.className = 'attachment-info';
      const name = document.createElement('strong');
      name.textContent = safeText(file.name, 'Attachment');
      const meta = document.createElement('small');
      const mimeLabel = String(file.mime_type || '').toLowerCase().includes('pdf') ? 'PDF' : safeText(file.mime_type, 'File');
      meta.textContent = `${mimeLabel} · ${formatFileSize(file.file_size)}`;
      info.append(name, meta);

      const view = document.createElement('a');
      view.className = 'attachment-view';
      view.href = `${DOWNLOAD_URL}?id=${encodeURIComponent(file.id)}`;
      view.target = '_blank';
      view.rel = 'noopener';
      view.textContent = 'View';
      view.setAttribute('aria-label', `View attachment ${safeText(file.name, 'file')}`);

      row.append(icon, info, view);
      list.append(row);
    });
  }

  function renderTimeline(request) {
    const status = normalizeStatus(request.status);
    const submittedText = formatDate(request.created_at, true);
    setText('timeline-submitted', submittedText);
    setText('timeline-submitter', `by ${safeText(request.created_by_name, 'Buyer')}`);

    const reviewText = document.getElementById('timeline-review');
    const decisionText = document.getElementById('timeline-decision');
    const reviewItem = reviewText.closest('.timeline-item');
    const decisionItem = decisionText.closest('.timeline-item');
    const decisionHeading = document.getElementById('timeline-decision-heading');

    reviewItem.classList.remove('complete', 'current');
    decisionItem.classList.remove('complete', 'current');

    if (status === 'approved' || status === 'rejected') {
      reviewItem.classList.add('complete');
      decisionItem.classList.add('complete');
      reviewText.textContent = 'Review completed';
      decisionHeading.textContent = status === 'approved' ? 'Approved' : 'Rejected';
      decisionText.textContent = `${formatDate(request.approved_at, true)} · by ${safeText(request.approved_by_name, currentManager?.full_name || 'The Manager')}`;
    } else {
      reviewItem.classList.add('current');
      decisionHeading.textContent = 'Approved / Rejected';
      reviewText.textContent = 'Awaiting Manager decision';
      decisionText.textContent = 'Not yet decided';
    }
  }

  function renderRequest(data) {
    const request = data.purchase_request;
    const items = Array.isArray(data.items) ? data.items : [];
    const attachments = Array.isArray(data.attachments) ? data.attachments : [];
    currentRequest = request;
    currentItems = items;
    currentManager = data.manager || {};
    csrfToken = String(data.csrf_token || '');

    const status = normalizeStatus(request.status);
    const label = document.getElementById('pr-status');
    label.textContent = statusLabel(status);
    label.className = `status-badge status-${status}`;

    setText('topbar-pr-number', request.pr_number);
    setText('pr-number', request.pr_number);
    setText('submitted-date', `Submitted ${formatDate(request.created_at, true)}`);
    setText('date-created', formatDate(request.created_at));
    setText('total-quantity', calculateQuantitySummary(items));
    setText('approved-date', status === 'approved'
      ? formatDate(request.approved_at)
      : status === 'rejected'
        ? `Rejected ${formatDate(request.approved_at)}`
        : 'Not yet approved');
    setText('required-date', formatDate(request.needed_by));

    const managerName = safeText(currentManager.full_name, 'Manager');
    setText('manager-name', managerName);
    setText('manager-email', currentManager.email || '');
    setText('manager-avatar', managerName.charAt(0).toUpperCase());

    renderItems(items);
    renderAttachments(attachments);
    renderTimeline(request);

    const canDecide = status === 'pending';
    const ownRequest = Number(request.created_by) === Number(currentManager.id);
    document.getElementById('review-actions').hidden = !canDecide || ownRequest;

    const finalNote = document.getElementById('final-status-note');
    finalNote.hidden = canDecide && !ownRequest;
    if (ownRequest) {
      finalNote.textContent = 'You cannot approve or reject a Purchase Request that you created.';
    } else if (!canDecide) {
      finalNote.textContent = `This Purchase Request has already been ${status}. The decision is recorded in the approval history.`;
    }

    setText('modal-pr-number', request.pr_number);
    setText('modal-items-count', `${items.length} ${items.length === 1 ? 'Item' : 'Items'}`);
    setText('modal-created-date', formatDate(request.created_at));
    setText('modal-required-date', formatDate(request.needed_by));

    loadingState.hidden = true;
    errorState.hidden = true;
    content.hidden = false;
  }

  async function loadRequest() {
    if (!prNumber) {
      showError('The Purchase Request number is missing from the page URL. Go back to the Manager list and select View again.');
      return;
    }

    loadingState.hidden = false;
    errorState.hidden = true;
    content.hidden = true;

    try {
      const response = await fetch(`${API_URL}?pr_number=${encodeURIComponent(prNumber)}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Unable to load Purchase Request.');
      }
      renderRequest(result);
    } catch (error) {
      showError(error.message || 'Unable to load Purchase Request.');
    }
  }

  function showError(message) {
    loadingState.hidden = true;
    content.hidden = true;
    errorState.hidden = false;
    errorState.textContent = message;
  }

  function openModal(decision) {
    if (!currentRequest) return;
    activeDecision = decision;
    previousFocus = document.activeElement;
    const isReject = decision === 'reject';

    modal.classList.toggle('is-reject', isReject);
    document.getElementById('modal-title').textContent = isReject ? 'Reject Purchase Request?' : 'Approve Purchase Request?';
    const requestNumber = safeText(currentRequest.pr_number, 'this Purchase Request');
    document.getElementById('modal-description').textContent = isReject
      ? 'Are you sure you want to reject this purchase request? The decision will be recorded in the approval history, and the requester will need to review the rejection reason.'
      : `Are you sure you want to approve ${requestNumber}? This will allow the request to proceed to the next procurement stage.`;
    document.getElementById('confirm-decision').textContent = isReject ? 'Reject Request' : 'Approve Request';
    document.querySelector('.remarks-label').innerHTML = 'Remarks <span>(Optional)</span>';
    remarksInput.placeholder = '';

    remarksInput.value = '';
    modalError.hidden = true;
    backdrop.hidden = false;
    remarksInput.focus();
  }

  function closeModal() {
    backdrop.hidden = true;
    if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
  }

  async function submitDecision() {
    if (!currentRequest) return;
    const remarks = remarksInput.value.trim();

    const confirmButton = document.getElementById('confirm-decision');
    confirmButton.disabled = true;
    confirmButton.textContent = activeDecision === 'reject' ? 'Rejecting...' : 'Approving...';
    modalError.hidden = true;

    try {
      const response = await fetch(DECISION_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({
          request_id: Number(currentRequest.id),
          decision: activeDecision,
          remarks
        })
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'The decision could not be saved.');
      }

      if (activeDecision === 'approve') {
        window.location.href = `manager-request-approved.html?pr=${encodeURIComponent(currentRequest.pr_number)}`;
        return;
      }

      if (activeDecision === 'reject') {
        window.location.href = `manager-request-rejected.html?pr=${encodeURIComponent(currentRequest.pr_number)}`;
        return;
      }

      closeModal();
      showToast(result.message || 'Decision saved.');
      await loadRequest();
    } catch (error) {
      modalError.textContent = error.message || 'Unable to save the decision.';
      modalError.hidden = false;
    } finally {
      confirmButton.disabled = false;
      confirmButton.textContent = activeDecision === 'reject' ? 'Reject Request' : 'Approve Request';
    }
  }

  document.getElementById('back-button').addEventListener('click', () => {
    window.location.href = 'manager-purchase-requests.html';
  });
  document.getElementById('open-approve').addEventListener('click', () => openModal('approve'));
  document.getElementById('open-reject').addEventListener('click', () => openModal('reject'));
  document.getElementById('close-modal').addEventListener('click', closeModal);
  document.getElementById('confirm-decision').addEventListener('click', submitDecision);

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) closeModal();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !backdrop.hidden) closeModal();
  });

  document.getElementById('notifications-button').addEventListener('click', () => {
    showToast('No new notifications.');
  });

  loadRequest();
})();

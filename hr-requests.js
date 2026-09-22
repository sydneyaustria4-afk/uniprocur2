const requestList = document.querySelector('#requestList');
const message = document.querySelector('#message');
const reviewerId = 1000;

async function loadRequests() {
  requestList.innerHTML = '<p class="empty">Loading requests...</p>';
  try {
    const response = await fetch('api/hr-requests.php');
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Requests could not be loaded.');
    if (!result.requests.length) {
      requestList.innerHTML = '<p class="empty">No account requests yet.</p>';
      return;
    }
    requestList.innerHTML = result.requests.map((request) => `
      <article class="request-card">
        <header><div><h2>${escapeHtml(request.full_name)}</h2><small>${escapeHtml(request.email)}</small></div><strong>${escapeHtml(request.status)}</strong></header>
        <div class="request-details"><div><span>Department</span><strong>${escapeHtml(request.department || 'N/A')}</strong></div><div><span>Position</span><strong>${escapeHtml(request.position || 'N/A')}</strong></div><div><span>Role</span><strong>${escapeHtml(request.requested_role)}</strong></div></div>
        <div class="purpose">${escapeHtml(request.purpose)}</div>
        ${request.status === 'Pending' ? `<div class="request-actions"><button class="reject" data-id="${request.request_id}" data-decision="reject">Reject</button><button data-id="${request.request_id}" data-decision="approve">Approve</button></div>` : ''}
      </article>`).join('');
    document.querySelectorAll('[data-decision]').forEach((button) => button.addEventListener('click', reviewRequest));
  } catch (error) {
    requestList.innerHTML = '<p class="empty">Unable to load requests.</p>';
    message.textContent = error.message;
  }
}

async function reviewRequest(event) {
  const button = event.currentTarget;
  button.disabled = true;
  const response = await fetch('api/hr-requests.php', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ requestId: button.dataset.id, reviewerId, decision: button.dataset.decision }) });
  const result = await response.json();
  message.textContent = result.temporaryPassword ? `${result.message} Username: ${result.username}; temporary password: ${result.temporaryPassword}` : result.message;
  await loadRequests();
}

function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character])); }
document.querySelector('#refreshButton').addEventListener('click', loadRequests);
loadRequests();

const recoveryForm = document.querySelector('#recoveryForm');
const recoveryEmail = document.querySelector('#recoveryEmail');
const formMessage = document.querySelector('#formMessage');
const toast = document.querySelector('#toast');
const reminderList = document.querySelector('#reminderList');

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('is-visible'), 3000);
}

recoveryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  formMessage.textContent = '';

  if (!recoveryEmail.value.trim() || !recoveryEmail.validity.valid) {
    formMessage.textContent = 'Enter a valid e-mail address.';
    recoveryEmail.focus();
    return;
  }

  try {
    const response = await fetch('api/request-reset.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: recoveryEmail.value.trim() })
    });
    const result = await response.json();
    if (!response.ok) {
      formMessage.textContent = result.message || 'Recovery request failed.';
      return;
    }
    sessionStorage.setItem('resetEmail', recoveryEmail.value.trim());
    if (result.debugCode) sessionStorage.setItem('resetDebugCode', result.debugCode);
    window.location.href = `reset-password.html?email=${encodeURIComponent(recoveryEmail.value.trim())}`;
  } catch (error) {
    formMessage.textContent = window.location.protocol === 'file:'
      ? 'Open this page through http://localhost/uniprocur2/.'
      : 'The PHP server returned an invalid response.';
  }
});

document.querySelector('#alternateButton').addEventListener('click', () => {
  reminderList.hidden = !reminderList.hidden;
  showToast(reminderList.hidden ? 'Recovery reminders hidden.' : 'Recovery reminders shown.');
});

document.querySelector('#registerButton').addEventListener('click', () => {
  window.location.href = 'registration.html';
});

document.querySelector('#backButton').addEventListener('click', () => {
  window.location.href = 'Login.html';
});

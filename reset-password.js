const resetForm = document.querySelector('#resetForm');
const codeInputs = [...document.querySelectorAll('.code-inputs input')];
const passwordInput = document.querySelector('#newPassword');
const formMessage = document.querySelector('#formMessage');
const toast = document.querySelector('#toast');
const passwordToggle = document.querySelector('#passwordToggle');
const passwordEye = document.querySelector('.password-eye');
const passwordEyeOff = document.querySelector('.password-eye-off');
const params = new URLSearchParams(window.location.search);
const email = params.get('email') || sessionStorage.getItem('resetEmail');

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('is-visible'), 2800);
}

codeInputs.forEach((input, index) => {
  input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 1); if (input.value && codeInputs[index + 1]) codeInputs[index + 1].focus(); });
  input.addEventListener('keydown', (event) => { if (event.key === 'Backspace' && !input.value && codeInputs[index - 1]) codeInputs[index - 1].focus(); });
});

passwordInput.addEventListener('input', () => {
  const value = passwordInput.value;
  document.querySelector('#lowercase').classList.toggle('is-valid', /[a-z]/.test(value));
  document.querySelector('#length').classList.toggle('is-valid', value.length >= 8);
  document.querySelector('#uppercase').classList.toggle('is-valid', /[A-Z]/.test(value));
  document.querySelector('#number').classList.toggle('is-valid', /\d/.test(value));
});

passwordToggle.addEventListener('click', () => {
  const isVisible = passwordInput.type === 'password';
  passwordInput.type = isVisible ? 'text' : 'password';
  passwordEye.hidden = !isVisible;
  passwordEyeOff.hidden = isVisible;
  passwordToggle.setAttribute('aria-label', isVisible ? 'Hide password' : 'Show password');
  passwordToggle.setAttribute('aria-pressed', String(isVisible));
});

resetForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const code = codeInputs.map((input) => input.value).join('');
  const password = passwordInput.value;
  if (code.length !== 6) { formMessage.textContent = 'Enter the 6-digit reset code.'; return; }
  if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) { formMessage.textContent = 'Password does not meet the requirements.'; return; }
  const resetCode = codeInputs.map((input) => input.value).join('');

  if (!email) {
    formMessage.textContent = 'Your reset session has expired. Start again.';
    return;
  }

  try {
    const response = await fetch('api/reset-password.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code: resetCode, password })
    });
    const result = await response.json();
    if (!response.ok) {
      formMessage.textContent = result.message || 'Password reset failed.';
      return;
    }
    sessionStorage.removeItem('resetEmail');
    sessionStorage.removeItem('resetDebugCode');
    formMessage.textContent = result.message;
    showToast(result.message);
    window.setTimeout(() => { window.location.href = 'Login.html'; }, 900);
  } catch (error) {
    formMessage.textContent = window.location.protocol === 'file:'
      ? 'Open this page through http://localhost/uniprocur2/.'
      : 'The PHP server returned an invalid response.';
  }
});

document.querySelector('#resendButton').addEventListener('click', async () => {
  if (!email) return;
  const response = await fetch('api/request-reset.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  const result = await response.json();
  if (result.debugCode) sessionStorage.setItem('resetDebugCode', result.debugCode);
  showToast(result.message || 'A new verification code was sent.');
});
document.querySelector('#backButton').addEventListener('click', () => { window.location.href = 'Login.html'; });
document.querySelector('#cancelButton').addEventListener('click', () => { window.location.href = 'Login.html'; });

const loginForm = document.querySelector('#loginForm');
const emailInput = document.querySelector('#email');
const passwordInput = document.querySelector('#password');
const passwordToggle = document.querySelector('#passwordToggle');
const passwordEye = document.querySelector('.password-eye');
const passwordEyeOff = document.querySelector('.password-eye-off');
const agreementInput = document.querySelector('#agreement');
const formMessage = document.querySelector('#formMessage');
const toast = document.querySelector('#toast');

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('is-visible'), 3000);
}

loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  formMessage.textContent = '';

  if (!emailInput.value.trim() || !emailInput.validity.valid) {
    formMessage.textContent = 'Enter a valid e-mail address.';
    emailInput.focus();
    return;
  }

  if (passwordInput.value.length < 6) {
    formMessage.textContent = 'Password must be at least 6 characters.';
    passwordInput.focus();
    return;
  }

  if (!agreementInput.checked) {
    formMessage.textContent = 'Please agree to the terms and conditions.';
    agreementInput.focus();
    return;
  }

  window.location.href = `go-to-dashboard.html?email=${encodeURIComponent(emailInput.value.trim())}`;
});

document.querySelector('#forgotButton').addEventListener('click', () => {
  window.location.href = 'forgot-password.html';
});

function setPasswordVisibility(isVisible) {
  passwordInput.type = isVisible ? 'text' : 'password';
  if (isVisible) {
    passwordEye.removeAttribute('hidden');
    passwordEyeOff.setAttribute('hidden', '');
  } else {
    passwordEye.setAttribute('hidden', '');
    passwordEyeOff.removeAttribute('hidden');
  }
  passwordToggle.setAttribute('aria-label', isVisible ? 'Hide password' : 'Show password');
  passwordToggle.setAttribute('aria-pressed', String(isVisible));
}

setPasswordVisibility(false);

passwordToggle.addEventListener('click', () => {
  setPasswordVisibility(passwordInput.type === 'password');
});

document.querySelector('#registerButton').addEventListener('click', () => {
  window.location.href = 'registration.html';
});

document.querySelector('#discoverButton').addEventListener('click', () => {
  document.querySelector('.service-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
  showToast('Explore the UniProcur procurement service.');
});

document.querySelector('#backButton').addEventListener('click', () => {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    showToast('You are already at the start of the journey.');
  }
});

passwordInput.addEventListener('dblclick', () => {
  const isPassword = passwordInput.type === 'password';
  setPasswordVisibility(isPassword);
  showToast(isPassword ? 'Password visible.' : 'Password hidden.');
});

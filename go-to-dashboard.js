const verifyForm = document.querySelector('#verifyForm');
const codeInputs = [...document.querySelectorAll('.code-inputs input')];
const formMessage = document.querySelector('#formMessage');
const email = new URLSearchParams(window.location.search).get('email') || 'buyer@company.com';

document.querySelector('#accountEmail').textContent = email;

codeInputs.forEach((input, index) => {
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 1);
    if (input.value && codeInputs[index + 1]) codeInputs[index + 1].focus();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Backspace' && !input.value && codeInputs[index - 1]) codeInputs[index - 1].focus();
  });
});

verifyForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const code = codeInputs.map((input) => input.value).join('');
  if (code.length !== 6) {
    formMessage.textContent = 'Enter the 6-digit authenticator code.';
    codeInputs.find((input) => !input.value)?.focus();
    return;
  }
  formMessage.textContent = 'Authenticator verified. Opening your workspace...';
  window.setTimeout(() => { window.location.href = 'buyer-dashboard.html'; }, 500);
});

document.querySelector('#backButton').addEventListener('click', () => {
  window.location.href = 'Login.html';
});

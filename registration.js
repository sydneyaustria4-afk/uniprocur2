const registrationForm = document.querySelector('#registrationForm');
const fullNameInput = document.querySelector('#fullName');
const emailInput = document.querySelector('#registrationEmail');
const agreementInput = document.querySelector('#registrationAgreement');
const formMessage = document.querySelector('#formMessage');
const toast = document.querySelector('#toast');

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('is-visible'), 3000);
}

registrationForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  formMessage.textContent = '';

  if (!fullNameInput.value.trim()) {
    formMessage.textContent = 'Enter your full name.';
    fullNameInput.focus();
    return;
  }

  if (!emailInput.value.trim() || !emailInput.validity.valid) {
    formMessage.textContent = 'Enter a valid e-mail address.';
    emailInput.focus();
    return;
  }

  if (!agreementInput.checked) {
    formMessage.textContent = 'Please agree to the terms and conditions.';
    agreementInput.focus();
    return;
  }

  try {
    const response = await fetch('api/register.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: fullNameInput.value,
        email: emailInput.value,
        department: document.querySelector('#department').value,
        position: document.querySelector('#position').value,
        purpose: document.querySelector('#purpose').value
      })
    });
    const result = await response.json();

    if (!response.ok) {
      formMessage.textContent = result.message || 'Registration could not be saved.';
      return;
    }

    formMessage.textContent = result.message;
    showToast(result.message);
    registrationForm.reset();
  } catch (error) {
    formMessage.textContent = 'Unable to connect to the server.';
  }
});

document.querySelector('#loginButton').addEventListener('click', () => {
  window.location.href = 'index.html';
});

document.querySelector('#exploreButton').addEventListener('click', () => {
  document.querySelector('.service-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
  showToast('Explore the UniProcur procurement service.');
});

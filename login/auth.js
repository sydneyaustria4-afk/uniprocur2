"use strict";
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const password = document.getElementById('loginPass');
  const toggle = document.getElementById('toggleLoginPass');
  const button = form.querySelector('button[type="submit"]');
  const error = form.querySelector('.error-text');

  toggle.addEventListener('click', () => {
    const visible = password.type === 'password';
    password.type = visible ? 'text' : 'password';
    toggle.classList.toggle('is-visible', visible);
    toggle.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
    toggle.setAttribute('aria-pressed', String(visible));
  });

  function showError(message) {
    error.textContent = message;
    error.classList.toggle('is-visible', Boolean(message));
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    showError('');
    const identifier = document.getElementById('loginUser').value.trim();
    const secret = password.value;
    if (!identifier || !secret) {
      showError('Enter your HR email and password.');
      return;
    }
    button.disabled = true;
    try {
      const response = await fetch('../database/hr-login.php', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ identifier, password: secret })
      });
      const data = await response.json();
      if (!response.ok || data.success !== true) {
        throw new Error(data.message || 'Login failed.');
      }
      if (!data.redirect) throw new Error('No dashboard was assigned to this account.');
      window.location.assign(data.redirect);
    } catch (e) {
      showError(e.message || 'Unable to sign in.');
      button.disabled = false;
    }
  });
});

const toast = document.querySelector('#toast');
const requestDialog = document.querySelector('#requestDialog');

function showToast(message) {
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

if (requestDialog) {
  document.querySelectorAll('[data-open-request]').forEach((button) => {
    button.addEventListener('click', () => requestDialog.showModal());
  });

  const closeButton = document.querySelector('.dialog-close');
  if (closeButton) {
    closeButton.addEventListener('click', () => requestDialog.close());
  }
}

document.querySelectorAll('[data-toast]').forEach((button) => {
  button.addEventListener('click', () => showToast(button.dataset.toast));
});

document.querySelectorAll('.nav-item').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('is-active'));
    button.classList.add('is-active');
    showToast(`${button.dataset.view} workspace selected.`);
  });
});

document.querySelectorAll('.filters select').forEach((select) => {
  select.addEventListener('change', () => showToast(`${select.value} filter applied.`));
});

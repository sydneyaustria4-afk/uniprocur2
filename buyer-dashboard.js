const toast = document.querySelector('#toast');
const requestDialog = document.querySelector('#requestDialog');

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

document.querySelector('#newRequestButton').addEventListener('click', () => requestDialog.showModal());

document.querySelector('.dialog-close').addEventListener('click', () => requestDialog.close());

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

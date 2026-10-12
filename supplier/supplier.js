const toast = document.querySelector('#toast');
const requestDialog = document.querySelector('#requestDialog');

if (window.location.protocol !== 'file:') {
  fetch('database/check-session.php', { credentials: 'same-origin' })
    .then((response) => {
      if (!response.ok) throw new Error(`Session request failed (${response.status}).`);
      return response.json();
    })
    .then((result) => {
      if (!result.success) {
        window.location.href = 'Login.html';
        return;
      }

      document
        .querySelectorAll('.profile-copy strong, .account-name strong')
        .forEach((element) => {
          element.textContent = result.user.full_name;
        });
    })
    .catch((error) => {
      console.error('Session check failed:', error);
      window.location.href = 'Login.html';
    });
}

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

const supplierSearch = document.querySelector('.search-shell input');
const searchButton = document.querySelector('.search-button');
const supplierCards = [...document.querySelectorAll('.supplier-card')];
const supplierEmptyState = document.querySelector('.supplier-empty');

function filterSuppliers() {
  const query = supplierSearch.value.trim().toLocaleLowerCase();
  let visibleCount = 0;

  supplierCards.forEach((card) => {
    const matches = card.textContent.toLocaleLowerCase().includes(query);
    card.hidden = !matches;
    if (matches) visibleCount += 1;
  });

  supplierEmptyState.hidden = visibleCount > 0;
}

supplierSearch.addEventListener('input', filterSuppliers);
searchButton.addEventListener('click', filterSuppliers);

supplierSearch.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    filterSuppliers();
  }
});

document.querySelectorAll('.page-button').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelector('.page-button.active')?.classList.remove('active');
    button.classList.add('active');
  });
});

const supplierGrid = document.querySelector('.supplier-grid');

if (supplierGrid) {
    let isDragging = false;
    let startX = 0;
    let startScrollLeft = 0;
    let hasDragged = false;

    supplierGrid.addEventListener('mousedown', (event) => {
        // Only left mouse button
        if (event.button !== 0) return;

        // Don't start dragging when clicking a button
        if (event.target.closest('button, a, input, select, textarea')) {
            return;
        }

        isDragging = true;
        hasDragged = false;

        startX = event.pageX;
        startScrollLeft = supplierGrid.scrollLeft;

        supplierGrid.classList.add('is-dragging');
    });

    supplierGrid.addEventListener('mousemove', (event) => {
        if (!isDragging) return;

        const distance = event.pageX - startX;

        // Only consider it a drag after moving a few pixels
        if (Math.abs(distance) > 5) {
            hasDragged = true;
        }

        if (hasDragged) {
            event.preventDefault();

            supplierGrid.scrollLeft =
                startScrollLeft - distance;
        }
    });

    document.addEventListener('mouseup', () => {
        if (!isDragging) return;

        isDragging = false;
        supplierGrid.classList.remove('is-dragging');
    });
}
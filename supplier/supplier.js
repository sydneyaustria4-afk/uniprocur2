
const toast = document.querySelector('#toast');
const requestDialog = document.querySelector('#requestDialog');

// No login page or login redirect.
// The Suppliers page can open directly.

function showToast(message) {
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add('is-visible');

  window.clearTimeout(showToast.timer);

  showToast.timer = window.setTimeout(
    () => toast.classList.remove('is-visible'),
    2600
  );
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
  button.addEventListener('click', () => {
    showToast(button.dataset.toast);
  });
});

document.querySelectorAll('.nav-item').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((item) => {
      item.classList.remove('is-active');
    });

    button.classList.add('is-active');

    showToast(`${button.dataset.view} workspace selected.`);
  });
});

document.querySelectorAll('.filters select').forEach((select) => {
  select.addEventListener('change', () => {
    showToast(`${select.value} filter applied.`);
  });
});

// =====================================
// SUPPLIER SEARCH AND FILTERING
// =====================================

const supplierSearch = document.querySelector('.search-shell input');
const searchButton = document.querySelector('.search-button');

const supplierCards = [
  ...document.querySelectorAll('.supplier-card')
];

const supplierEmptyState = document.querySelector('.supplier-empty');

function filterSuppliers() {
  if (!supplierSearch) return;

  const query = supplierSearch.value
    .trim()
    .toLocaleLowerCase();

  let visibleCount = 0;

  supplierCards.forEach((card) => {
    const matches = card.textContent
      .toLocaleLowerCase()
      .includes(query);

    card.hidden = !matches;

    if (matches) visibleCount++;
  });

  if (supplierEmptyState) {
    supplierEmptyState.hidden = visibleCount > 0;
  }
}

if (supplierSearch) {
  supplierSearch.addEventListener('input', filterSuppliers);

  supplierSearch.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      filterSuppliers();
    }
  });
}

if (searchButton) {
  searchButton.addEventListener('click', filterSuppliers);
}

// =====================================
// SUPPLIER PAGINATION
// =====================================

document.querySelectorAll('.page-button').forEach((button) => {
  button.addEventListener('click', () => {
    document
      .querySelector('.page-button.active')
      ?.classList.remove('active');

    button.classList.add('active');
  });
});

// =====================================
// SUPPLIER GRID DRAG SCROLL
// =====================================

const supplierGrid = document.querySelector('.supplier-grid');

if (supplierGrid) {
  let isDragging = false;
  let startX = 0;
  let startScrollLeft = 0;
  let hasDragged = false;

  supplierGrid.addEventListener('mousedown', (event) => {
    // Only left mouse button.
    if (event.button !== 0) return;

    // Do not drag when clicking interactive elements.
    if (
      event.target.closest(
        'button, a, input, select, textarea'
      )
    ) {
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

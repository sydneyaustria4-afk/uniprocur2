// Static fallback data in case the database is temporarily unreachable
const fallbackSuppliers = {
  marikina: {
    name: "Marikina Hide and Leather Co",
    prices: [240, 235, 260, 128, 97, 148, 510, 128, 318, 82, 35, 26, 12.5, 0.86, 46, 152]
  },
  cordillera: {
    name: "Cordillera Leather Works",
    prices: [240, 235, 260, 128, 97, 148, 510, 128, 318, 82, 35, 26, 12.5, 0.86, 46, 152]
  },
  synthhide: {
    name: "SynthHide Textile Corp.",
    prices: [245, 240, 258, 125, 95, 145, 508, 126, 316, 81, 34.5, 25.5, 12.3, 0.85, 45.5, 151]
  },
  soletech: {
    name: "SoleTech Rubber",
    prices: [242, 238, 262, 127, 96, 149, 505, 125, 320, 83, 35.5, 26.5, 12.4, 0.86, 46.5, 150]
  },
  metalcraft: {
    name: "MetalCraft Shoe Hardware",
    prices: [244, 245, 264, 129, 97, 147, 512, 128, 315, 80, 34.5, 25.5, 12.6, 0.86, 46, 152]
  },
  ecobox: {
    name: "EcoBox Packaging Solution",
    prices: [242, 238, 262, 127, 96, 149, 505, 125, 320, 83, 35.5, 26.5, 12.4, 0.86, 46.5, 150]
  }
};

const fallbackProducts = [
  { name: "Full-Grain Leather", image: "full-grain-leather.png", swatches: [1, 2, 3] },
  { name: "Suede Leather", image: "suede-leather.png", swatches: [4, 5, 6] },
  { name: "Nubuck Leather", image: "nubuck-leather.png", swatches: [7, 8, 9, 10, 11, 12] },
  { name: "Mesh Fabric", image: "mesh-fabric.png", swatches: [13, 14, 15] },
  { name: "Canvas Fabric", image: "canvas-fabric.png", swatches: [16, 17, 18, 19, 20] },
  { name: "PU Leather", image: "pu-leather.png", swatches: [21, 22, 23, 24, 25] },
  { name: "Vulcanized Rubber Outsoles", image: "vulcanized-rubber-outsoles.png", swatches: [1, 2, 3] },
  { name: "EVA Foam Sheets", image: "eva-foam-sheets.png", swatches: [] },
  { name: "TPR Outsoles", image: "tpr-outsoles.png", swatches: [] },
  { name: "Metal Eyelets", image: "metal-eyelets.png", swatches: [26, 27, 28] },
  { name: "Metal Buckles", image: "metal-buckles.png", swatches: [16, 17, 18, 19, 20] },
  { name: "Zippers", image: "zippers.png", swatches: [] },
  { name: "Shoe Boxes (Eco Friendly)", image: "shoe-boxes.png", swatches: [] },
  { name: "Tissue Paper Rolls", image: "tissue-paper-rolls.png", swatches: [] },
  { name: "Packaging Tape", image: "packaging-tape.png", swatches: [] },
  { name: "Rubber Cement", image: "rubber-cement.png", swatches: [] }
];

const grid = document.querySelector("#products-grid");
const stage = document.querySelector(".catalog-stage");
const searchForm = document.querySelector("#catalog-search");
const searchInput = document.querySelector("#product-search");
const emptyState = document.querySelector("#search-empty-state");
const supplierPicker = document.querySelector("#supplier-catalog-picker");
const supplierSlug = stage ? stage.dataset.supplier : "marikina";

if (supplierPicker) {
  supplierPicker.addEventListener("change", () => {
    window.location.href = supplierPicker.value;
  });
}

function filterProducts() {
  if (!searchInput || !grid) return;
  const query = searchInput.value.trim().toLocaleLowerCase();
  let visibleProducts = 0;

  if (searchForm) {
    searchForm.classList.toggle("has-query", query.length > 0);
  }

  grid.querySelectorAll(".product-card").forEach((card) => {
    const matches = card.textContent.toLocaleLowerCase().includes(query);
    card.hidden = !matches;
    if (matches) visibleProducts += 1;
  });

  if (emptyState) {
    emptyState.hidden = visibleProducts > 0;
  }
}

if (searchForm) {
  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    filterProducts();
  });
}

if (searchInput) {
  searchInput.addEventListener("input", filterProducts);
}

function renderProducts(supplierData, productsList) {
  if (!grid) return;
  grid.innerHTML = "";

  // Update Page Title and Headings
  const supplierName = supplierData.name || "Supplier";
  document.title = `${supplierName} | Catalog`;
  
  const titleEl = document.querySelector("#catalog-title");
  if (titleEl) {
    titleEl.textContent = supplierName.replace(/ Co\.?$/, "");
  }

  document.querySelectorAll("[data-supplier-name]").forEach((el) => {
    el.textContent = supplierName;
  });

  // Render Product Cards
  productsList.forEach((product, index) => {
    const card = document.createElement("article");
    const imageNumber = String(index + 1).padStart(2, "0");
    const image = document.createElement("img");
    const visual = document.createElement("div");
    const favorite = document.createElement("button");
    const name = document.createElement("h3");
    const price = document.createElement("p");
    const swatches = document.createElement("div");
    const imageName = product.image;

    card.className = "product-card";
    if (product.item_id) card.dataset.itemId = product.item_id;
    if (product.item_code) card.dataset.itemCode = product.item_code;

    image.className = "product-image";
    image.src = (imageName.startsWith("cordillera ") || imageName === "cordillera.svg")
      ? `../assets/${imageName}`
      : `../assets/catalog/${imageName}`;
    image.alt = product.name;
    visual.className = `product-visual product-visual--${imageNumber}`;
    visual.append(image);

    favorite.className = "favorite-button";
    favorite.type = "button";
    favorite.setAttribute("aria-label", `Add ${product.name} to favorites`);
    favorite.setAttribute("aria-pressed", "false");
    favorite.innerHTML = `
      <img src="../assets/catalog/favorite-bg.svg" alt="" />
      <img class="favorite-heart" src="../assets/catalog/favorite-heart.svg" alt="" />
    `;

    if (Array.isArray(product.swatches) && product.swatches.length > 0) {
      swatches.className = "swatches";
      swatches.setAttribute("aria-label", "Available colors");
      product.swatches.forEach((swatch) => {
        const color = document.createElement("img");
        color.src = `../assets/catalog/swatch-${swatch}.svg`;
        color.alt = "";
        swatches.append(color);
      });
    }

    name.className = "product-name";
    name.textContent = product.name;
    price.className = "product-price";
    const numPrice = typeof product.price === "number" ? product.price : parseFloat(product.price || 0);
    price.textContent = `₱${numPrice.toFixed(2)}`;

    favorite.addEventListener("click", () => {
      const isFavorite = favorite.getAttribute("aria-pressed") === "true";
      favorite.setAttribute("aria-pressed", String(!isFavorite));
      favorite.setAttribute(
        "aria-label",
        `${isFavorite ? "Add" : "Remove"} ${product.name} ${isFavorite ? "to" : "from"} favorites`
      );
    });

    card.append(visual, favorite);
    if (Array.isArray(product.swatches) && product.swatches.length > 0) {
      card.append(swatches);
    }
    card.append(name, price);
    grid.append(card);
  });
}

function loadFallback() {
  const catalog = fallbackSuppliers[supplierSlug] || fallbackSuppliers.marikina;
  const items = fallbackProducts.map((p, idx) => ({
    name: p.name,
    image: catalog.images?.[idx] || p.image,
    price: catalog.prices[idx],
    swatches: p.swatches
  }));
  renderProducts(catalog, items);
}

// Fetch dynamic data from PHP MySQL backend
async function initCatalog() {
  try {
    const res = await fetch(`../database/get-catalog.php?supplier=${encodeURIComponent(supplierSlug)}`);
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}`);
    }
    const data = await res.json();
    if (data.success && data.products) {
      renderProducts(data.supplier, data.products);

      // Optionally sync user session in the header
      fetch("../database/check-session.php")
        .then((r) => r.json())
        .then((sData) => {
          if (sData.authenticated && sData.user) {
            const nameEl = document.querySelector(".account-copy strong");
            const emailEl = document.querySelector(".account-copy span");
            if (nameEl && sData.user.full_name) nameEl.textContent = sData.user.full_name;
            if (emailEl && sData.user.email) emailEl.textContent = sData.user.email;
          }
        })
        .catch(() => {});

      return;
    }
    throw new Error(data.error || "Failed to load catalog data");
  } catch (err) {
    console.warn("Could not load catalog from database, falling back to static data:", err);
    loadFallback();
  }
}

initCatalog();

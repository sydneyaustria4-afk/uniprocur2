
"use strict";

document.addEventListener("DOMContentLoaded", () => {

  const PREVIEW_KEY = "uniprocur_rfq_preview";


  // =====================================
  // DEFAULT SAMPLE DATA
  // Used only if page is opened directly.
  // =====================================

  const DEFAULT_DATA = {

    rfqNumber: "RFQ-0001",

    prNumber: "PR-2026-01",

    prRequiredDate: "2026-10-05",

    submissionDueDate: "",

    requiredTime: "05:00",

    ampm: "PM",

    warehouseValue: "main",

    warehouseText:
      "Main Warehouse — Brgy. II-C, San Pablo City, Laguna",

    justification:
      "Please submit your best pricing per item. Bulk discount applies for quantities over 150 units. Include delivery schedule.",

    products: [

      {
        name: "Full-Grain Leather",
        category: "Raw Materials",
        quantity: "100 sq. ft.",
        description: '12mm, 54" width',
        image: "leather.svg"
      },

      {
        name: "Mesh Fabric",
        category: "Textile",
        quantity: "100 meters",
        description: "Breathable Mesh",
        image: "mesh.svg"
      }

    ],

    suppliers: [

      {
        key: "sole-tech",
        name: "SoleTech Rubber Manufacturing",
        city: "Valenzuela City, Metro Manila",
        rating: "4.8",
        leadTime: "10 days",
        paymentTerms: "Net 30"
      },

      {
        key: "cordillera",
        name: "Cordillera Leather Works",
        city: "Baguio City, Benguet",
        contact: "Elena Bautista",
        rating: "4.9",
        leadTime: "7 days",
        paymentTerms: "Net 30"
      }

    ],

    attachments: []

  };


  // =====================================
  // EXISTING SUPPLIER ASSETS
  // =====================================

  const SUPPLIER_ASSETS = {

    "sole-tech": {
      banner: "soletech.svg",
      logo: "Ellipse 4.svg"
    },

    "ecobox": {
      banner: "ecobox.svg",
      logo: "Ellipse 6.svg"
    },

    "cordillera": {
      banner: "cordillera.svg",
      logo: "Ellipse 2.svg"
    },

    "metalcraft": {
      banner: "metalcraft.svg",
      logo: "Ellipse 5.svg"
    },

    "synthhide": {
      banner: "synthide.svg",
      logo: "Ellipse 3.svg"
    },

    "marikina": {
      banner: "cordillera.svg",
      logo: "Ellipse 8.svg"
    }

  };


  // =====================================
  // HELPERS
  // =====================================

  function getElement(id) {
    return document.getElementById(id);
  }


  function setText(id, value) {

    const element = getElement(id);

    if (element) {
      element.textContent = value ?? "";
    }

  }


  function readPreview() {

    try {

      const saved = sessionStorage.getItem(PREVIEW_KEY);

      return saved ? JSON.parse(saved) : null;

    } catch (error) {

      console.warn(
        "RFQ preview could not be loaded:",
        error
      );

      return null;

    }

  }


  function getLocalDateString(value) {

    if (!value) return "";

    const raw = String(value).trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return raw;
    }

    const date = new Date(raw);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const year = date.getFullYear();

    const month = String(
      date.getMonth() + 1
    ).padStart(2, "0");

    const day = String(
      date.getDate()
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;

  }


  function formatDate(value) {

    const dateValue = getLocalDateString(value);

    if (!dateValue) {
      return value || "—";
    }

    const [year, month, day] =
      dateValue.split("-").map(Number);

    const date = new Date(
      year,
      month - 1,
      day
    );

    return new Intl.DateTimeFormat("en-PH", {
      month: "long",
      day: "2-digit",
      year: "numeric"
    }).format(date);

  }


  function formatFileSize(bytes) {

    const size = Number(bytes || 0);

    if (size < 1024) {
      return `${size} B`;
    }

    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`;
    }

    return `${(size / (1024 * 1024)).toFixed(1)} MB`;

  }


  function getFileExtension(filename) {

    const parts = String(filename || "").split(".");

    return parts.length > 1
      ? parts.pop().toUpperCase().slice(0, 4)
      : "FILE";

  }


  // =====================================
  // LOAD RFQ DATA
  // =====================================

  const savedData = readPreview();

  const data = savedData
    ? {
        ...DEFAULT_DATA,
        ...savedData
      }
    : DEFAULT_DATA;


  // =====================================
  // HEADER INFORMATION
  // =====================================

  setText("headerPrNumber", data.prNumber);

  setText("convertedPrNumber", data.prNumber);

  setText("rfqNumber", data.rfqNumber);

  setText(
    "summaryRequiredDate",
    formatDate(data.prRequiredDate)
  );

  setText(
    "buyerName",
    data.buyerName || "Buyer"
  );

  setText(
    "buyerEmail",
    data.buyerEmail || "buyer@gmail.com"
  );


  const buyerAvatar = getElement("buyerAvatar");

  if (buyerAvatar) {

    buyerAvatar.textContent =
      (data.buyerName || "Buyer")
        .charAt(0)
        .toUpperCase();

  }


  document.title =
    `Confirm RFQ | ${data.prNumber}`;



  // =====================================
  // RFQ SETTINGS
  // =====================================

  const dateInput = getElement("submissionDueDate");

  if (dateInput) {

    dateInput.value =
      getLocalDateString(data.submissionDueDate) ||
      "";

  }


  const timeInput = getElement("requiredTime");

  if (timeInput) {

    timeInput.value =
      data.requiredTime || "05:00";

  }


  // AM / PM selection.
  document.querySelectorAll(".ampm-button").forEach((button) => {

    const selected =
      button.dataset.ampm === data.ampm;

    button.classList.toggle(
      "is-active",
      selected
    );

    button.setAttribute(
      "aria-pressed",
      selected ? "true" : "false"
    );

  });


  // Warehouse location.
  const locationSelect = getElement("warehouseLocation");

  if (locationSelect) {

    const optionExists = Array.from(
      locationSelect.options
    ).some((option) => {

      return option.value === data.warehouseValue;

    });

    locationSelect.value = optionExists
      ? data.warehouseValue
      : "main";

  }


  // Justification.
  setText(
    "justificationText",
    data.justification || ""
  );



  // =====================================
  // PRODUCT CARDS
  // =====================================

  function getProductImage(item) {
    return window.resolveProcurementProductImage(item.name, item.image);
  }


  function createProductCard(item) {

    const article = document.createElement("article");

    article.className = "product-item";


    // Product image.
    const imageWrap = document.createElement("div");

    imageWrap.className = "product-image-wrap";


    const imagePath = getProductImage(item);
    if (imagePath) {
      const image = document.createElement("img");
      image.className = "product-image";
      image.src = imagePath;
      image.alt = item.name || "Requested product";
      imageWrap.appendChild(image);
    }


    // Product information.
    const info = document.createElement("div");

    info.className = "product-info";


    const title = document.createElement("h3");

    title.textContent =
      item.name || "Unnamed item";


    // Category.
    const categoryRow = document.createElement("div");

    categoryRow.className = "product-meta";


    const categoryLabel = document.createElement("span");

    categoryLabel.textContent = "Category:";


    const categoryValue = document.createElement("strong");

    categoryValue.textContent =
      item.category || "—";


    categoryRow.append(
      categoryLabel,
      categoryValue
    );


    // Quantity.
    const quantityRow = document.createElement("div");

    quantityRow.className = "product-meta";


    const quantityLabel = document.createElement("span");

    quantityLabel.textContent = "Qty:";


    const quantityValue = document.createElement("strong");

    quantityValue.textContent =
      item.quantity || "—";


    quantityRow.append(
      quantityLabel,
      quantityValue
    );


    // Description.
    const descriptionRow = document.createElement("div");

    descriptionRow.className = "product-meta";


    const descriptionLabel = document.createElement("span");

    descriptionLabel.textContent = "Description:";


    const descriptionValue = document.createElement("p");

    descriptionValue.textContent =
      item.description || "—";


    descriptionRow.append(
      descriptionLabel,
      descriptionValue
    );


    info.append(
      title,
      categoryRow,
      quantityRow,
      descriptionRow
    );


    article.append(
      imageWrap,
      info
    );

    return article;

  }


  function renderProducts(items) {

    const container = getElement("productsList");

    if (!container) return;

    container.replaceChildren();

    if (!Array.isArray(items) || items.length === 0) {

      const empty = document.createElement("p");

      empty.className = "empty-message";

      empty.textContent = "No requested items found.";

      container.appendChild(empty);

      return;

    }

    items.forEach((item) => {

      container.appendChild(
        createProductCard(item)
      );

    });

  }


  renderProducts(data.products);



  // =====================================
  // SUPPLIER CARDS
  // =====================================

  function createSupplierCard(supplier) {

    const assets =
      SUPPLIER_ASSETS[supplier.key] ||
      SUPPLIER_ASSETS.cordillera;


    const article = document.createElement("article");

    article.className = "supplier-card";


    // Supplier banner.
    const banner = document.createElement("div");

    banner.className = "supplier-banner";

    banner.style.backgroundImage =
      `url("../assets/${assets.banner}")`;


    // Active label.
    const active = document.createElement("span");

    active.className = "supplier-active";

    active.textContent = "Active";


    // Supplier logo.
    const logo = document.createElement("img");

    logo.className = "supplier-logo";

    logo.src = `../assets/${assets.logo}`;

    logo.alt = `${supplier.name} logo`;


    banner.append(
      active,
      logo
    );


    // Supplier information.
    const body = document.createElement("div");

    body.className = "supplier-card-body";


    const name = document.createElement("h3");

    name.textContent =
      supplier.name || "Supplier";


    const city = document.createElement("p");

    city.className = "supplier-city";

    city.textContent =
      supplier.city || "";


    body.append(
      name,
      city
    );


    if (supplier.contact) {

      const contact = document.createElement("span");

      contact.className = "supplier-contact";

      contact.textContent = supplier.contact;

      body.appendChild(contact);

    }


    // Supplier metrics.
    const metrics = document.createElement("div");

    metrics.className = "metrics-row";


    const values = [

      {
        value: supplier.rating || "—",
        label: "ratings",
        prefix: "★ "
      },

      {
        value: supplier.leadTime || "—",
        label: "Lead Time",
        prefix: ""
      },

      {
        value: supplier.paymentTerms || "—",
        label: "payment terms",
        prefix: ""
      }

    ];


    values.forEach((entry, index) => {

      const metric = document.createElement("div");

      metric.className = "metric";


      const strong = document.createElement("strong");

      strong.textContent =
        `${entry.prefix}${entry.value}`;


      const small = document.createElement("small");

      small.textContent = entry.label;


      metric.append(
        strong,
        small
      );

      metrics.appendChild(metric);


      if (index < values.length - 1) {

        const divider = document.createElement("span");

        divider.className = "metric-divider";

        metrics.appendChild(divider);

      }

    });


    body.appendChild(metrics);

    article.append(
      banner,
      body
    );

    return article;

  }


  function renderSuppliers(suppliers) {

    const container = getElement("supplierCards");

    if (!container) return;

    container.replaceChildren();

    if (!Array.isArray(suppliers) || suppliers.length === 0) {

      const empty = document.createElement("p");

      empty.className = "empty-message";

      empty.textContent = "No suppliers selected.";

      container.appendChild(empty);

      return;

    }

    suppliers.forEach((supplier) => {

      container.appendChild(
        createSupplierCard(supplier)
      );

    });

  }


  renderSuppliers(data.suppliers);



  // =====================================
  // ATTACHMENTS
  // =====================================

  function renderAttachments(files) {

    const container = getElement("attachmentList");

    if (!container) return;

    container.replaceChildren();

    if (!Array.isArray(files) || files.length === 0) {
      return;
    }


    files.forEach((file) => {

      const item = document.createElement("li");

      item.className = "attachment-item";


      const icon = document.createElement("span");

      icon.className = "attachment-file-icon";

      icon.textContent =
        getFileExtension(file.name);


      const name = document.createElement("span");

      name.textContent =
        file.name || "Attachment";


      const size = document.createElement("small");

      size.className = "attachment-size";

      size.textContent =
        formatFileSize(file.size);


      item.append(
        icon,
        name,
        size
      );

      container.appendChild(item);

    });

  }


  renderAttachments(data.attachments);



  
 
  // =====================================
  // LEAFLET WAREHOUSE MAP
  // Automatically displays selected warehouse.
  // =====================================

  const mapElement = getElement("deliveryMap");
  const mapTag = getElement("mapTag");
  const confirmWarehouseSelect =
    getElement("warehouseLocation");

  if (mapElement) {

    if (typeof window.L === "undefined") {

      console.error("Leaflet did not load.");

      if (mapTag) {
        mapTag.textContent =
          "Map unavailable. Check your internet connection.";
      }

    } else if (!mapElement._leaflet_id) {

      // Exact coordinates from edit-rfq2.js.
      const warehouseLocations = {

        main: {
          coordinates: [14.0657265, 121.3223515],
          label:
            "Main Warehouse — Brgy. II-C, San Pablo City, Laguna"
        },

        second: {
          coordinates: [14.1398816, 121.4206179],
          label:
            "Second Warehouse — Palina, Nagcarlan, Laguna"
        }

      };


      // Read the selected warehouse from sessionStorage data.
      const selectedWarehouseValue =
        data.warehouseValue === "second"
          ? "second"
          : "main";

      const initialLocation =
        warehouseLocations[selectedWarehouseValue];


      // Display selected warehouse.
      if (confirmWarehouseSelect) {
        confirmWarehouseSelect.value =
          selectedWarehouseValue;
      }


      if (mapTag) {
        mapTag.textContent = initialLocation.label;
      }


      // Initialize Leaflet.
      const map = window.L.map(
        mapElement,
        {
          scrollWheelZoom: false
        }
      ).setView(
        initialLocation.coordinates,
        15
      );


      // OpenStreetMap tiles.
      window.L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap contributors"
        }
      ).addTo(map);


      // Warehouse marker.
      const marker = window.L.marker(
        initialLocation.coordinates
      ).addTo(map);

      marker.bindPopup(initialLocation.label);
      marker.bindTooltip(initialLocation.label);


      // Correct map dimensions.
      setTimeout(() => {
        map.invalidateSize(true);
      }, 300);

      window.addEventListener("resize", () => {
        map.invalidateSize(true);
      });

    }

  }




      
      

 



  // =====================================
  // TOAST NOTIFICATION
  // =====================================

  const toast = getElement("toast");

  let toastTimer;


  function showToast(message) {

    if (!toast) return;

    toast.textContent = message;

    toast.classList.add("is-visible");

    window.clearTimeout(toastTimer);

    toastTimer = window.setTimeout(() => {

      toast.classList.remove("is-visible");

    }, 3500);

  }



  // =====================================
  // BACK TO EDIT RFQ
  // =====================================

  function returnToEdit() {

    const cameFromEdit =
      document.referrer.includes("edit-rfq2.html");

    if (cameFromEdit && window.history.length > 1) {

      window.history.back();

    } else {

      window.location.href = "edit-rfq2.html";

    }

  }


  const backButton = getElement("backButton");

  const backToEditButton =
    getElement("backToEditButton");


  if (backButton) {

    backButton.addEventListener(
      "click",
      returnToEdit
    );

  }


  if (backToEditButton) {

    backToEditButton.addEventListener(
      "click",
      returnToEdit
    );

  }



  // =====================================
  // SEND RFQ CONFIRMATION DIALOG
  // =====================================

  const sendDialog = getElement("sendRfqDialog");

  const sendButton = getElement("yesSendRfqButton");

  const closeDialogButton = getElement("closeSendDialog");

  const cancelButton = getElement("cancelSendRfq");

  const confirmButton = getElement("confirmSendRfq");

  
const confirmCheckbox = getElement("confirmRfqCheckbox");

// Use the actual Purchase Request details.
setText("dialogPrNumber", data.prNumber);
setText("dialogRequiredDate", formatDate(data.prRequiredDate));

const productNames = Array.isArray(data.products)
  ? data.products.map(item => item.name).filter(Boolean)
  : [];

setText(
  "dialogItemsCount",
  `${productNames.length} Items:`
);

setText(
  "dialogItemsNames",
  productNames.join(" & ")
);

// Require checkbox confirmation before saving.
if (confirmCheckbox && confirmButton) {
  confirmCheckbox.addEventListener("change", () => {
    confirmButton.disabled = !confirmCheckbox.checked;
  });
}



  setText(
    "dialogRfqNumber",
    data.rfqNumber
  );


  // Open confirmation dialog.
  if (sendButton && sendDialog) {

    sendButton.addEventListener("click", () => {

      sendDialog.showModal();

    });

  }


  // Close dialog.
  function closeSendDialog() {

    if (sendDialog) {
      sendDialog.close();
    }

  }


  if (closeDialogButton) {

    closeDialogButton.addEventListener(
      "click",
      closeSendDialog
    );

  }


  if (cancelButton) {

    cancelButton.addEventListener(
      "click",
      closeSendDialog
    );

  }


// Final confirmation: SAVE RFQ TO MYSQL.
if (confirmButton) {

  confirmButton.addEventListener("click", async () => {

    const preview = readPreview();

    if (!preview) {
      showToast("RFQ information is missing. Please return to Edit RFQ.");
      return;
    }

    // ONE-CLICK FIX 2026-11-13: reject stale or manipulated cached RFQ settings.
    const rfqDue = getLocalDateString(preview.submissionDueDate);
    const rfqTime = String(preview.requiredTime || "").trim();
    const rfqPeriod = String(preview.ampm || "").toUpperCase();
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rfqDue) || rfqDue < today ||
        !/^(?:0?[1-9]|1[0-2]):[0-5]\d$/.test(rfqTime) ||
        !["AM","PM"].includes(rfqPeriod)) {
      showToast("Invalid RFQ deadline. Return to Edit RFQ and enter valid date/time.");
      return;
    }

    if (
      !Array.isArray(preview.suppliers) ||
      preview.suppliers.length === 0
    ) {
      showToast("Please select at least one supplier.");
      return;
    }

    confirmButton.disabled = true;
    confirmButton.textContent = "Saving...";

    try {

      const response = await fetch(
        "../database/create-rfq.php",
        {
          method: "POST",
          credentials: "same-origin",

          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },

          

body: JSON.stringify({
    rfq_number: preview.rfqNumber,
    pr_number: preview.prNumber,

    deadline: getLocalDateString(
        preview.submissionDueDate
    ),
    // Convert actual RFQ time + AM/PM to 24-hour time for MySQL.
    // No guess if the preview has incomplete information.
    deadline_time: (() => {
      const raw = String(preview.requiredTime || '').trim();
      const period = String(preview.ampm || '').trim().toUpperCase();
      const parts = /^(\d{1,2}):([0-5]\d)$/.exec(raw);
      if (!parts || !['AM','PM'].includes(period)) return null;
      let h = Number(parts[1]);
      if (h < 1 || h > 12) return null;
      h = (h % 12) + (period === 'PM' ? 12 : 0);
      return `${String(h).padStart(2, '0')}:${parts[2]}`;
    })(),

    // Read the warehouse currently displayed
    // on the Confirm RFQ page
    warehouse_value: document.getElementById(
        "warehouseLocation"
    ).value,

    suppliers: preview.suppliers
})


        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "Unable to save RFQ."
        );
      }

      closeSendDialog();

// Clear preview only after successful saving.
sessionStorage.removeItem(PREVIEW_KEY);

// Display success popup.
const successDialog = document.getElementById("rfqSuccessDialog");

if (successDialog) {
  const successNumber = document.getElementById("successRfqNumber");

  if (successNumber) {
    successNumber.textContent = preview.rfqNumber;
  }

  successDialog.showModal();
} else {
  showToast("RFQ submitted successfully!");
}

    } catch (error) {

      console.error("RFQ submission error:", error);

      showToast(error.message);

      confirmButton.disabled = false;
    confirmButton.textContent = "Submit for Approval →";

    }

  });

}




  // =====================================
  // NOTIFICATIONS
  // =====================================

  const notificationButton =
    getElement("notificationButton");


  if (notificationButton) {

    notificationButton.addEventListener("click", () => {

      showToast("No new notifications.");

    });

  }

});

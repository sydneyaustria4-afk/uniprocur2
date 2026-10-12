
"use strict";

const toast = document.getElementById("toast");
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");

  window.clearTimeout(toastTimer);

  toastTimer = window.setTimeout(() => {
    toast.classList.remove("visible");
  }, 2600);
}

// Hide the image when its file path is missing.
// The CSS fabric design will remain visible underneath.
document.querySelectorAll(".product-image").forEach((img) => {
  img.addEventListener("error", () => {
    img.style.display = "none";
  });
});

// Back button
document.getElementById("backButton").addEventListener("click", () => {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    showToast("Connect this button to your Buyer Dashboard page.");
  }
});

// Create RFQ button
document.getElementById("createRfqBtn").addEventListener("click", () => {
  window.location.href = "edit-rfq.html";
});

// Notifications
document.querySelector(".notification-button").addEventListener("click", () => {
  showToast("You have no new notifications.");
});

// Profile menu
document.querySelector(".profile-chevron").addEventListener("click", () => {
  showToast("The profile menu has not been connected yet.");
});


/* =========================================
   Interactive Warehouse Location Map
   ========================================= */
document.addEventListener("DOMContentLoaded", () => {
  const mapElement = document.getElementById("deliveryMap");
  const locationSelect = document.getElementById("warehouseLocation");
  const mapTag = document.querySelector(".map-tag");

  if (!mapElement || !locationSelect) return;

  if (typeof L === "undefined") {
    mapElement.textContent =
      "Map could not load. Check your internet connection and refresh.";
    console.error("Leaflet did not load.");
    return;
  }

  // Approximate city-center coordinates, not verified warehouse addresses.
  const locations = {
    "san-pedro": {
      name: "San Pedro Facility",
      coordinates: [14.3595, 121.0473]
    },
    marikina: {
      name: "Marikina City",
      coordinates: [14.6507, 121.1029]
    },
    valenzuela: {
      name: "Valenzuela City",
      coordinates: [14.7011, 120.9830]
    }
  };

  const initialLocation =
    locations[locationSelect.value] || locations["san-pedro"];

  const map = L.map(mapElement, {
    scrollWheelZoom: false
  }).setView(initialLocation.coordinates, 13);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  const marker = L.marker(initialLocation.coordinates).addTo(map);

  marker.bindPopup(
    `<strong>${initialLocation.name}</strong><br>Approximate city-center location`
  );

  function updateMapLocation() {
    const selected = locations[locationSelect.value];

    if (!selected) return;

    marker.setLatLng(selected.coordinates);
    marker.setPopupContent(
      `<strong>${selected.name}</strong><br>Approximate city-center location`
    );

    map.setView(selected.coordinates, 13);

    if (mapTag) {
      mapTag.textContent = selected.name;
    }
  }

  locationSelect.addEventListener("change", updateMapLocation);

  if (mapTag) {
    mapTag.textContent = initialLocation.name;
  }

  // Helps Leaflet calculate the correct size inside the RFQ card.
  window.setTimeout(() => map.invalidateSize(), 200);
});

"use strict";

/*
 * UniProcur Print PO - warehouse map enhancement.
 * Uses the same Leaflet 1.9.4 / OpenStreetMap setup and warehouse coordinates
 * as PR202601/edit-rfq2.js and PR202601/confirm-rfq.js.
 * The PO page's existing PHP API still owns the delivery address and all PO data.
 * No geocoding, writes, or changes to PO tracking.
 */
(() => {
  const locations = {
    main: {
      coordinates: [14.0657265, 121.3223515],
      label: "Main Warehouse — Brgy. II-C, San Pablo City, Laguna"
    },
    second: {
      coordinates: [14.1398816, 121.4206179],
      label: "Second Warehouse — Palina, Nagcarlan, Laguna"
    }
  };

  const savedAddress = document.getElementById("deliveryAddress");
  const mapFrame = document.querySelector(".map-frame");
  const mapFallback = document.getElementById("mapFallback");
  if (!savedAddress || !mapFrame || !mapFallback) return;

  // Preserve the old hidden <img id="deliveryMap"> used in the previous version.
  // Add a separate Leaflet container without replacing the PO app's existing DOM IDs.
  const mapElement = document.createElement("div");
  mapElement.id = "poLeafletMap";
  mapElement.className = "po-leaflet-map";
  mapElement.setAttribute("role", "region");
  mapElement.setAttribute("aria-label", "Purchase Order delivery warehouse map");
  mapElement.hidden = true;
  mapFrame.appendChild(mapElement);

  let map = null;
  let observer;

  function identifyWarehouse(address) {
    const value = String(address || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[–—-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Only map a saved address that unambiguously names one of the two warehouses.
    if (value.startsWith("main warehouse") && value.includes("san pablo")) return locations.main;
    if (value.startsWith("second warehouse") && value.includes("nagcarlan")) return locations.second;
    return null;
  }

  function showFallback(message) {
    if (map) {
      map.remove();
      map = null;
    }
    mapElement.hidden = true;
    mapFallback.hidden = false;
    const caption = mapFallback.querySelector("span");
    if (caption) caption.textContent = message;
  }

  function updateMap() {
    const address = savedAddress.textContent.trim();
    if (!address || address === "—" || address === "Not provided") return;

    const warehouse = identifyWarehouse(address);
    if (!warehouse) {
      showFallback("No verified map coordinates for this delivery address.");
      return;
    }
    if (!window.L) {
      showFallback("Map unavailable. Check internet access to Leaflet.");
      return;
    }

    if (map) return; // The read-only PO page loads one PO per URL.
    mapFallback.hidden = true;
    mapElement.hidden = false;
    map = window.L.map(mapElement, {
      scrollWheelZoom: false,
      dragging: true,
      attributionControl: true
    }).setView(warehouse.coordinates, 15);

    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);

    window.L.marker(warehouse.coordinates)
      .addTo(map)
      .bindPopup(warehouse.label);

    requestAnimationFrame(() => map && map.invalidateSize());
    // Disconnect after a successful match; the PO address doesn't change during print preview.
    if (observer) observer.disconnect();
  }

  observer = new MutationObserver(updateMap);
  observer.observe(savedAddress, { childList: true, characterData: true, subtree: true });
  updateMap();

  window.addEventListener("beforeprint", () => {
    if (map) map.invalidateSize();
  });
  window.addEventListener("resize", () => {
    if (map && !mapElement.hidden) map.invalidateSize();
  });
})();

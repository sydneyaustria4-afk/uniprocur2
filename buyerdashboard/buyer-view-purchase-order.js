"use strict";

(() => {
  const $ = id => document.getElementById(id);
  const poNumber = (new URLSearchParams(location.search).get("po_number") || "").trim();
  const money = value => new Intl.NumberFormat("en-PH", {
    style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(Number(value) || 0);
  const quantity = value => new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 }).format(Number(value) || 0);
  const formatDate = value => {
    if (!value) return "—";
    const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-PH", { month: "long", day: "2-digit", year: "numeric" });
  };
  const set = (id, value) => { $(id).textContent = value == null || value === "" ? "—" : String(value); };
  const present = (value, fallback) => {
    const text = String(value ?? "").trim();
    return !text || ["not provided", "—", "n/a", "null"].includes(text.toLowerCase())
      ? (fallback || "Not provided") : text;
  };

  // These are prototype fallbacks. Real database contact fields take priority.
  const supplierProfiles = {
    marikina: { cover: "marikina.svg", logo: "Ellipse%208.svg", contact: "Ramon Villanueva", email: "ramon@marikinahide.ph", phone: "+63-2-8123-4567", location: "Marikina City, Metro Manila" },
    cordillera: { cover: "cordillera.svg", logo: "Ellipse%202.svg", contact: "Elena Bautista", email: "elena@cordilleraleather.ph", phone: "+63-2-8123-4568", location: "Baguio City, Benguet" },
    synthhide: { cover: "synthide.svg", logo: "Ellipse%203.svg", contact: "Michael Tan", email: "sales@synthhide.ph", phone: "+63-2-8123-4569", location: "Cavite Economic Zone, Cavite" },
    soletech: { cover: "soletech.svg", logo: "Ellipse%204.svg", contact: "Mario Lim", email: "mario@soletech.ph", phone: "+63-2-8123-4570", location: "Valenzuela City, Metro Manila" },
    metalcraft: { cover: "metalcraft.svg", logo: "Ellipse%205.svg", contact: "Victor Reyes", email: "victor@metalcraft.ph", phone: "+63-2-8123-4571", location: "Caloocan City, Metro Manila" },
    ecobox: { cover: "ecobox.svg", logo: "Ellipse%206.svg", contact: "Rodel Mercado", email: "rodel@ecobox.ph", phone: "+63-2-8123-4572", location: "Laguna Technopark, Laguna" }
  };

  // UNIPROCUR_EVENT_BASED_TRACKING_V2: UI labels must reflect saved PO states,
  // never elapsed time. A Manager decision is NOT supplier confirmation.
  const displayStatus = {
    draft: "Draft", pending_approval: "Pending Approval",
    approved: "Approved - Awaiting Inventory Update",
    rejected: "Rejected", issued: "Issued - Awaiting Inventory Update",
    partial: "Partially Received", received: "Received", closed: "Closed"
  };

  let currentSupplierName = "";
  let toastTimer;
  function toast(message) {
    const node = $("toast");
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove("show"), 4000);
  }

  // UNIPROCUR_EVENT_BASED_TRACKING_V2: Only known PO/Inventory records are used.
  // We have NO supplier confirmation, in-transit or out-for-delivery events yet.
  let trackingState = null;
  let lastTrackingAt = 0; // Legacy refresh timestamp; never used for milestones.
  let currentPoData = null;
  let viewLoaded = false;
  let refreshing = false;

  function trackingDisplayLabel(po) {
    const status = String(po.status || "").toLowerCase();
    const demoAcceptance = String(po.tracking_accept_source || "").toLowerCase() === "local_demo";
    if ((status === "received" || status === "closed") && demoAcceptance) return "Received (Demo)";
    if (["approved", "issued"].includes(status) && demoAcceptance) return "Accepted (Demo) - Check GR";
    if (status === "approved" && ["Out for Delivery", "Partially Delivered", "Delivered"].includes(String(po.tracking_inventory_delivery_status || ""))) return "Approved · Inventory: " + po.tracking_inventory_delivery_status;
    return displayStatus[status] || status || "Unknown status";
  }

  // UNIPROCUR_INVENTORY_TRACKING_V11 — grounded four-stage Procurement / Inventory workflow.
  // A PO status alone does not prove successful Inventory sync or an authenticated GR.
  function updateTracking() {
    if (!trackingState) return;
    const po = trackingState;
    const status = String(po.status || "").toLowerCase();
    const approved = ["approved", "issued", "partial", "received", "closed"].includes(status);
    const oldLocalDemo = String(po.tracking_accept_source || "").toLowerCase() === "local_demo";
    const sync = String(po.tracking_inventory_sync_status || "").toLowerCase();
    const linked = Boolean(String(po.tracking_inventory_request_number || "").trim());
    const synced = sync === "sent";
    // Only an Inventory status linked to the SAME PO may appear here.
    const invStatus = String(po.tracking_inventory_delivery_status || "").trim();
    const reportedProcessing = ["Out for Delivery", "Partially Delivered", "Delivered"].includes(invStatus);
    const hasVerifiedGr = !oldLocalDemo && Number(po.tracking_verified_receipt_count || 0) > 0;
    const received = hasVerifiedGr && ["received", "closed"].includes(status);
    const partiallyReceived = hasVerifiedGr && status === "partial";
    // A verified Inventory receipt establishes that processing occurred, even if the
    // intermediate live dispatch status is no longer available.
    const processed = reportedProcessing || hasVerifiedGr;
    const steps = Array.from(document.querySelectorAll(".track-step"));
    if (steps.length !== 4) return; // Do not render a misleading five-stage fallback.
    const flags = [approved, synced, processed, received];
    steps.forEach((node, index) => {
      node.classList.toggle("complete", index < 3 && flags[index]);
      node.classList.toggle("has-receipt", index === 3 && received);
      node.classList.toggle("current", index !== 3 && approved && flags.slice(0, index).every(Boolean) && !flags[index]);
    });
    // Progress line is drawn only across consecutive, actually supported events.
    let connected = approved ? 1 : 0;
    while (connected > 0 && connected < 4 && flags[connected]) connected++;
    $("trackingSteps").style.setProperty("--progress", `${Math.max(0, connected - 1) * 25}%`);
    $("stageOne").textContent = approved ? "Manager approved" : status === "rejected" ? "Rejected" : "Awaiting approval";
    $("stageTwo").textContent = synced ? "PO synced" : sync === "pending" ? "Sync pending / retry" : linked ? "Sync not recorded" : "No linked request";
    $("stageThree").textContent = reportedProcessing ? invStatus
      : hasVerifiedGr ? "Processed (verified GR)" : synced ? "Awaiting Inventory update" : "Not reported";
    $("stageFour").textContent = received ? "Goods Receipt verified"
      : partiallyReceived ? "Partially received" : ["received", "closed"].includes(status)
        ? "Verify Goods Receipt" : "Awaiting Goods Receipt";
    const note = !approved ? "Manager approval is required before Inventory processing."
      : received ? `Inventory receiving confirmed${po.tracking_latest_receipt_number ? " · DR: " + po.tracking_latest_receipt_number : ""}. Review View GR for item quantities.`
      : partiallyReceived ? "Inventory recorded a partial Goods Receipt. Remaining items still need verification."
      : synced && reportedProcessing ? `Inventory reports: ${invStatus}. Receiving requires a verified Goods Receipt.`
      : synced ? "Approved PO was sent to Inventory; waiting for a processing or receiving update."
      : linked ? "Approved PO is linked to Inventory, but its sync has not been confirmed. Check the sync outbox."
      : "This PO is not linked to an Inventory Material Request; no cross-module sync can be assumed.";
    $("trackingNote").textContent = note;
    set("status", trackingDisplayLabel(po));
    $("status").className = `status-pill ${status}`;
  }
  async function refreshTracking() {
    if (refreshing || !viewLoaded || document.hidden) return;
    refreshing = true;
    try {
      const response = await fetch(`../database/get-buyer-purchase-orders.php?po_number=${encodeURIComponent(poNumber)}`,
        { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
      const data = await response.json();
      if (response.ok && data.success && data.po) {
        trackingState = data.po;
        lastTrackingAt = performance.now();
        updateTracking();
      }
    } catch (error) {
      console.warn("Tracking refresh failed; retaining last known milestones:", error);
    } finally { refreshing = false; }
  }

  // Contact Supplier button opens the profile card first, as in the Figma prototype.
  // Email actions inside it open the user's mail app; no email is sent automatically.
  function openSupplierContact() {
    if (!currentPoData) {
      toast("Purchase Order details are still loading.");
      return;
    }

    const po = currentPoData;
    const supplierKey = Object.keys(supplierProfiles).find(
      key => String(po.supplier_name || "").toLowerCase().includes(key)
    );
    const profile = supplierProfiles[supplierKey] || {};
    const name = String(po.supplier_name || "Supplier");
    const contact = present(po.supplier_contact, profile.contact);
    const email = present(po.supplier_email, profile.email);
    const phone = present(po.supplier_phone, profile.phone);
    const supplierLocation = present(po.supplier_location, profile.location);

    set("supplierContactTitle", name);
    set("supplierContactPerson", contact);
    set("supplierContactPhone", phone);
    set("supplierContactLocation", supplierLocation);

    const cover = $("supplierContactCover");
    // Whitelisted asset name, never a raw path from the database.
    cover.style.backgroundImage = profile.cover
      ? `url("../assets/${profile.cover}")`
      : 'none';

    const logo = $("supplierContactLogo");
    logo.src = profile.logo ? `../assets/${profile.logo}` : "../assets/catalog/avatar-outline.svg";
    logo.alt = `${name} logo`;
    logo.onerror = () => { logo.onerror = null; logo.src = "../assets/catalog/avatar-outline.svg"; };

    const emailLink = $("supplierContactEmail");
    const mailButton = $("supplierContactMail");
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    emailLink.textContent = validEmail ? email : "Not provided";
    if (validEmail) {
      const subject = encodeURIComponent(`Purchase Order ${poNumber} - ${name}`);
      const href = `mailto:${email}?subject=${subject}`;
      emailLink.href = href;
      mailButton.href = href;
      emailLink.removeAttribute("aria-disabled");
      mailButton.removeAttribute("aria-disabled");
      mailButton.title = `Email ${name}`;
    } else {
      emailLink.removeAttribute("href");
      mailButton.removeAttribute("href");
      emailLink.setAttribute("aria-disabled", "true");
      mailButton.setAttribute("aria-disabled", "true");
      mailButton.title = "Supplier email is not available";
    }
    $("supplierContactDialog").showModal();
  }

  function render(data) {
    const po = data.po || {};
    currentPoData = po;
    const buyer = data.buyer || {};
    const supplierKey = Object.keys(supplierProfiles).find(key => String(po.supplier_name || "").toLowerCase().includes(key));
    const profile = supplierProfiles[supplierKey] || {};
    currentSupplierName = String(po.supplier_name || "Supplier");

    set("headerNumber", po.po_number);
    set("poNumber", po.po_number);
    set("summaryNumber", po.po_number);
    set("rfqNumber", po.rfq_number);
    set("buyerName", buyer.full_name || "Buyer");
    set("buyerEmail", buyer.email || "");
    set("buyerInitial", (buyer.full_name || "B").trim().charAt(0).toUpperCase());
    set("orderDate", formatDate(po.order_date));
    set("deliveryDate", formatDate(po.expected_delivery));
    set("paymentTerms", present(po.payment_terms));
    set("supplierName", currentSupplierName);
    set("supplierContact", present(po.supplier_contact, profile.contact));
    set("supplierEmail", present(po.supplier_email, profile.email));
    set("supplierPhone", present(po.supplier_phone, profile.phone));
    set("supplierLocation", present(po.supplier_location, profile.location));
    const logo = $("supplierLogo");
    logo.src = profile.logo ? `../assets/${profile.logo}` : "../assets/catalog/avatar-outline.svg";
    logo.alt = `${currentSupplierName} logo`;
    logo.onerror = () => { logo.onerror = null; logo.src = "../assets/catalog/avatar-outline.svg"; };

    const status = String(po.status || "").toLowerCase();

    const tbody = $("itemRows");
    tbody.replaceChildren();
    (Array.isArray(data.items) ? data.items : []).forEach((item, i) => {
      const tr = document.createElement("tr");
      const cells = [i + 1, item.item_name || "—", `${quantity(item.qty_ordered)} ${item.unit || ""}`.trim(), money(item.unit_price), money(item.subtotal)];
      cells.forEach(value => { const td = document.createElement("td"); td.textContent = String(value); tr.append(td); });
      tbody.append(tr);
    });
    if (!tbody.children.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td"); td.colSpan = 5; td.textContent = "No ordered items found.";
      tr.append(td); tbody.append(tr);
    }

    const subtotal = Number(po.total_amount) || 0;
    const vat = Math.round(subtotal * 0.12 * 100) / 100;
    set("subtotal", money(subtotal));
    set("vatAmount", money(vat));
    set("estimatedTotal", money(subtotal + vat));
    const notes = String(po.notes_to_supplier || "").trim();
    $("supplierNotes").hidden = !notes;
    if (notes) $("supplierNotes").textContent = `Notes to Supplier: ${notes}`;
    trackingState = po;
    lastTrackingAt = performance.now();
    viewLoaded = true;
    updateTracking();
    $("loading").hidden = true;
    $("poSheet").hidden = false;
    document.title = `UniProcur | ${po.po_number}`;
  }

  async function load() {
    if (!/^PO-[A-Za-z0-9-]{1,26}$/.test(poNumber)) {
      set("loading", "Missing or invalid PO number. Return to Buyer Purchase Orders.");
      return;
    }
    try {
      const response = await fetch(
        `../database/get-buyer-purchase-orders.php?po_number=${encodeURIComponent(poNumber)}`,
        { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } }
      );
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Unable to load PO details.");
      render(data);
    } catch (error) {
      console.error("Buyer View PO:", error);
      set("loading", error.message || "Unable to load Purchase Order. Check your Buyer login and database connection.");
    }
  }

  
$("printButton").addEventListener("click", () => {
  window.location.href =
    "buyer-print-purchase-order.html?po_number=" +
    encodeURIComponent(poNumber);
});

  $("contactSupplier").addEventListener("click", openSupplierContact);
  $("closeSupplierContact").addEventListener("click", () => $("supplierContactDialog").close());
  $("supplierContactDialog").addEventListener("click", event => {
    if (event.target === $("supplierContactDialog")) $("supplierContactDialog").close();
  });
  $("supplierContactMail").addEventListener("click", event => {
    if (!event.currentTarget.hasAttribute("href")) {
      event.preventDefault();
      toast("Supplier email is not available.");
    }
  });
  $("viewGrButton").addEventListener("click", () => {
    toast("Goods Receipt (GR) viewing isn't connected yet. No GR record is being assumed or created.");
  });
  $("bellButton").addEventListener("click", () => toast("No notifications for this Purchase Order yet."));
  load();
  // Visual timer ticks each second; backend re-read detects cross-tab Inventory demo acceptance.
  // No browser timer drives shipment milestones.
  setInterval(refreshTracking, 9000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshTracking(); });
})();

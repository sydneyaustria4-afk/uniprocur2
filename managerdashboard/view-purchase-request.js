"use strict";

document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const prNumber = params.get("pr");

  const loadingMessage = document.getElementById("loadingMessage");
  const errorMessage = document.getElementById("errorMessage");
  const prViewCard = document.getElementById("prViewCard");
  const itemList = document.getElementById("itemList");
  const toast = document.getElementById("toast");

  function showToast(message) {
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("is-visible");

    window.setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 3000);
  }

  function formatDate(value, includeTime = false) {
    if (!value) return "—";

    const date = new Date(String(value).replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return String(value);

    return new Intl.DateTimeFormat("en-PH", {
      year: "numeric",
      month: "long",
      day: "2-digit",
      ...(includeTime && {
        hour: "2-digit",
        minute: "2-digit"
      })
    }).format(date);
  }

  function createTimelineItem({
    heading,
    title,
    description,
    date,
    completed = false,
    rejected = false
  }) {
    const wrapper = document.createElement("div");
    wrapper.className = `timeline-item${completed ? " completed" : ""}${rejected ? " rejected" : ""}`;

    const dot = document.createElement("span");
    dot.className = "timeline-dot";

    const headingElement = document.createElement("h3");
    headingElement.textContent = heading;

    const titleElement = document.createElement("strong");
    titleElement.textContent = title;

    const descriptionElement = document.createElement("p");
    descriptionElement.textContent = description;

    wrapper.append(dot, headingElement, titleElement, descriptionElement);

    if (date) {
      const time = document.createElement("time");
      time.textContent = formatDate(date, true);
      wrapper.append(time);
    }

    return wrapper;
  }

  function getItemImage(itemName) {
    const name = String(itemName || "").trim().toLowerCase();

    const images = {
      "full-grain leather": "../assets/catalog/full-grain-leather.png",
      "metal eyelets": "../assets/catalog/metal-eyelets.png",
      "metal buckles": "../assets/catalog/metal-buckles.png",
      "mesh fabric": "../assets/catalog/mesh-fabric.png",
      "nubuck leather": "../assets/catalog/nubuck-leather.png",
      "suede leather": "../assets/catalog/suede-leather.png",
      "canvas fabric": "../assets/catalog/canvas-fabric.png",
      "pu leather": "../assets/catalog/pu-leather.png",
      "eva foam": "../assets/catalog/eva-foam-sheets.png",
      "eva foam sheets": "../assets/catalog/eva-foam-sheets.png",
      "zippers": "../assets/catalog/zippers.png",
      "shoe boxes": "../assets/catalog/shoe-boxes.png",
      "shoes box": "../assets/catalog/shoe-boxes.png",
      "packaging tape": "../assets/catalog/packaging-tape.png",
      "rubber cement": "../assets/catalog/rubber-cement.png",
      "tpr outsoles": "../assets/catalog/tpr-outsoles.png"
    };

    return images[name] || "";
  }

  function createImageFallback() {
    const fallback = document.createElement("div");
    fallback.className = "item-image-fallback";
    fallback.textContent = "▧";
    return fallback;
  }

  function renderItems(items, purpose) {
    itemList.replaceChildren();

    if (!Array.isArray(items) || items.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "No items found in this Purchase Request.";
      itemList.append(empty);
      return;
    }

    items.forEach((item) => {
      const card = document.createElement("article");
      card.className = "request-item";

      const imagePath = getItemImage(item.item_name);

      if (imagePath) {
        const image = document.createElement("img");
        image.className = "item-image";
        image.src = imagePath;
        image.alt = item.item_name || "Requested item";
        image.onerror = () => image.replaceWith(createImageFallback());
        card.append(image);
      } else {
        card.append(createImageFallback());
      }

      const details = document.createElement("div");
      details.className = "item-details";

      const name = document.createElement("h3");
      name.textContent = item.item_name || "Unnamed item";

      const meta = document.createElement("div");
      meta.className = "item-meta";

      const categoryLabel = document.createElement("span");
      categoryLabel.textContent = "Category:";
      const categoryValue = document.createElement("span");
      categoryValue.textContent = item.category || "—";

      const codeLabel = document.createElement("span");
      codeLabel.textContent = "Item Code:";
      const codeValue = document.createElement("span");
      codeValue.textContent = item.item_code || "—";

      const quantityLabel = document.createElement("span");
      quantityLabel.textContent = "Qty:";
      const quantityValue = document.createElement("span");
      const quantity = item.qty == null || item.qty === "" ? "—" : item.qty;
      quantityValue.textContent = `${quantity} ${item.unit || ""}`.trim();

      meta.append(
        categoryLabel, categoryValue,
        codeLabel, codeValue,
        quantityLabel, quantityValue
      );

      const description = document.createElement("div");
      description.className = "item-description";

      const descriptionLabel = document.createElement("strong");
      descriptionLabel.textContent = "Description:";
      const descriptionValue = document.createElement("span");
      descriptionValue.textContent = purpose || "No description provided.";

      description.append(descriptionLabel, descriptionValue);
      details.append(name, meta, description);
      card.append(details);
      itemList.append(card);
    });
  }

  function renderApprovalHistory(request) {
    const timeline = document.getElementById("approvalTimeline");
    timeline.replaceChildren();

    const status = String(request.status || "").toLowerCase();

    timeline.append(
      createTimelineItem({
        heading: "Submitted",
        title: "Buyer submitted the Purchase Request.",
        description: request.created_by_name
          ? `Submitted by ${request.created_by_name}.`
          : "Purchase Request submitted.",
        date: request.created_at,
        completed: true
      })
    );

    if (status === "draft") {
      timeline.replaceChildren();
      timeline.append(
        createTimelineItem({
          heading: "Draft",
          title: "Purchase Request saved as a draft.",
          description: "Not yet submitted for Manager approval.",
          date: request.created_at,
          completed: true
        })
      );
    } else if (status === "submitted" || status === "pending") {
      timeline.append(
        createTimelineItem({
          heading: "Awaiting Approval",
          title: "Waiting for Manager review.",
          description: "Your Purchase Request is pending approval."
        })
      );
    } else if (status === "approved") {
      timeline.append(
        createTimelineItem({
          heading: "Reviewed",
          title: "Your Purchase Request was reviewed.",
          description: request.approved_by_name
            ? `Reviewed by ${request.approved_by_name}.`
            : "Reviewed by the Manager.",
          date: request.approved_at,
          completed: true
        })
      );

      timeline.append(
        createTimelineItem({
          heading: "Approved",
          title: `Decision by ${request.approved_by_name || "Manager"}.`,
          description: String(request.manager_remarks || "").trim() ||
            "Your Purchase Request has been approved successfully.",
          date: request.approved_at,
          completed: true
        })
      );
    } else if (status === "rejected") {
      timeline.append(
        createTimelineItem({
          heading: "Reviewed",
          title: "Your Purchase Request was reviewed.",
          description: request.approved_by_name
            ? `Reviewed by ${request.approved_by_name}.`
            : "Reviewed by the Manager.",
          date: request.approved_at,
          completed: true
        })
      );

      timeline.append(
        createTimelineItem({
          heading: "Rejected",
          title: `Decision by ${request.approved_by_name || "Manager"}.`,
          description: String(request.rejection_reason || "").trim() ||
            "No rejection reason was provided by the Manager.",
          date: request.approved_at,
          rejected: true
        })
      );
    }
  }

  if (!prNumber) {
    loadingMessage.hidden = true;
    errorMessage.textContent = "No Purchase Request number was provided.";
    errorMessage.hidden = false;
    return;
  }

  try {
    const response = await fetch(
      `../database/get-purchase-request.php?pr_number=${encodeURIComponent(prNumber)}`,
      {
        method: "GET",
        credentials: "same-origin",
        headers: { "Accept": "application/json" }
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to load Purchase Request.");
    }

    const request = result.purchase_request;
    const items = result.items || [];
    const status = String(request.status || "").toLowerCase();

    document.getElementById("headerPRNumber").textContent = request.pr_number;
    document.getElementById("prNumber").textContent = request.pr_number;
    document.getElementById("createdDate").textContent = formatDate(request.created_at);

    document.getElementById("approvedDate").textContent = request.approved_at
      ? formatDate(request.approved_at)
      : "Not yet decided";

    const decisionDateLabel = document.getElementById("decisionDateLabel");
    if (decisionDateLabel) {
      decisionDateLabel.textContent =
        status === "approved" || status === "rejected"
          ? "Decision Date"
          : "Approval Date";
    }

    document.getElementById("buyerName").textContent =
      result.buyer?.full_name || request.created_by_name || "Buyer";
    document.getElementById("buyerEmail").textContent =
      result.buyer?.email || request.created_by_email || "";

    document.getElementById("prPurpose").textContent =
      request.purpose || "No justification provided.";

    renderItems(items, request.purpose);
    renderApprovalHistory(request);

    // Draft-only actions stay hidden for submitted/approved/rejected PRs.
    const isDraft = status === "draft";
    const prActions = document.getElementById("prActions");
    if (prActions) prActions.hidden = !isDraft;

    const deleteButton = document.getElementById("deleteDraftButton");
    if (deleteButton) {
      deleteButton.addEventListener("click", () => {
        showToast("Delete Draft action is not connected yet.");
      });
    }

    const editButton = document.getElementById("editPRButton");
    if (editButton) {
      editButton.addEventListener("click", () => {
        sessionStorage.setItem("uniprocur_edit_pr_number", request.pr_number);
        window.location.href =
          `new-purchase-request.html?pr=${encodeURIComponent(request.pr_number)}`;
      });
    }

    const submitButton = document.getElementById("submitPRButton");
    if (submitButton) {
      submitButton.addEventListener("click", () => {
        showToast("Submit PR action will be connected next.");
      });
    }

    loadingMessage.hidden = true;
    prViewCard.hidden = false;

  } catch (error) {
    console.error("View Purchase Request error:", error);
    loadingMessage.hidden = true;
    errorMessage.textContent = error.message || "Purchase Request could not be loaded.";
    errorMessage.hidden = false;
  }
});

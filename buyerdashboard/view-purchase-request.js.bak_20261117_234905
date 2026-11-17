
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
    toast.textContent = message;
    toast.classList.add("is-visible");

    window.setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 3000);
  }

  function formatDate(value, includeTime = false) {
    if (!value) return "—";

    const date = new Date(String(value).replace(" ", "T"));

    if (Number.isNaN(date.getTime())) return value;

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
    completed = false
  }) {
    const wrapper = document.createElement("div");
    wrapper.className =
      `timeline-item${completed ? " completed" : ""}`;

    const dot = document.createElement("span");
    dot.className = "timeline-dot";

    const headingElement = document.createElement("h3");
    headingElement.textContent = heading;

    const titleElement = document.createElement("strong");
    titleElement.textContent = title;

    const descriptionElement = document.createElement("p");
    descriptionElement.textContent = description;

    wrapper.append(
      dot,
      headingElement,
      titleElement,
      descriptionElement
    );

    if (date) {
      const time = document.createElement("time");
      time.textContent = formatDate(date, true);
      wrapper.append(time);
    }

    return wrapper;
  }

  
function getItemImage(itemName) {
  const name = String(itemName || "")
    .trim()
    .toLowerCase();

 
const images = {
    // ========================================
    // LEATHER
    // ========================================
    "full-grain leather": "../assets/Full%20Grain%20Leather.svg",
    "black leather": "../assets/black%20leather.svg",
    "nubuck leather": "../assets/Nubuck%20Leather.svg",

    // ========================================
    // TEXTILE AND SYNTHETIC
    // ========================================
    "mesh fabric": "../assets/Mesh%20Fabric.svg",
    "canvas fabric": "../assets/Canvas%20Fabric.svg",
    "pu leather": "../assets/PU%20Leather.svg",

    // ========================================
    // COMPONENTS
    // ========================================
    "rubber sole": "../assets/catalog/vulcanized-rubber-outsoles.png",
    "eva foam": "../assets/Eva%20Foam%20Sheets.svg",
    "eva foam sheets": "../assets/Eva%20Foam%20Sheets.svg",
    "foam insole": "../assets/foam%20insole.svg",

    // ========================================
    // HARDWARE
    // ========================================
    "metal eyelets": "../assets/Metal%20Eyelets.svg",
    "metal buckles": "../assets/Metal%20Buckles.svg",
    "shoelaces": "../assets/shoe%20laces.svg",

    // ========================================
    // PACKAGING
    // ========================================
    "shoe boxes": "../assets/Shoes%20Box.svg",
    "shoes box": "../assets/Shoes%20Box.svg",
    "shoe boxes (eco friendly)": "../assets/Shoes%20Box.svg",
    "tissue paper rolls": "../assets/Tissue%20Paper%20Rolls.svg",
    "packaging tape": "../assets/Packaging%20Tape.svg",

    // ========================================
    // ADHESIVE
    // ========================================
    "shoe adhesive": "../assets/shoe%20adhesive.svg",

    // ========================================
    // OLD MATERIALS - HISTORICAL PRs
    // ========================================
    "suede leather": "../assets/Suede%20Leather.svg",
    "tpr outsoles": "../assets/catalog/tpr-outsoles.png",
    "zippers": "../assets/Zippers.svg",
    "vulcanized rubber outsoles": "../assets/Vulcanized%20Rubber%20Outsoles.svg",
    "rubber cement": "../assets/Rubber%20Cement.svg"
};



  return images[name] || "";
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
        image.alt = item.item_name;
        image.onerror = () => {
          image.replaceWith(createImageFallback());
        };
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
      quantityValue.textContent =
        `${item.qty || "—"} ${item.unit || ""}`.trim();

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

  function createImageFallback() {
    const fallback = document.createElement("div");
    fallback.className = "item-image-fallback";
    fallback.textContent = "▧";
    return fallback;
  }

  function renderApprovalHistory(request) {
    const timeline = document.getElementById("approvalTimeline");
    timeline.replaceChildren();

    timeline.append(
      createTimelineItem({
        heading: "Draft",
        title: "Created the PR as Draft.",
        description: "Not yet submitted for approval.",
        date: request.created_at,
        completed: true
      })
    );

    const status = String(request.status || "").toLowerCase();

    if (status === "submitted") {
      timeline.append(
        createTimelineItem({
          heading: "Awaiting Approval",
          title: "Buyer submitted the PR for approval.",
          description: "Waiting for Manager review.",
          date: request.created_at
        })
      );
    }

    if (status === "approved") {
      timeline.append(
        createTimelineItem({
          heading: "Approved",
          title: "Approved by Manager.",
          description: "Purchase Request approved.",
          date: request.approved_at,
          completed: true
        })
      );
    }

    if (status === "rejected") {
      timeline.append(
        createTimelineItem({
          heading: "Rejected",
          title: "Purchase Request rejected.",
          description: request.rejection_reason || "See the Manager for details.",
          date: request.approved_at
        })
      );
    }

    if (status === "draft") {
      timeline.append(
        createTimelineItem({
          heading: "Awaiting Submission",
          title: "Buyer must submit for approval.",
          description: "This Purchase Request is still a draft."
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
        headers: {
          "Accept": "application/json"
        }
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(
        result.message || "Unable to load Purchase Request."
      );
    }

    const request = result.purchase_request;
    const items = result.items || [];

    document.getElementById("headerPRNumber").textContent =
      request.pr_number;

    document.getElementById("prNumber").textContent =
      request.pr_number;

    document.getElementById("createdDate").textContent =
      formatDate(request.created_at);

    document.getElementById("approvedDate").textContent =
      request.approved_at
        ? formatDate(request.approved_at)
        : "Not yet approved";

    document.getElementById("buyerName").textContent =
      request.created_by_name || "Buyer";

    document.getElementById("buyerEmail").textContent =
      request.created_by_email || "";

    document.getElementById("prPurpose").textContent =
      request.purpose || "No justification provided.";

    renderItems(items, request.purpose);
    renderApprovalHistory(request);

    // Show draft actions only for draft Purchase Requests.
   
// Display actions based on Purchase Request status.
const status = String(request.status || "").toLowerCase();

const isDraft = status === "draft";
const isApproved = status === "approved";

const prActions = document.getElementById("prActions");
const deleteDraftButton = document.getElementById("deleteDraftButton");
const editPRButton = document.getElementById("editPRButton");
const submitPRButton = document.getElementById("submitPRButton");
const createRFQButton = document.getElementById("createRFQButton");

// Draft PR: show draft actions.
// Approved PR: show Create RFQ.
// Submitted / Rejected: hide these actions.
prActions.hidden = !(isDraft || isApproved);

deleteDraftButton.hidden = !isDraft;
editPRButton.hidden = !isDraft;
submitPRButton.hidden = !isDraft;
createRFQButton.hidden = !isApproved;

if (isApproved) {
  createRFQButton.style.display = "inline-flex";
} else {
  createRFQButton.style.display = "none";
}

// Open the existing RFQ creation page.
createRFQButton.addEventListener("click", () => {
  if (!isApproved) return;

  const query = new URLSearchParams({
    pr_id: String(request.id),
    pr_number: request.pr_number
  });

  window.location.href =
    `../PR202601/edit-rfq2.html?${query.toString()}`;
});


    // The buttons are displayed here; their database actions
    // will be connected in the next implementation step.
  
deleteDraftButton.addEventListener("click", async () => {
  if (!isDraft) return;

  const confirmed = window.confirm(
    `Permanently delete ${request.pr_number}? This cannot be undone.`
  );

  if (!confirmed) return;

  deleteDraftButton.disabled = true;

  try {
    const response = await fetch(
      "../database/buyer-draft-action.php",
      {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          action: "delete",
          pr_number: request.pr_number
        })
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(
        result.message || "Unable to delete draft."
      );
    }

    window.location.href = "buyer-dashboard.html";

  } catch (error) {
    console.error("Delete Draft error:", error);
    showToast(error.message || "Unable to delete draft.");
    deleteDraftButton.disabled = false;
  }
});


    document.getElementById("editPRButton")
      .addEventListener("click", () => {
        sessionStorage.setItem(
          "uniprocur_edit_pr_number",
          request.pr_number
        );

        window.location.href =
          `new-purchase-request.html?pr=${encodeURIComponent(request.pr_number)}`;
      });

    
document.getElementById("submitPRButton")
  .addEventListener("click", async () => {
   
    

    const button = document.getElementById("submitPRButton");
    button.disabled = true;

    try {
      const response = await fetch(
        "../database/buyer-draft-action.php",
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({
            action: "submit",
            pr_number: request.pr_number
          })
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "Unable to submit PR."
        );
      }

     window.location.reload();

      window.location.reload();

    } catch (error) {
      console.error("Submit PR error:", error);
      showToast(error.message);
      button.disabled = false;
    }
  });


    loadingMessage.hidden = true;
    prViewCard.hidden = false;

  } catch (error) {
    console.error("View Purchase Request error:", error);

    loadingMessage.hidden = true;
    errorMessage.textContent =
      error.message || "Purchase Request could not be loaded.";
    errorMessage.hidden = false;
  }
});

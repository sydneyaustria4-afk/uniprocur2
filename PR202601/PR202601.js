
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
  showToast("The RFQ page has not been connected yet.");
});

// Notifications
document.querySelector(".notification-button").addEventListener("click", () => {
  showToast("You have no new notifications.");
});

// Profile menu
document.querySelector(".profile-chevron").addEventListener("click", () => {
  showToast("The profile menu has not been connected yet.");
});

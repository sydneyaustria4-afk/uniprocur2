"use strict";
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("acceptForm");
  const input = document.getElementById("poNumber");
  const btn = document.getElementById("acceptButton");
  const result = document.getElementById("result");
  const initial = new URLSearchParams(location.search).get("po_number");
  if (initial) input.value = initial;
  form.addEventListener("submit", async event => {
    event.preventDefault();
    btn.disabled = true;
    result.className = "status";
    result.textContent = "Checking Manager approval and demo timer...";
    try {
      const response = await fetch("../database/demo-inventory-accept-po.php", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ po_number: input.value.trim() })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Unable to accept order.");
      result.className = "status ok";
      result.textContent = data.message;
    } catch (error) {
      result.className = "status bad";
      result.textContent = error.message || "Simulator failed.";
    } finally { btn.disabled = false; }
  });
});
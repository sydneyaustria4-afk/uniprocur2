"use strict";
(() => {
  const FAQS = [
  [
    "How do I get an account?",
    "Your company account, email address, and initial password are provided by the HR department. Contact HR or your supervisor if you have not received your credentials."
  ],
  [
    "Why change my password?",
    "Changing your password helps protect your account. Password changes and recovery are managed by HR, so contact HR for assistance."
  ],
  [
    "Why can't I register directly?",
    "UniProcur uses employee accounts created and managed by the HR department. Direct registration is not available in the Procurement module."
  ],
  [
    "How to create a PR?",
    "Open Purchase Request and select New PR. Enter the required material details and quantities, review the request, then submit it for manager approval."
  ],
  [
    "What if my PR is rejected?",
    "The request status changes to Rejected. Check the available remarks or rejection reason, if provided, and coordinate with your supervisor before submitting a revised request."
  ],
  [
    "What is an RFQ?",
    "A Request for Quotation (RFQ) is a document sent to suppliers to request their prices, delivery terms, and other quotation details for required materials."
  ],
  [
    "How do I compare quotations?",
    "Record the quotations received from suppliers and review them using the Quotation Comparison Matrix before selecting a supplier."
  ],
  [
    "What is a Purchase Order?",
    "A Purchase Order is a formal document sent to a supplier containing the agreed products, quantities, prices, delivery details, and payment terms."
  ],
  [
    "Can I edit a sent PO?",
    "Once a Purchase Order is sent to the supplier, it becomes locked. Review the details carefully before sending it."
  ],
  [
    "Why can't I order extra quantities?",
    "Once a Purchase Order is sent to the supplier, it becomes locked. Review the details carefully before sending it."
  ],
  [
    "What is Goods Receiving?",
    "Goods Receiving records the actual quantities of footwear materials or finished goods delivered by a supplier against a Purchase Order."
  ],
  [
    "What follows receipt confirmation?",
    "The system automatically records a Stock IN transaction in the Inventory module for the accepted quantity received. This applies once the Inventory integration is connected."
  ]
];
  const byId = id => document.getElementById(id);
  const container = byId("faqList");
  const search = byId("helpSearch");
  const count = byId("faqCount");
  const empty = byId("faqEmpty");
  const toast = byId("supportToast");
  let timer;

  function showMessage(message) {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(() => { toast.hidden = true; }, 3500);
  }

  function render(term = "") {
    const query = term.trim().toLocaleLowerCase();
    const matches = FAQS.filter(([question, answer]) =>
      !query || (question + " " + answer).toLocaleLowerCase().includes(query)
    );
    container.replaceChildren();
    for (const [question, answer] of matches) {
      const item = document.createElement("details");
      item.className = "faq-item";
      const title = document.createElement("summary");
      title.textContent = question;
      const p = document.createElement("p");
      p.className = "faq-answer";
      p.textContent = answer;
      item.append(title, p);
      container.append(item);
    }
    count.textContent = query ? `${matches.length} matching question${matches.length === 1 ? "" : "s"}` : "";
    empty.hidden = matches.length > 0;
  }

  search.addEventListener("input", () => render(search.value));
  byId("helpSearchForm").addEventListener("submit", event => {
    event.preventDefault();
    render(search.value);
    if (search.value.trim()) {
      const first = container.querySelector("details");
      if (first) first.open = true;
      container.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
  document.querySelectorAll("[data-placeholder]").forEach(button => {
    button.addEventListener("click", () => showMessage(`${button.dataset.placeholder} is not connected yet.`));
  });
  // Read-only existing Buyer account endpoint; works with the localhost demo identity.
  fetch("../database/buyer-settings.php", { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (!data?.success || !data.user) return;
      
const name = "Buyer";
const email = "buyer@gmail.com";

      for (const id of ["topName", "sideName"]) byId(id).textContent = name;
      for (const id of ["topEmail", "sideEmail"]) byId(id).textContent = email;
      for (const id of ["topInitial", "sideInitial"]) byId(id).textContent = (name.trim().charAt(0) || "B").toUpperCase();
    })
    .catch(() => {});
  render();
})();

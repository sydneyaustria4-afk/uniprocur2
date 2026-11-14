"use strict";

// Handles the existing Buyer/Manager sidebar sign-out buttons before
// dashboard scripts can turn their clicks into placeholder toast messages.
document.addEventListener("click", (event) => {
  const control = event.target instanceof Element
    ? event.target.closest(
        "button.profile-exit, button.pr-profile-exit, " +
        "button.signout-button, button#signOutButton"
      )
    : null;

  if (!control) return;

  const description = [
    control.getAttribute("aria-label") || "",
    control.getAttribute("title") || "",
    control.getAttribute("data-toast") || "",
    control.getAttribute("data-coming-soon") || "",
    control.id || ""
  ].join(" ");

  if (!/sign[\s-]?out/i.test(description)) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  // POST (not a link/GET) invokes the already installed PHP logout endpoint.
  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/uniprocur2/login/logout.php";
  form.hidden = true;
  document.body.appendChild(form);
  form.submit();
}, true);

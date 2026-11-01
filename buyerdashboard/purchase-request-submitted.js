
"use strict";

document.addEventListener("DOMContentLoaded", () => {

  const params = new URLSearchParams(window.location.search);

  let requestNumber = params.get("pr") || "PR-2026-NN";

  let submittedPreview = null;


  // Retrieve submitted request information from session storage.
  try {

    const rawPreview = sessionStorage.getItem(
      "uniprocur_submitted_request_preview"
    );

    if (rawPreview) {

      submittedPreview = JSON.parse(rawPreview);

      if (
        submittedPreview &&
        submittedPreview.requestNumber
      ) {
        requestNumber = submittedPreview.requestNumber;
      }
    }

  } catch (error) {

    console.warn(
      "Submitted request preview could not be restored:",
      error
    );

  }


  // Update PR number in all three locations.
  [
    "backgroundRequestNumber",
    "cardRequestNumber",
    "successRequestNumber"
  ].forEach((id) => {

    const element = document.getElementById(id);

    if (element) {
      element.textContent = requestNumber;
    }

  });


  // Display the required date from the previous form.
  if (submittedPreview) {

    const datePreview = document.getElementById(
      "requiredDatePreview"
    );

    const justificationPreview = document.getElementById(
      "justificationPreview"
    );


    if (
      datePreview &&
      submittedPreview.requiredDate
    ) {

      const date = new Date(
        `${submittedPreview.requiredDate}T00:00:00`
      );

      if (!Number.isNaN(date.getTime())) {

        datePreview.textContent =
          new Intl.DateTimeFormat("en-GB", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
          })
          .format(date)
          .replaceAll("/", " / ");

      }
    }


    // Display justification.
    if (
      justificationPreview &&
      submittedPreview.justification
    ) {

      justificationPreview.textContent =
        submittedPreview.justification;

    }

  }


  // Back to Buyer Dashboard.
  const dashboardLink = document.getElementById(
    "backToDashboardButton"
  );

  if (dashboardLink) {

    dashboardLink.href = new URL(
      "buyer-dashboard.html",
      window.location.href
    ).href;

  }

});

/*
 * UniProcur Manager profile label — LOCAL DEMO DISPLAY ONLY.
 * This does not log in a user or change real account, role, permissions,
 * Manager approvals, historical decision names, or any SQL records.
 * PHP authorization continues to use the original account.
 */
(() => {
  'use strict';

  const DISPLAY_NAME = 'Manager';
  const DISPLAY_EMAIL = 'manager@gmail.com';
  const nameIds = [
    'sidebarManagerName', 'topbarManagerName',
    'managerName', 'manager-name', 'profileName'
  ];
  const emailIds = [
    'sidebarManagerEmail', 'topbarManagerEmail',
    'managerEmail', 'manager-email', 'profileEmail'
  ];
  const avatarIds = [
    'sidebarAvatar', 'topbarAvatar',
    'managerAvatar', 'manager-avatar', 'profileAvatar'
  ];
  const profileContainers = [
    '.profile-copy', '.account-copy', '.topbar-user'
  ];

  function setPlainText(element, value) {
    if (!element || /^(INPUT|TEXTAREA|SELECT|IMG)$/.test(element.tagName)) return;
    // Do not replace nested buttons, icons, supplier data, etc.
    if (element.children.length > 0) return;
    if (element.textContent.trim() !== value) element.textContent = value;
  }

  function applyProfile() {
    for (const id of nameIds) setPlainText(document.getElementById(id), DISPLAY_NAME);
    for (const id of emailIds) setPlainText(document.getElementById(id), DISPLAY_EMAIL);
    for (const id of avatarIds) setPlainText(document.getElementById(id), 'M');

    // Legacy Manager headers without stable IDs (display area only).
    for (const container of document.querySelectorAll(profileContainers.join(', '))) {
      setPlainText(container.querySelector(':scope > strong'), DISPLAY_NAME);
      setPlainText(container.querySelector(':scope > small'), DISPLAY_EMAIL);
    }
  }

  function start() {
    applyProfile();

    // Some Manager detail pages replace profile labels after async API calls.
    // Observe only profile elements, not the entire dashboard or audit history.
    const targets = new Set();
    for (const id of [...nameIds, ...emailIds, ...avatarIds]) {
      const element = document.getElementById(id);
      if (element) targets.add(element);
    }
    for (const container of document.querySelectorAll(profileContainers.join(', '))) {
      targets.add(container);
    }
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        applyProfile();
      });
    });
    for (const target of targets) {
      observer.observe(target, {childList: true, characterData: true, subtree: true});
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, {once: true});
  } else {
    start();
  }
})();

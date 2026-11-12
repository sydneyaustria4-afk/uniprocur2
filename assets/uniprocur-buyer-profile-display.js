/*
 * UniProcur Buyer UI profile label (development/demo presentation only).
 * Does NOT log in a user, change session/account permissions, modify records,
 * or send/change any data in Procurement or Inventory.
 *
 * Must never be treated as identity verification. The PHP authorization layer
 * retains the real authenticated buyer record.
 */
(() => {
  'use strict';
  const DISPLAY_NAME = 'Buyer';
  const DISPLAY_EMAIL = 'buyer@gmail.com';
  const nameIds = [
    'buyerName', 'loggedInName', 'buyerSidebarName', 'sidebarBuyerName',
    'topbarBuyerName', 'topName', 'sideName', 'userFullName'
  ];
  const emailIds = [
    'buyerEmail', 'loggedInEmail', 'buyerSidebarEmail', 'sidebarBuyerEmail',
    'topbarBuyerEmail', 'topEmail', 'sideEmail', 'userEmail'
  ];
  const avatarIds = [
    'buyerInitial', 'loggedInAvatar', 'buyerAvatar', 'sidebarAvatar',
    'topbarAvatar', 'topbarBuyerAvatar'
  ];
  const profileContainers = [
    '.profile-copy', '.pr-profile-copy', '.account-name', '.account-copy',
    '.mr-user-label', '.topbar-user', '.topbar-account', '.user-profile',
    '.sidebar-profile', '.sidebar-user', '.profile-mini', '.account'
  ].join(', ');
  const nameLabels = new Set(['Clark Almeda', 'Clark Alameda', 'Buyer Acc']);
  const emailLabels = new Set(['buyer@company.com', 'clark@company.com', 'Local API Test']);

  const setLabel = (element, label) => {
    if (!element || element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') return;
    // Do not overwrite nested controls or images.
    if (element.children.length !== 0) return;
    if (element.textContent.trim() !== label) element.textContent = label;
  };

  function fixProfileText() {
    for (const id of nameIds) setLabel(document.getElementById(id), DISPLAY_NAME);
    for (const id of emailIds) setLabel(document.getElementById(id), DISPLAY_EMAIL);
    for (const id of avatarIds) {
      const el = document.getElementById(id);
      if (el && el.tagName !== 'IMG') setLabel(el, 'B');
    }
    for (const container of document.querySelectorAll(profileContainers)) {
      for (const el of container.querySelectorAll('strong, small, span')) {
        if (el.children.length !== 0) continue;
        const current = el.textContent.trim().replace(/\s+/g, ' ');
        if (nameLabels.has(current)) setLabel(el, DISPLAY_NAME);
        else if (emailLabels.has(current)) setLabel(el, DISPLAY_EMAIL);
      }
    }
  }

  function start() {
    fixProfileText();
    // Some legacy pages write real buyer name/email into header *after* AJAX
    // completes. Keep only the visible PROFILE labels consistent.
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        fixProfileText();
      });
    });
    observer.observe(document.body, {subtree: true, childList: true, characterData: true});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, {once: true});
  } else {
    start();
  }
})();

/* UniProcur role-based labels — presentation layer only.
 * Does not edit PHP sessions, MySQL users, audit logs or request ownership.
 * Covers static HTML plus API-driven text added after page load.
 */
(() => {
  'use strict';
  const labels = [
    [/\bCarlo\s+Diaz\b/gi, 'Manager'],
    [/\bClark\s+Almeda\b/gi, 'Buyer'],
    [/\bClark\s+Alameda\b/gi, 'Buyer']
  ];
  const selectorLabels = [
    ['#manager-name, #managerName, #topbarManagerName, #sidebarManagerName, #profileManagerName', 'Manager'],
    ['#buyerName, #loggedInName, #buyerSidebarName, #sidebarBuyerName, #topbarBuyerName, #profileBuyerName', 'Buyer'],
    ['#manager-avatar, #managerAvatar, #topbarManagerAvatar', 'M'],
    ['#buyerInitial, #buyerAvatar, #topbarBuyerAvatar', 'B']
  ];

  function clean(value) {
    let updated = value;
    for (const [pattern, role] of labels) updated = updated.replace(pattern, role);
    return updated
      .replace(/\bDecision by Manager\s*[·|]\s*Manager\b/gi, 'Decision by Manager');
  }

  function safeElement(el) {
    return el && !el.closest('script, style, noscript, textarea, option, pre, code, [contenteditable="true"]');
  }

  function cleanText(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!safeElement(node.parentElement)) continue;
      const after = clean(node.nodeValue);
      if (node.nodeValue !== after) node.nodeValue = after;
    }
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el && safeElement(el) && el.textContent !== value) el.textContent = value;
  }

  function historyByRole() {
    // Manager success/rejection pages: each history item represents a known role.
    if (/\/manager-request-(approved|rejected)\.html$/i.test(location.pathname)) {
      const history = document.getElementById('approval-history');
      if (history) {
        Array.from(history.children).forEach((entry, index) => {
          const role = index === 0 ? 'Buyer' : 'Manager';
          const walker = document.createTreeWalker(entry, NodeFilter.SHOW_TEXT);
          let node;
          while ((node = walker.nextNode())) {
            const initial = node.nodeValue;
            let next = initial;
            if (/^\s*by\s+\S/i.test(initial)) next = initial.replace(/\bby\s+.+/i, 'by ' + role);
            else if (/·\s*by\s+/i.test(initial)) next = initial.replace(/·\s*by\s+.+$/i, '· by ' + role);
            if (next !== initial) node.nodeValue = next;
          }
        });
      }
      const decisionId = location.pathname.includes('approved') ? 'decision-by' : 'rejection-decision-by';
      const el = document.getElementById(decisionId);
      if (el && el.textContent.trim()) setText(decisionId, 'Decision by Manager');
    }

    // Manager's PR decision page.
    if (/\/manager-view-purchase-request\.html$/i.test(location.pathname)) {
      const submitted = document.getElementById('timeline-submitter');
      if (submitted && /^\s*by\s+\S/i.test(submitted.textContent)) setText('timeline-submitter', 'by Buyer');
      const decision = document.getElementById('timeline-decision');
      if (decision && /·\s*by\s+/i.test(decision.textContent)) {
        const next = decision.textContent.replace(/·\s*by\s+.+$/i, '· by Manager');
        if (next !== decision.textContent) decision.textContent = next;
      }
    }

    // Previous PR detail page's timeline uses longer role-attribution sentences.
    if (/\/view-purchase-request\.html$/i.test(location.pathname)) {
      const history = document.getElementById('approvalTimeline');
      if (history) {
        const walker = document.createTreeWalker(history, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          const initial = node.nodeValue;
          const next = initial
            .replace(/\bSubmitted by\s+[^.]+\./gi, 'Submitted by Buyer.')
            .replace(/\bReviewed by\s+[^.]+\./gi, 'Reviewed by Manager.')
            .replace(/\bDecision by\s+[^.]+\./gi, 'Decision by Manager.');
          if (next !== initial) node.nodeValue = next;
        }
      }
    }
  }

  function auditRoleLabels() {
    // Audit table continues to retain the verified actor_name in the API/SQL.
    for (const row of document.querySelectorAll('tr')) {
      const nameCell = row.querySelector('td.user-name');
      if (!nameCell || !nameCell.nextElementSibling) continue;
      const role = nameCell.nextElementSibling.textContent.trim().toLowerCase();
      const label = role === 'manager' ? 'Manager' : role === 'buyer' ? 'Buyer' : null;
      if (label && nameCell.textContent !== label) nameCell.textContent = label;
    }
  }

  function apply() {
    if (!document.body) return;
    cleanText(document.body);
    // Keep profile name labels role-based even for future user accounts.
    for (const [selector, role] of selectorLabels) {
      for (const el of document.querySelectorAll(selector)) {
        if (safeElement(el) && el.textContent.trim() && el.textContent !== role) el.textContent = role;
      }
    }
    historyByRole();
    auditRoleLabels();
    for (const el of document.querySelectorAll('[title], [aria-label]')) {
      for (const attr of ['title', 'aria-label']) {
        if (!el.hasAttribute(attr)) continue;
        const raw = el.getAttribute(attr);
        const next = clean(raw);
        if (raw !== next) el.setAttribute(attr, next);
      }
    }
  }

  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      apply();
    });
  }

  function start() {
    apply();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {childList:true, subtree:true, characterData:true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();

"use strict";
/**
 * Quotation confirmation: display stored RFQ date/time/warehouse and
 * submit a selected quotation for FINANCE REVIEW, not immediate awarding.
 * Loaded after award-confirmation.js and intercepts its legacy Award click
 * in the capture phase before the old award-rfq.php handler can run.
 * Status stays 'compared' until Finance reviews the quotation.
 */
(() => {
  const byId = id => document.getElementById(id);
  const url = new URLSearchParams(window.location.search);
  const rfqNumber = url.get('rfq_number') || '';
  const quoteId = Number(url.get('quote_id'));
  const warehouses = {
    main: 'Main Warehouse — Brgy. II-C, San Pablo City, Laguna',
    second: 'Second Warehouse — Palina, Nagcarlan, Laguna'
  };
  let csrfToken = '';
  let financeStatus = null;
  let alreadySubmittedQuote = null;
  let dataLoaded = false;

  const make = (tag, text, className) => {
    const node = document.createElement(tag);
    if (typeof text === 'string') node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const asDate = raw => {
    const value = String(raw || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Not recorded';
    const d = new Date(`${value}T00:00:00`);
    return Number.isNaN(d.getTime()) ? 'Not recorded' :
      d.toLocaleDateString('en-PH', {month:'long', day:'numeric', year:'numeric'});
  };
  const asTime = raw => {
    const match = /^(\d\d):(\d\d)(?::\d\d)?$/.exec(String(raw || ''));
    if (!match) return 'Not recorded for this RFQ';
    const h = Number(match[1]);
    if (h > 23 || Number(match[2]) > 59) return 'Not recorded for this RFQ';
    const hour12 = (h % 12) || 12;
    return `${hour12}:${match[2]} ${h >= 12 ? 'PM' : 'AM'}`;
  };
  const details = (rfq, review) => {
    const host = byId('nextContent');
    if (!host) return;
    host.replaceChildren();
    host.append(make('p', 'Review the selected supplier quotation and delivery details before sending it to Finance.'));
    const rows = [
      ['Required delivery date (from PR)', asDate(rfq.requested_delivery_date)],
      ['RFQ required date', asDate(rfq.deadline)],
      ['RFQ required time', asTime(rfq.deadline_time)],
      ['Warehouse / delivery location', warehouses[rfq.warehouse_value] || 'Warehouse not recorded']
    ];
    const container = make('div', undefined, 'finance-delivery-details');
    rows.forEach(([key, value]) => {
      const row = make('div', undefined, 'finance-delivery-row');
      row.append(make('strong', key), make('span', value));
      container.append(row);
    });
    host.append(container);
    if (review && review.review_status === 'pending') {
      host.append(make('p', 'Selected quotation has been submitted. Finance approval is pending. A Purchase Order cannot be created yet.'));
    } else if (review && review.review_status === 'approved') {
      host.append(make('p', 'Finance approved this quotation. The final Finance-to-PO workflow still needs to be connected.'));
    } else if (review && review.review_status === 'rejected') {
      host.append(make('p', `Finance rejected the previous selection. ${review.review_note || 'Select a quotation and resubmit.'}`));
    } else {
      host.append(make('p', 'Select Send Quotation to Finance. After Finance approves, Procurement can proceed to the Purchase Order workflow.'));
    }
    host.append(make('p', 'Finance submission is stored in Procurement MySQL for review. Notifications and Finance approval endpoints still require integration with the Finance team.', 'note'));
  };
  const action = () => byId('awardButton');
  const setButton = (text, disabled) => {
    const btn = action();
    if (!btn) return;
    btn.replaceChildren(document.createTextNode(text));
    btn.disabled = disabled;
  };
  const status = (message, error) => {
    const el = byId('status');
    if (!el) return;
    el.classList.toggle('error', !!error);
    el.classList.toggle('success', !error);
    el.textContent = message;
  };
  const showSubmitted = () => {
    financeStatus = 'pending';
    alreadySubmittedQuote = quoteId;
    setButton('Pending Finance Approval', true);
    const modal = byId('awardSuccessModal');
    if (!modal) return;
    byId('successTitle').replaceChildren(
      make('span', rfqNumber),
      document.createTextNode('Sent to Finance')
    );
    const p = modal.querySelector('.success-message');
    if (p) p.textContent = 'Selected quotation was saved for Finance review. No supplier has been awarded and no Purchase Order has been created.';
    const poButton = byId('createPOButton');
    if (poButton) poButton.hidden = true;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  };

  async function loadFinance() {
    const res = await fetch(`../database/submit-quotation-finance.php?rfq_number=${encodeURIComponent(rfqNumber)}`, {
      credentials: 'same-origin', cache: 'no-store', headers: {Accept:'application/json'}
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Cannot check Finance review.');
    csrfToken = data.csrf_token || '';
    financeStatus = data.finance_review?.review_status || null;
    alreadySubmittedQuote = Number(data.finance_review?.quote_id || 0) || null;
    return data.finance_review;
  }
  async function refreshDetails() {
    if (!rfqNumber || !Number.isInteger(quoteId) || quoteId < 1) return;
    try {
      const [rfqRes, review] = await Promise.all([
        fetch(`../database/get-rfq-comparison.php?rfq_number=${encodeURIComponent(rfqNumber)}`, {
          credentials: 'same-origin', cache:'no-store', headers:{Accept:'application/json'}
        }),
        loadFinance()
      ]);
      const info = await rfqRes.json();
      if (!rfqRes.ok || !info.success) throw new Error(info.message || 'RFQ unavailable.');
      const quote = (info.suppliers || []).find(q => Number(q.quote_id) === quoteId);
      if (!quote) throw new Error('Supplier quotation not found in RFQ.');
      details(info.rfq, review);
      dataLoaded = true;
      if (financeStatus === 'pending') {
        setButton('Pending Finance Approval', true);
        status('Quotation submitted to Finance. Awaiting their decision.');
      } else if (financeStatus === 'approved') {
        setButton('Finance Approved', true);
        status('Quotation approved by Finance. Final PO handoff still requires integration.');
      } else if (info.rfq.status !== 'compared') {
        setButton(info.rfq.status === 'awarded' ? 'Already Awarded' : 'Unavailable', true);
      } else {
        setButton('Send Quotation to Finance', false);
      }
    } catch(e) {
      console.error('Finance quotation addon:', e);
      dataLoaded = false;
      setButton('Finance Submission Unavailable', true);
      status(e.message, true);
    }
  }
  async function sendToFinance(ev) {
    ev.preventDefault();
    ev.stopImmediatePropagation(); // Blocks old award-rfq.php handler even if button was enabled.
    if (!dataLoaded || !csrfToken) {
      status('Finance submission is unavailable; refresh the page.', true);
      setButton('Finance Submission Unavailable', true);
      return;
    }
    if (financeStatus === 'pending' || financeStatus === 'approved') {
      setButton(financeStatus === 'pending' ? 'Pending Finance Approval' : 'Finance Approved', true);
      return;
    }
    setButton('Sending...', true);
    try {
      const res = await fetch('../database/submit-quotation-finance.php', {
        method:'POST', credentials:'same-origin',
        headers:{ 'Content-Type':'application/json', 'Accept':'application/json', 'X-CSRF-Token':csrfToken },
        body:JSON.stringify({rfq_number:rfqNumber, quote_id:quoteId})
      });
      const out = await res.json();
      if (!res.ok || !out.success) throw new Error(out.message || 'Could not submit to Finance.');
      status('Quotation saved as Pending Finance Approval. No PO is created yet.');
      showSubmitted();
      // Display updated status and keep the date/time/location visible on reload.
      const infoRes=await fetch(`../database/get-rfq-comparison.php?rfq_number=${encodeURIComponent(rfqNumber)}`, {credentials:'same-origin'});
      if (infoRes.ok) {
        const info=await infoRes.json();
        if(info.success) details(info.rfq, {review_status:'pending'});
      }
    } catch(e) {
      status(e.message, true);
      setButton('Send Quotation to Finance', false);
    }
  }
  document.addEventListener('DOMContentLoaded', () => {
    document.title = 'UniProcur | Send Quotation to Finance';
    const topTitle = document.querySelector('.top-brand > div > span');
    if(topTitle) topTitle.textContent='Finance Quotation Submission';
    setButton('Loading Finance Status...', true);
    const btn=action();
    if(btn) btn.addEventListener('click', sendToFinance, true); // capture, before legacy handler
    const poButton=byId('createPOButton');
    if (poButton) poButton.hidden = true;
    refreshDetails();
  });
})();

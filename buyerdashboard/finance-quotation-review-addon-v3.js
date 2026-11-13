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
    const storedQuoteId = Number(review?.quote_id || 0);
    const thisQuoteIsStored = storedQuoteId > 0 && storedQuoteId === quoteId;
    if (review && review.review_status === 'pending') {
      if (thisQuoteIsStored) {
        host.append(make('p', `Quote #${quoteId} is recorded in Procurement as Pending Finance Approval. This is a stored request, not proof that the Finance team's system has received it.`));
      } else {
        host.append(make('p', `Quote #${storedQuoteId} is the one awaiting Finance review. You are VIEWING Quote #${quoteId}, which has NOT been submitted. The selected quote cannot be sent until the previous request is rejected or formally withdrawn.`));
      }
    } else if (review && review.review_status === 'approved') {
      if (thisQuoteIsStored) {
        host.append(make('p', `Finance approved Quote #${quoteId}. Confirm this supplier award to proceed to Purchase Order creation and Manager approval.`));
      } else {
        host.append(make('p', `Finance approved Quote #${storedQuoteId}, NOT the selected Quote #${quoteId}. Only the exact approved quote can proceed to supplier award.`));
      }
    } else if (review && review.review_status === 'rejected') {
      host.append(make('p', `Previously submitted Quote #${storedQuoteId} was rejected. ${review.review_note || 'You may select a different quotation and resubmit for Finance review.'}`));
    } else {
      host.append(make('p', `You are viewing Quote #${quoteId}. It has not been submitted for Finance review yet. Submit it to save a pending request in Procurement.`));
    }
    if (review && storedQuoteId > 0 && !thisQuoteIsStored && ['pending','approved'].includes(review.review_status)) {
      const link = make('a', `Open submitted Quote #${storedQuoteId}`, 'finance-po-link');
      link.href = `award-confirmation.html?rfq_number=${encodeURIComponent(rfqNumber)}&quote_id=${encodeURIComponent(storedQuoteId)}`;
      host.append(link);
    }
    host.append(make('p', 'This is saved in the Procurement database only. The Finance team must still connect its system to the secure Procurement API.', 'note'));
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
      document.createTextNode('Queued for Finance Review')
    );
    const p = modal.querySelector('.success-message');
    if (p) p.textContent = 'Selected quotation was saved in Procurement for Finance review. It has not been transmitted into the Finance team system yet. No Purchase Order has been created.';
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
        if (alreadySubmittedQuote === quoteId) {
          setButton('Pending Finance Approval', true);
          status(`Quote #${quoteId} is pending Finance review in Procurement. Finance system integration is not connected yet.`);
        } else {
          setButton(`Quote #${alreadySubmittedQuote} Is Pending`, true);
          status(`Quote #${quoteId} has NOT been submitted. Quote #${alreadySubmittedQuote} is the pending Finance request for ${rfqNumber}.`, true);
        }
      } else if (financeStatus === 'approved') {
        if (info.rfq.status === 'awarded' && alreadySubmittedQuote === quoteId) {
          setButton('Already Awarded', true);
          status('Finance approved and the supplier is awarded. You can create the Purchase Order.');
          const host = byId('nextContent');
          if (host) {
            const link = make('a', 'Create Purchase Order', 'finance-po-link');
            link.href = `create-purchase-order.html?rfq_number=${encodeURIComponent(rfqNumber)}&quote_id=${encodeURIComponent(quoteId)}`;
            host.append(link);
          }
        } else if (info.rfq.status === 'compared' && alreadySubmittedQuote === quoteId) {
          setButton('Confirm Supplier Award', false);
          status('Finance approved this exact quotation. Click Confirm Supplier Award to proceed.');
          const poButton = byId('createPOButton');
          if (poButton) poButton.hidden = false; // Modal remains hidden until award-rfq.php succeeds.
        } else {
          setButton(`Quote #${alreadySubmittedQuote} Finance Approved`, true);
          status(`Quote #${quoteId} is NOT Finance-approved. Finance approved Quote #${alreadySubmittedQuote}.`, true);
        }
      } else if (info.rfq.status !== 'compared') {
        setButton(info.rfq.status === 'awarded' ? 'Already Awarded' : 'Unavailable', true);
      } else if (financeStatus === 'rejected') {
        setButton('Send Selected Quotation to Finance', false);
        status(`Previous Quote #${alreadySubmittedQuote} was rejected. You can submit the selected Quote #${quoteId} as a new request version.`);
      } else {
        setButton('Send Quotation to Finance', false);
        status(`Quote #${quoteId} has not been submitted for Finance review.`);
      }
    } catch(e) {
      console.error('Finance quotation addon:', e);
      dataLoaded = false;
      setButton('Finance Submission Unavailable', true);
      status(e.message, true);
    }
  }
  async function sendToFinance(ev) {
    // The original Award Confirmation JS owns the final supplier award POST.
    // It already enforces Finance approval server-side in award-rfq.php.
    // Only let its click handler run after the same exact quotation is approved.
    if (financeStatus === 'approved' && alreadySubmittedQuote === quoteId && dataLoaded) {
      return;
    }
    ev.preventDefault();
    ev.stopImmediatePropagation(); // Pending/rejected: never run the legacy award handler.
    if (!dataLoaded || !csrfToken) {
      status('Finance submission is unavailable; refresh the page.', true);
      setButton('Finance Submission Unavailable', true);
      return;
    }
    if (financeStatus === 'pending' || financeStatus === 'approved') {
      setButton(financeStatus === 'pending' ? `Quote #${alreadySubmittedQuote} Is Pending` : `Quote #${alreadySubmittedQuote} Finance Approved`, true);
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
      status(`Quote #${quoteId} saved locally as Pending Finance Approval. Finance team connection is not yet active.`);
      showSubmitted();
      // Display updated status and keep the date/time/location visible on reload.
      const infoRes=await fetch(`../database/get-rfq-comparison.php?rfq_number=${encodeURIComponent(rfqNumber)}`, {credentials:'same-origin'});
      if (infoRes.ok) {
        const info=await infoRes.json();
        if(info.success) details(info.rfq, {review_status:'pending', quote_id:quoteId});
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

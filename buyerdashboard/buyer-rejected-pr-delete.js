/* UniProcur - audited soft-delete of rejected PR from existing View PR page. */
(() => {
  'use strict';
  const number = new URLSearchParams(location.search).get('pr') || '';
  if (!/^PR-[A-Za-z0-9-]{3,70}$/.test(number)) return;
  const URL = '../database/buyer-archive-rejected-pr.php';
  let token = '';
  let working = false;
  let ready = false;

  function toast(message) {
    const existing = document.getElementById('toast');
    if (existing) {
      existing.textContent = message;
      existing.classList.add('is-visible');
    } else alert(message);
  }

  function addStyles() {
    if (document.getElementById('archivePrStyles')) return;
    const s = document.createElement('style');
    s.id = 'archivePrStyles';
    s.textContent = `
      #prActions #rejectedDeleteButton:not(:disabled) {opacity:1;cursor:pointer}
      #prActions #rejectedDeleteButton:not(:disabled):hover {background:#fff4f4}
      .pr-archive-backdrop{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.58);display:grid;place-items:center;padding:20px}
      .pr-archive-dialog{max-width:470px;width:100%;background:#fff;color:#171717;border-radius:14px;padding:27px;box-shadow:0 20px 80px rgba(0,0,0,.25);font:14px/1.5 Inter,Arial,sans-serif}
      .pr-archive-dialog h2{font-size:21px;margin:0 0 10px}
      .pr-archive-dialog p{margin:0 0 15px;color:#444}
      .pr-archive-warning{background:#fff2ee;border-left:3px solid #df3b31;padding:12px;margin:15px 0}
      .pr-archive-confirm{display:flex;align-items:flex-start;gap:10px;margin:15px 0}
      .pr-archive-confirm input{margin-top:4px}
      .pr-archive-actions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}
      .pr-archive-actions button{border-radius:8px;border:1px solid #777;padding:9px 13px;background:#fff;color:#171717;cursor:pointer}
      .pr-archive-actions .pr-archive-submit{background:#d71920;color:#fff;border-color:#d71920}
      .pr-archive-actions .pr-archive-submit:disabled{opacity:.5;cursor:not-allowed}
      .pr-archive-error{color:#b42318 !important;min-height:1.3em}
    `;
    document.head.appendChild(s);
  }

  function openConfirm() {
    if (working || !ready || !token || document.querySelector('.pr-archive-backdrop')) return;
    addStyles();
    const overlay = document.createElement('div');
    overlay.className = 'pr-archive-backdrop';
    const dialog = document.createElement('div');
    dialog.className = 'pr-archive-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'prArchiveTitle');
    
dialog.innerHTML = `
  <h2 id="prArchiveTitle">Delete Purchase Request?</h2>

  <p>Are you sure you want to delete <strong class="archiveNumber"></strong>?</p>

  <label class="pr-archive-confirm">
    <input type="checkbox" class="prArchiveAck">
    Yes, I want to delete this Purchase Request.
  </label>

  <p class="pr-archive-error" role="alert" aria-live="assertive"></p>

  <div class="pr-archive-actions">
    <button type="button" class="prArchiveCancel">Cancel</button>
    <button type="button" class="pr-archive-submit" disabled>Delete PR</button>
  </div>
`;

    dialog.querySelector('.archiveNumber').textContent = number;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    const cancel = dialog.querySelector('.prArchiveCancel');
    const checkbox = dialog.querySelector('.prArchiveAck');
    const submit = dialog.querySelector('.pr-archive-submit');
    const errorNode = dialog.querySelector('.pr-archive-error');
    const close = () => {if(!working){overlay.remove();document.removeEventListener('keydown', keyListener);}};
    const keyListener = (e) => {if(e.key==='Escape') close();};
    document.addEventListener('keydown', keyListener);
    overlay.addEventListener('click', e => {if(e.target===overlay) close();});
    cancel.addEventListener('click', close);
    checkbox.addEventListener('change', () => { submit.disabled = !checkbox.checked; });
    submit.addEventListener('click', async () => {
      if (!checkbox.checked || working) return;
      working = true;submit.disabled = true;cancel.disabled=true;errorNode.textContent='';
      try {
        const response = await fetch(URL, {method:'POST',credentials:'same-origin',cache:'no-store',
          headers:{'Content-Type':'application/json',Accept:'application/json'},
          body: JSON.stringify({action:'archive',pr_number:number,csrf_token:token,confirm:true})});
        const data = await response.json();
        if (!response.ok || data.success !== true) throw new Error(data.message || `HTTP ${response.status}`);
        location.assign('purchase-requests.html');
      } catch(e) {
        errorNode.textContent = e.message || 'Unable to delete PR.';
        working=false;cancel.disabled=false;submit.disabled=!checkbox.checked;
      }
    });
    cancel.focus();
  }

  function wireButton() {
    if (!ready) return;
    const btn = document.getElementById('rejectedDeleteButton');
    if (!btn) return;
    btn.disabled = false;
    btn.removeAttribute('title');
    btn.setAttribute('aria-label', `Delete rejected ${number} from active lists`);
    if (btn.dataset.archiveWired) return;
    btn.dataset.archiveWired='1';
    btn.addEventListener('click', e => {e.preventDefault();openConfirm();});
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const actions = document.getElementById('prActions');
    if (!actions) return;
    // Earlier rejected-action addon may insert its disabled Delete button after its fetch.
    const observer = new MutationObserver(wireButton);
    observer.observe(actions, {childList:true});
    try {
      const response = await fetch(`${URL}?pr_number=${encodeURIComponent(number)}`,
        {credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
      const data=await response.json();
      if(!response.ok||data.success!==true||data.eligible!==true)return;
      token=String(data.csrf_token||'');ready=Boolean(token);
      wireButton();
    } catch(e) { console.warn('Rejected PR delete action unavailable:',e); }
  });
})();

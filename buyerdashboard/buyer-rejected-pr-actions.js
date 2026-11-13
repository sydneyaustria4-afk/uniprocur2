/* Buyer Dashboard rejected PR actions: match Figma Revise / View / Resubmit flow. */
'use strict';
(() => {
  function upgrade() {
    document.querySelectorAll('.task-board .task-item').forEach(card => {
      const actions=[...card.querySelectorAll('.task-action-button')];
      const labels=actions.map(b=>b.textContent.trim());
      // Only rejected task group has this unique legacy combination.
      if(!labels.includes('Escalate to Manager')&&!labels.includes('Update Deadline')&&!labels.includes('Revise PR')) return;
      for(const button of actions){
        const old=button.textContent.trim();
        const next=old==='Escalate to Manager'?'Revise PR':old==='View Task'?'View PR':old==='Update Deadline'?'Resubmit for Approval':old;
        if(button.textContent!==next)button.textContent=next;
        if(button.disabled)button.disabled=false;
        if(button.hasAttribute('title'))button.removeAttribute('title');
        if(button.hasAttribute('aria-label'))button.removeAttribute('aria-label');
        if(button.hasAttribute('data-toast'))delete button.dataset.toast;
      }
    });
  }
  // Capture before legacy bubbling handlers and the generic task-navigation addon.
  document.addEventListener('click',event=>{
    if(!(event.target instanceof Element))return;
    const button=event.target.closest('.task-board .task-action-button');
    if(!button||button.disabled)return;
    const label=button.textContent.trim();
    if(label!=='Revise PR'&&label!=='Resubmit for Approval')return;
    event.preventDefault();event.stopImmediatePropagation();
    const number=button.closest('.task-item')?.querySelector('.task-reference')?.textContent?.trim()||'';
    if(!/^PR-[A-Za-z0-9-]{3,70}$/.test(number)){alert('Cannot identify the rejected PR.');return;}
    const query=new URLSearchParams({pr:number});
    if(label==='Resubmit for Approval')query.set('resubmit','1');
    window.location.assign('edit-rejected-pr.html?'+query);
  },true);
  function initialize(){
    const board=document.querySelector('.task-board');if(!board)return;
    upgrade();new MutationObserver(upgrade).observe(board,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();

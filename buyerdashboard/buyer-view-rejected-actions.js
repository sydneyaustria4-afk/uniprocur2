/* View rejected PR: Figma-style Revise PR action and complete rejection timeline. */
'use strict';
document.addEventListener('DOMContentLoaded',async()=>{
  const number=new URLSearchParams(location.search).get('pr')||'';
  if(!/^PR-[A-Za-z0-9-]{3,70}$/.test(number))return;
  try{
    const res=await fetch('../database/buyer-rejected-pr-action.php?pr_number='+encodeURIComponent(number),
      {credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
    const data=await res.json().catch(()=>({}));
    if(!res.ok||data.success!==true)return;
    const pr=data.purchase_request, status=String(pr.status||'').toLowerCase();
    const history=Array.isArray(data.history)?data.history:[];
    const apply=()=>{
      const card=document.getElementById('prViewCard');
      if(!card||card.hidden)return;
      const actions=document.getElementById('prActions');
      if(status==='rejected'&&actions){
        actions.hidden=false;
        let deleteBtn=document.getElementById('rejectedDeleteButton');
        if(!deleteBtn){
          deleteBtn=document.createElement('button');deleteBtn.type='button';deleteBtn.id='rejectedDeleteButton';deleteBtn.className='delete-button';
          deleteBtn.disabled=true;deleteBtn.title='Deletion of rejected requests is disabled to preserve the Manager decision and audit history.';
          deleteBtn.innerHTML='<img src="../assets/delete.svg" alt=""> Delete PR';actions.append(deleteBtn);
        }
        if(!document.getElementById('rejectedReviseButton')){
          const link=document.createElement('a');link.id='rejectedReviseButton';link.className='pr-revise-link';
          link.href='edit-rejected-pr.html?pr='+encodeURIComponent(number);
          link.innerHTML='<img src="../assets/edit.svg" alt=""> Revise PR';actions.append(link);
        }
        const meta=document.querySelector('#approvedDate')?.closest('.meta-item');
        if(meta){const label=meta.querySelector('span');if(label)label.textContent='Required Date';
          const value=document.getElementById('approvedDate');if(value)value.textContent=pr.needed_by||'—';}
      }
      const timeline=document.getElementById('approvalTimeline');
      if(timeline){
        // History events do not overwrite the existing current-decision timeline.
        if(history.length&&!timeline.querySelector('.rev-history-group')){
          const group=document.createElement('section');group.className='rev-history-group';
          const h=document.createElement('h3');h.textContent='Previous Manager Decisions';group.append(h);
          history.forEach((entry,i)=>{
            const row=document.createElement('p');
            row.textContent=`Rejection ${i+1} · ${entry.rejected_at||'date not recorded'}: ${entry.rejection_reason||entry.manager_remarks||'No reason supplied.'} (Revised ${entry.revised_at||'—'})`;
            group.append(row);
          });
          timeline.append(group);
        }
        if(status==='rejected'&&!timeline.querySelector('.rev-revision-needed')){
          const row=document.createElement('div');row.className='rev-revision-needed';
          row.innerHTML='<span class="rev-timeline-dot" aria-hidden="true"></span><small>Revision Needed</small><strong>Buyer must revise and resubmit.</strong><span>Pending</span>';
          timeline.append(row);
        }
      }
    };
    apply();
    const card=document.getElementById('prViewCard');
    if(card&&card.hidden){
      const observer=new MutationObserver(()=>{if(!card.hidden){apply();observer.disconnect();}});
      observer.observe(card,{attributes:true,attributeFilter:['hidden']});
    }
    // Existing page JS may toggle the actions after its API call; restore only for rejected status.
    const actions=document.getElementById('prActions');
    if(status==='rejected'&&actions){
      const observer=new MutationObserver(()=>{if(actions.hidden)actions.hidden=false;});
      observer.observe(actions,{attributes:true,attributeFilter:['hidden']});
    }
  }catch(error){console.info('Optional rejected PR UI details unavailable:',error);}
});

/* Print the real Purchase Request only AFTER its existing database-driven view has loaded. */
'use strict';
(() => {
  const query = new URLSearchParams(window.location.search);
  if (query.get('print') !== '1') return;
  let opened = false;
  function ready() {
    if (opened) return;
    const card = document.getElementById('prViewCard');
    const displayedNumber = document.getElementById('prNumber');
    const requestedNumber = query.get('pr');
    if (!card || card.hidden || !displayedNumber || displayedNumber.textContent.trim() !== requestedNumber) return;
    opened = true;
    window.setTimeout(() => window.print(), 250);
  }
  function init() {
    ready();
    const card = document.getElementById('prViewCard');
    if (card) new MutationObserver(ready).observe(card, {attributes:true, attributeFilter:['hidden']});
    const number = document.getElementById('prNumber');
    if (number) new MutationObserver(ready).observe(number, {childList:true,characterData:true,subtree:true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();

/* Optional classroom demo launcher: no API, no database writes. */
'use strict';
(() => {
  function init() {
    if (document.querySelector('[data-uniprocur-demo-launch]')) return;
    const link = document.createElement('a');
    link.href = 'uniprocur-demo.html';
    link.textContent = 'Classroom Demo';
    link.setAttribute('aria-label', 'Open separate classroom-only simulation (no database changes)');
    link.dataset.uniprocurDemoLaunch = 'true';
    const style = document.createElement('style');
    style.textContent = `
      [data-uniprocur-demo-launch]{position:fixed!important;right:20px;bottom:18px;z-index:1500;
        background:#fff!important;color:#ac100c!important;border:2px solid #ac100c!important;
        box-shadow:0 4px 18px rgba(0,0,0,.18);padding:10px 15px;border-radius:999px;
        font:700 12px Inter,Arial,sans-serif!important;text-decoration:none!important}
      [data-uniprocur-demo-launch]:focus-visible{outline:3px solid #136bbf;outline-offset:3px}
      @media print{[data-uniprocur-demo-launch]{display:none!important}}
      @media(max-width:600px){[data-uniprocur-demo-launch]{right:10px;bottom:10px;font-size:11px!important;padding:8px 12px}}
    `;
    document.head.append(style);
    document.body.append(link);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();

/* Static payment QR only. No nickname reservations or cloud requests. */
(function(){
  'use strict';
  const modal=document.getElementById('donate-modal');if(!modal)return;
  let lastFocus=null;
  try{sessionStorage.removeItem('gbti_donation_intent_v1');}catch(_){}
  function show(value){
    modal.hidden=!value;document.body.style.overflow=value?'hidden':'';
    if(value){lastFocus=document.activeElement;modal.querySelector('[data-donation-dismiss]').focus();}
    else lastFocus?.focus();
  }
  document.querySelectorAll('[data-donate-open]').forEach(el=>el.addEventListener('click',()=>show(true)));
  modal.querySelectorAll('[data-donate-close]').forEach(el=>el.addEventListener('click',()=>show(false)));
  document.addEventListener('keydown',e=>{
    if(modal.hidden)return;if(e.key==='Escape'){show(false);return;}
    if(e.key==='Tab'){
      const nodes=[...modal.querySelectorAll('button,a[href]')].filter(el=>!el.disabled&&el.getClientRects().length);
      const first=nodes[0],last=nodes.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    }
  });
})();

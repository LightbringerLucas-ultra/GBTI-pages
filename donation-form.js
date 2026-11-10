(function(){
  'use strict';
  const modal=document.getElementById('donate-modal');if(!modal)return;
  const form=modal.querySelector('form'),draft=modal.querySelector('[data-donation-draft]'),reservation=modal.querySelector('[data-donation-reservation]');
  const qr=modal.querySelector('[data-donation-qr]'),error=modal.querySelector('[data-donation-error]'),countdown=modal.querySelector('[data-donation-countdown]');
  const confirm=modal.querySelector('[data-donation-confirm]'),renew=modal.querySelector('[data-donation-renew]'),connection=modal.querySelector('[data-donation-connection]');
  const storageKey='gbti_donation_intent_v1';let token='',intent=null,offset=0,confirmed=false,busy=false,lastFocus=null,timer=0;
  try{const saved=JSON.parse(sessionStorage.getItem(storageKey)||'null');if(saved&&/^[a-f0-9]{64}$/.test(saved.token)){token=saved.token;intent=saved.intent||null;}}catch(_){}
  if(!token&&window.crypto?.getRandomValues)token=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
  function save(){try{sessionStorage.setItem(storageKey,JSON.stringify({token,intent}));}catch(_){}}
  const messages={amounts_busy:'这个档位的专属金额暂时已占满，请选择其他档位或稍后再试。',too_many_requests:'操作有点频繁，请一分钟后再试。',invalid_input:'昵称请使用 1–20 个汉字、字母或数字，可含空格、点、横线；填写昵称时请勾选公开展示。',not_found:'这次金额预留已失效，请重新生成。'};
  function endpoint(){const url=new URL(window.GBTI_DONATION_API||'https://69.8.137.191');if(url.protocol!=='https:'&&!(/^localhost$|^127\.0\.0\.1$/.test(url.hostname)&&url.protocol==='http:'))throw new Error('暂时无法连接收款服务。');return url.origin;}
  async function request(path,payload){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
    try{const response=await fetch(endpoint()+path,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',cache:'no-store',body:JSON.stringify(payload),signal:controller.signal});
      const data=await response.json();if(!response.ok||data.error)throw new Error(messages[data.error]||'暂时无法连接收款服务，请稍后重试。');
      if(data.intent){intent=data.intent;offset=intent.serverTime-Date.now();save();}return data;
    }catch(e){if(e.name==='AbortError'||e instanceof TypeError)throw new Error('连接暂时不可用，请检查网络后重试。');throw e;}finally{clearTimeout(timeout);}
  }
  function sayError(message){error.textContent=message;error.hidden=!message;}
  function lock(value){busy=value;modal.querySelectorAll('[data-donation-action]').forEach(el=>el.disabled=value);}
  function currentState(){return intent?.state==='pending'&&intent.expiresAt<=Date.now()+offset?'expired':intent?.state;}
  function render(){
    const state=currentState(),active=Boolean(intent);draft.hidden=active;reservation.hidden=!active;
    if(!active){qr.hidden=true;return;}
    modal.querySelector('[data-donation-amount]').textContent='¥'+(intent.amountCents/100).toFixed(2);
    modal.querySelector('[data-donation-name]').textContent=intent.nickname?'特效将展示：'+intent.nickname:'特效将展示：匿名支持';
    const remaining=Math.max(0,Math.ceil((intent.expiresAt-Date.now()-offset)/1000));
    countdown.textContent=state==='matched'?'已匹配到这笔支持，谢谢你。':state==='expired'?'专属金额已过期，请勿继续按这个金额付款。':state==='canceled'?'本次预留已取消。':'请在 '+Math.floor(remaining/60)+':'+String(remaining%60).padStart(2,'0')+' 内准确支付此金额。';
    confirm.hidden=state!=='pending'||confirmed;qr.hidden=state!=='pending'||!confirmed;
    renew.textContent=state==='pending'?'取消预留，重新选择':'再打赏一次';
  }
  async function refresh(){if(!intent||busy)return;try{await request('/api/intents/status',{clientToken:token,id:intent.id});render();}catch(e){if(e.message===messages.not_found){intent=null;save();render();}sayError(e.message);}}
  function connectionText(){const state=window.GBTI_DONATIONS?.state().connection;connection.textContent=state==='connected'?'实时到账通道已连接':state==='reconnecting'?'实时到账通道正在重连':'正在连接实时到账通道';}
  function show(value){
    modal.hidden=!value;document.body.style.overflow=value?'hidden':'';clearInterval(timer);
    if(value){lastFocus=document.activeElement;sayError('');render();connectionText();refresh();timer=setInterval(()=>{if(!modal.hidden)render();},1000);modal.querySelector('[data-donation-dismiss]').focus();}
    else lastFocus?.focus();
  }
  document.querySelectorAll('[data-donate-open]').forEach(el=>el.addEventListener('click',()=>show(true)));
  modal.querySelectorAll('[data-donate-close]').forEach(el=>el.addEventListener('click',()=>show(false)));
  document.addEventListener('keydown',e=>{
    if(modal.hidden)return;if(e.key==='Escape'){show(false);return;}
    if(e.key==='Tab'){
      const nodes=[...modal.querySelectorAll('button,input,select,a[href]')].filter(el=>!el.disabled&&el.getClientRects().length);
      const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    }
  });
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(busy)return;sayError('');
    const nickname=form.elements.nickname.value.normalize('NFKC').trim(),publishName=form.elements.publishName.checked;
    if(nickname&&!publishName){sayError('展示昵称需要你的同意，请勾选公开展示，或清空昵称匿名打赏。');return;}
    if(!token){sayError('当前浏览器无法生成安全的付款配对，请换用新版浏览器。');return;}
    lock(true);try{await request('/api/intents',{clientToken:token,nickname,publishName,tier:form.elements.tier.value});confirmed=false;render();}catch(e){sayError(e.message);}finally{lock(false);if(intent)confirm.focus();}
  });
  confirm.addEventListener('click',()=>{if(currentState()!=='pending'){render();return;}confirmed=true;render();});
  renew.addEventListener('click',async()=>{
    if(busy)return;lock(true);sayError('');try{if(currentState()==='pending')await request('/api/intents/cancel',{clientToken:token,id:intent.id});intent=null;confirmed=false;save();render();form.elements.nickname.focus();}catch(e){sayError(e.message);}finally{lock(false);}
  });
  window.addEventListener('gbti:donation-connection',connectionText);
  window.addEventListener('gbti:donation-ready',()=>{if(!modal.hidden)refresh();});
  window.addEventListener('gbti:donation-start',event=>{if(!event.detail.preview&&intent&&event.detail.intentId===intent.id){intent.state='matched';save();render();}});
  window.addEventListener('pagehide',()=>clearInterval(timer));save();connectionText();
})();

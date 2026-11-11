/* Original canvas choreography and synthesized sound; no external media. */
(function () {
  'use strict';
  const core = window.GBTI_DONATION_CORE;
  if (!core || window.GBTI_DONATIONS) return;
  const TAU = Math.PI * 2, clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
  const ease = n => 1 - Math.pow(1 - clamp(n), 3);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const Audio = window.AudioContext || window.webkitAudioContext;
  let audio = null, soundOn = true, soundStop = null;
  let host = null, root = null, canvas = null, paint = null, current = null, raf = 0;
  let width = 0, height = 0, particles = [], stars = [], started = 0;
  let soundPlayed = false, connection = 'disabled';
  const queue = [], seen = new Map();
  try {
    soundOn = localStorage.getItem('gbti_donation_sound_v1') !== 'off';
    const saved = JSON.parse(sessionStorage.getItem('gbti_donation_seen_v1') || '[]');
    if (Array.isArray(saved)) saved.slice(-256).forEach(pair => {
      if (Array.isArray(pair) && typeof pair[0] === 'string' && Number.isFinite(pair[1]) && Date.now() - pair[1] < 86400000) seen.set(pair[0], pair[1]);
    });
  } catch (_) {}

  function dispatch(name, detail) { window.dispatchEvent(new CustomEvent('gbti:donation-' + name, {detail})); }
  function unlock() {
    if (!Audio || !soundOn) return Promise.resolve(false);
    try {
      audio ||= new Audio();
      if (audio.state === 'suspended') return audio.resume().then(() => audio.state === 'running').catch(() => false);
      return Promise.resolve(audio.state === 'running');
    } catch (_) { return Promise.resolve(false); }
  }
  function stopSound() { if (soundStop) soundStop(); soundStop = null; }
  function scheduleSound(context, tier) {
    const time = context.currentTime + .025, nodes = [], sources = [];
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -17; compressor.knee.value = 14; compressor.ratio.value = 5;
    const master = context.createGain(); master.gain.value = .5;
    master.connect(compressor); compressor.connect(context.destination); nodes.push(master, compressor);
    function tone(offset, length, from, to, gain, type = 'sine') {
      const oscillator = context.createOscillator(), amp = context.createGain();
      oscillator.type = type; oscillator.frequency.setValueAtTime(from, time + offset);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), time + offset + length);
      amp.gain.setValueAtTime(.0001, time + offset);
      amp.gain.exponentialRampToValueAtTime(Math.max(.001, gain), time + offset + .012);
      amp.gain.exponentialRampToValueAtTime(.0001, time + offset + length);
      oscillator.connect(amp); amp.connect(master); oscillator.start(time + offset); oscillator.stop(time + offset + length + .03);
      sources.push(oscillator); nodes.push(amp);
    }
    function shimmer(offset, length, gain) {
      const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * length), context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 1.7);
      const source = context.createBufferSource(), filter = context.createBiquadFilter(), amp = context.createGain();
      source.buffer = buffer; filter.type = 'bandpass'; filter.frequency.setValueAtTime(2800, time + offset);
      filter.frequency.exponentialRampToValueAtTime(350, time + offset + length); filter.Q.value = .6;
      amp.gain.setValueAtTime(gain, time + offset); amp.gain.exponentialRampToValueAtTime(.0001, time + offset + length);
      source.connect(filter); filter.connect(amp); amp.connect(master); source.start(time + offset);
      sources.push(source); nodes.push(filter, amp);
    }
    if (tier === 'spark') {
      [1046.5, 1318.51, 1567.98].forEach((frequency, i) => {
        tone(i * .12, .65, frequency, frequency, .24); tone(i * .12, .25, frequency * 2, frequency * 2, .035);
      });
    } else if (tier === 'meteor') {
      tone(0, .42, 180, 780, .16, 'triangle'); shimmer(.15, .7, .18);
      [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((frequency, i) => tone(.16 + i * .1, .75, frequency, frequency, .23));
      [.9, 1.2, 1.45].forEach(offset => { shimmer(offset, .18, .22); tone(offset, .22, 90, 45, .13); });
    } else {
      tone(0, .65, 100, 600, .23, 'triangle'); shimmer(.15, .85, .24);
      tone(.65, .95, 110, 38, .55); shimmer(.7, 1.1, .3);
      [261.63, 329.63, 392, 523.25].forEach((frequency, i) => {
        tone(.8 + i * .09, 1.8, frequency, frequency, .24, 'triangle');
        tone(.83 + i * .09, 1.2, frequency * 2, frequency * 2, .14);
      });
      [1046.5, 1318.51, 1567.98, 2093].forEach((frequency, i) => tone(1.8 + i * .11, 1.25, frequency, frequency, .17));
      shimmer(2.4, 1.2, .15);
    }
    let stopped = false;
    return () => {
      if (stopped) return; stopped = true;
      const now = context.currentTime; master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now); master.gain.linearRampToValueAtTime(0, now + .025);
      sources.forEach(source => { try { source.stop(now + .03); } catch (_) {} });
      setTimeout(() => { sources.forEach(node => node.disconnect()); nodes.forEach(node => node.disconnect()); }, 60);
    };
  }
  function updateSoundButton() {
    if (!root) return;
    const button = root.querySelector('.sound');
    button.textContent = !Audio ? '音效不可用' : !soundOn ? '开启音效' : audio?.state === 'running' ? '♪ 音效开' : '点按启用音效';
    button.disabled = !Audio; button.setAttribute('aria-pressed', String(soundOn && audio?.state === 'running'));
  }
  function playSound() {
    if (!current || !soundOn || soundPlayed || document.hidden || audio?.state !== 'running') return;
    stopSound(); soundPlayed = true;
    soundStop = scheduleSound(audio, current.tier.id);
    dispatch('sound', {tier: current.tier.id}); updateSoundButton();
  }
  function setSound(value) {
    soundOn = Boolean(value); if (!soundOn) stopSound();
    try { localStorage.setItem('gbti_donation_sound_v1', soundOn ? 'on' : 'off'); } catch (_) {}
    updateSoundButton(); return soundOn;
  }

  function mount() {
    if (host) return;
    host = document.createElement('div'); host.id = 'gbti-donation-effects'; host.hidden = true;
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none;';
    root = host.attachShadow({mode: 'open'});
    root.innerHTML = `<style>
      :host{font-family:"Microsoft YaHei",system-ui,sans-serif;color:#fff;line-height:1.5}
      *{box-sizing:border-box} .stage{position:absolute;inset:0;overflow:hidden;pointer-events:none}
      canvas{position:absolute;inset:0;width:100%;height:100%}
      .veil{position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse at 50% 50%,#133b4188,transparent 65%);transition:opacity .55s}
      .stage[data-tier=meteor] .veil{background:radial-gradient(ellipse at 50% 45%,#30204eaa,#11132944 70%)}
      .stage[data-tier=nova] .veil{background:radial-gradient(ellipse at 50% 40%,#203957e8,#111826d9 65%,#121929e8)}
      .stage.active .veil{opacity:1}.stage.leaving{opacity:0;transition:opacity .45s}
      .card{position:absolute;left:50%;top:53%;width:min(430px,calc(100vw - 32px));transform:translate(-50%,-40%) scale(.88);opacity:0;text-align:center;padding:25px 28px 18px;border-radius:26px;border:1px solid #ffffff38;background:linear-gradient(135deg,#172c35ee,#203444df);backdrop-filter:blur(22px);box-shadow:0 18px 65px #0004;transition:transform .55s cubic-bezier(.2,.8,.2,1),opacity .4s}
      .active .card{opacity:1;transform:translate(-50%,-50%) scale(1)}
      [data-tier=spark] .card{top:50%;transform:translate(-50%,-40%) scale(.92);width:min(390px,calc(100vw - 32px));background:linear-gradient(135deg,#163d36f2,#183233f5);border-color:#9dffe653}
      [data-tier=spark].active .card{transform:translate(-50%,-50%) scale(1)}
      [data-tier=meteor] .card{background:linear-gradient(135deg,#322546ed,#282b48ed);border-color:#d6b7ff66}
      [data-tier=nova] .card{top:64%;border-color:#ffdca56e;background:linear-gradient(135deg,#283446e8,#1e2939ef);box-shadow:0 15px 90px #e6b86922}
      .eyebrow{margin:0 0 5px;font-size:10px;letter-spacing:.22em;color:var(--accent)}
      .title{font-size:19px;font-weight:700;margin:0 0 3px}.amount{font-size:44px;font-weight:850;line-height:1.2;letter-spacing:-.04em;margin:8px 0;color:var(--accent);font-variant-numeric:tabular-nums}.amount span{font-size:21px;vertical-align:middle;margin-right:5px}
      .caption{font-size:12px;color:#dfebe9bf;margin:8px 0 14px}.controls{display:flex;justify-content:center;gap:10px;pointer-events:auto}
      button{font:inherit;font-size:11px;border:1px solid #ffffff2e;border-radius:100px;color:#e8f4f0;background:#ffffff09;padding:6px 13px;cursor:pointer}button:hover{background:#ffffff20}button:focus-visible{outline:2px solid var(--accent);outline-offset:3px}button:disabled{cursor:default;opacity:.55}
      .mark{position:absolute;left:50%;top:25%;transform:translate(-50%,30px) scale(.7);opacity:0;font-family:Arial,sans-serif;font-weight:950;font-size:clamp(60px,15vw,150px);letter-spacing:.1em;padding-left:.1em;background:linear-gradient(#fff8df 6%,#ffdfa5 45%,#d6a75f 68%,#fff4cb 100%);background-clip:text;-webkit-text-fill-color:transparent;filter:drop-shadow(0 7px 0 #78684f) drop-shadow(0 18px 27px #ffd58a40);transition:transform .9s cubic-bezier(.15,.8,.2,1),opacity .7s}
      [data-tier=nova].active .mark{opacity:1;transform:translate(-50%,0) scale(1)}
      .mark-caption{position:absolute;top:calc(25% + clamp(60px,15vw,150px) * 1.5);left:0;right:0;text-align:center;letter-spacing:.3em;font-size:11px;color:#fff0c8;opacity:0;transition:opacity 1.1s}
      [data-tier=nova].active .mark-caption{opacity:.8}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
      @media(max-width:600px){.card{padding:22px 20px 16px}.amount{font-size:38px}[data-tier=nova] .card{top:62%}.mark{top:26%}.mark-caption{top:39%}}
      @media(prefers-reduced-motion:reduce){.card,.mark,.veil,.mark-caption,.stage.leaving{transition:opacity .2s!important}.mark{display:none}.mark-caption{display:none}[data-tier=nova] .card{top:50%}}
    </style><div class="stage" data-tier="spark"><div class="veil"></div><canvas aria-hidden="true"></canvas>
      <div class="mark" aria-hidden="true">GBTI</div><div class="mark-caption" aria-hidden="true">一份支持 · 整个宇宙的回响</div>
      <div class="card"><p class="eyebrow"></p><p class="title"></p><p class="amount"><span>¥</span><b></b></p><p class="caption"></p>
      <div class="controls"><button type="button" class="sound"></button><button type="button" class="dismiss" aria-label="收起收款特效">收起 ×</button></div></div>
      <p class="sr" role="status" aria-live="polite"></p></div>`;
    document.body.appendChild(host); canvas = root.querySelector('canvas'); paint = canvas.getContext('2d');
    root.querySelector('.dismiss').addEventListener('click', () => finish());
    root.querySelector('.sound').addEventListener('click', async () => {
      if (soundOn && audio?.state === 'running') setSound(false);
      else { setSound(true); await unlock(); playSound(); updateSoundButton(); }
    });
    window.addEventListener('resize', resize, {passive:true});
    updateSoundButton();
  }
  function resize() {
    if (!canvas) return;
    width = innerWidth; height = innerHeight;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    paint.setTransform(ratio,0,0,ratio,0,0);
  }
  function star(x,y,r,rotation,color,alpha=1) {
    paint.save(); paint.translate(x,y); paint.rotate(rotation); paint.fillStyle=color; paint.globalAlpha=clamp(alpha);
    paint.beginPath(); for(let j=0;j<8;j++){const a=j*Math.PI/4, radius=j%2?r*.22:r;const px=Math.cos(a)*radius,py=Math.sin(a)*radius;j?paint.lineTo(px,py):paint.moveTo(px,py);} paint.closePath();paint.fill();paint.restore();
  }
  function line(x1,y1,x2,y2,color,alpha,thickness=1) {
    paint.save();paint.strokeStyle=color;paint.globalAlpha=clamp(alpha);paint.lineWidth=thickness;paint.lineCap='round';paint.beginPath();paint.moveTo(x1,y1);paint.lineTo(x2,y2);paint.stroke();paint.restore();
  }
  function ring(x,y,r,color,alpha,thickness=1) {
    paint.save();paint.strokeStyle=color;paint.globalAlpha=clamp(alpha);paint.lineWidth=thickness;paint.beginPath();paint.ellipse(x,y,Math.max(0,r),Math.max(0,r*.48),-.22,0,TAU);paint.stroke();paint.restore();
  }
  function prepare() {
    const tier=current.tier.id, count=tier==='spark'?65:tier==='meteor'?140:220;
    const palette=tier==='spark'?['#9df5db','#ffe7ad','#fff9e7']:tier==='meteor'?['#c5a2ff','#ffa6c7','#94e7ff','#fff1b2']:['#ffe3a8','#8dcaff','#fff5dc','#d5b0ff'];
    particles=Array.from({length:width<500?Math.floor(count*.68):count},(_,i)=>({angle:Math.random()*TAU,radius:Math.random(),delay:Math.random()*.8,speed:.5+Math.random(),size:2+Math.random()*5,spin:Math.random()*TAU,color:palette[i%palette.length],x:Math.random(),y:Math.random()}));
    stars=Array.from({length:tier==='nova'?100:50},(_,i)=>({x:Math.random(),y:Math.random(),size:.5+Math.random()*1.5,phase:i*.7}));
  }
  function drawSpark(t) {
    const originY=height*.5, fade=clamp((3.4-t)/.8);
    particles.forEach(p=>{
      const age=t-p.delay;if(age<0)return;
      const progress=clamp(age/2.5), distance=ease(progress)*(85+p.radius*Math.min(width*.45,300));
      const x=width/2+Math.cos(p.angle)*distance,y=originY+Math.sin(p.angle)*distance*.55-age*28;
      star(x,y,p.size*(1-progress*.5),p.spin+age*.5,p.color,Math.sin(progress*Math.PI)*fade);
    });
    [.15,.45].forEach(delay=>{const age=t-delay;if(age>0)ring(width/2,originY,30+ease(age/1.7)*210,'#aeffe1',clamp(1-age/1.8)*.5,1.2);});
  }
  function drawMeteor(t) {
    const fade=clamp((5.1-t)/.8);
    for(let k=0;k<7;k++){
      const age=t-k*.24;if(age<0||age>1.8)continue;
      const u=age/1.8, x=(-.15+u*1.3)*width, y=(.12+k*.07+u*.25)*height;
      line(x-130,y-65,x,y,k%2?'#ffb8df':'#b3e8ff',Math.sin(u*Math.PI)*.8,2);star(x,y,6,Math.PI/4,'#fff4d1',Math.sin(u*Math.PI));
    }
    particles.forEach(p=>{
      const age=t-.45-p.delay;if(age<0)return;
      const u=clamp(age/3.8),distance=ease(u)*(120+p.radius*Math.min(width*.65,700));
      const x=width/2+Math.cos(p.angle)*distance,y=height*.43+Math.sin(p.angle)*distance*.5+u*u*height*.32;
      paint.save();paint.globalAlpha=clamp((1-u)*1.6)*fade;paint.translate(x,y);paint.rotate(p.spin+age*2);paint.fillStyle=p.color;paint.fillRect(-p.size/2,-p.size,p.size,Math.cos(age*3+p.spin)*p.size*2);paint.restore();
      if(p.radius>.6)star(x,y,p.size*.6,p.spin,p.color,(1-u)*fade);
    });
  }
  function drawNova(t) {
    const cx=width/2,cy=height*.36,fade=clamp((7.2-t)/1.2);
    stars.forEach(p=>star(p.x*width,p.y*height,p.size,0,'#dbe8ff',(.25+.2*Math.sin(t+p.phase))*fade));
    for(let k=0;k<4;k++){
      const age=t-.18-k*.17;if(age<0)continue;
      ring(cx,cy,ease(age/2)*(80+k*90+width*.13),'#efd5a6',clamp(1-age/3.7)*.46,1.5);
    }
    particles.forEach(p=>{
      const age=t-.35-p.delay*.6;if(age<0)return;
      const progress=clamp(age/5.3), distance=(40+ease(progress)*(Math.max(width,height)*(.25+p.radius*.4)));
      const angle=p.angle+progress*.24;
      const x=cx+Math.cos(angle)*distance,y=cy+Math.sin(angle)*distance*.64+progress*progress*100;
      const alpha=clamp(1-progress)*fade;
      line(x-Math.cos(angle)*(8+25*p.radius),y-Math.sin(angle)*(8+25*p.radius)*.64,x,y,p.color,alpha*.6,p.size*.25);
      star(x,y,p.size*(1-progress*.4),p.spin+t*.2,p.color,alpha);
    });
    for(let j=0;j<4;j++){
      const age=t-1.2-j*.45;if(age<0||age>2.2)continue;
      const bx=width*(j%2?.8:.2),by=height*(.23+(j%3)*.16),u=age/2.2;
      for(let i=0;i<16;i++){const angle=i*TAU/16,dist=ease(u)*100;star(bx+Math.cos(angle)*dist,by+Math.sin(angle)*dist+u*u*30,2.5,angle,j%2?'#a1d9ff':'#ffe0a0',(1-u)*fade);}
    }
  }
  function frame(now) {
    if(!current)return;
    const elapsed=now-started,duration=reduced.matches?2200:current.tier.duration;
    paint.clearRect(0,0,width,height);
    if(!reduced.matches){const t=elapsed/1000;current.tier.id==='spark'?drawSpark(t):current.tier.id==='meteor'?drawMeteor(t):drawNova(t);}
    if(elapsed>duration-450)root.querySelector('.stage').classList.add('leaving');
    if(elapsed>=duration){finish();return;}
    raf=requestAnimationFrame(frame);
  }
  function show(event) {
    mount();current=event;resize();prepare();soundPlayed=false;
    const stage=root.querySelector('.stage');stage.className='stage';stage.dataset.tier=event.tier.id;stage.style.setProperty('--accent',event.tier.color);
    root.querySelector('.eyebrow').textContent=event.preview?'EFFECT PREVIEW':'THANK YOU FOR YOUR SUPPORT';
    root.querySelector('.title').textContent=event.preview?event.tier.name+' · 特效预览':event.nickname?'感谢 '+event.nickname+' 的支持':'收到一份匿名支持';
    root.querySelector('.amount b').textContent=core.format(event.amountCents);
    root.querySelector('.caption').textContent=event.preview?'仅试听与预览，不代表实际收款。':event.tier.id==='nova'?'你的支持，让这个小小宇宙继续生长。':event.tier.id==='meteor'?'把这份心意，变成一场流星雨。':'每一份小小心意，都闪闪发光。';
    root.querySelector('.sr').textContent=(event.preview?'预览':event.nickname?'收到 '+event.nickname+' 的支持':'收到匿名支持')+' '+core.format(event.amountCents)+' 元，'+event.tier.name;
    host.hidden=false;void stage.offsetWidth;stage.classList.add('active');started=performance.now();updateSoundButton();playSound();
    raf=requestAnimationFrame(frame);dispatch('start',{id:event.id,amountCents:event.amountCents,tier:event.tier.id,nickname:event.nickname||'',intentId:event.intentId||'',preview:Boolean(event.preview)});
  }
  function finish(continueQueue=true) {
    if(!current)return;
    const previous=current;current=null;cancelAnimationFrame(raf);raf=0;stopSound();host.hidden=true;
    paint.clearRect(0,0,width,height);particles=[];stars=[];
    dispatch('end',{id:previous.id,tier:previous.tier.id});
    if(continueQueue)setTimeout(drain,160);
  }
  function drain() {
    if(current||document.hidden)return;
    while(queue.length){const event=queue.shift();if(Date.now()-event.occurredAt<=120000){show(event);break;}}
  }
  function receive(input) {
    const event=core.normalize(input);if(!event||seen.has(event.id))return false;
    seen.set(event.id,Date.now());while(seen.size>256)seen.delete(seen.keys().next().value);
    try{sessionStorage.setItem('gbti_donation_seen_v1',JSON.stringify([...seen]));}catch(_){}
    if(queue.length>=24)queue.shift();queue.push(event);drain();return true;
  }
  function preview(amount) {
    const amountCents=core.amountToCents(amount),tier=core.tierFor(amountCents);if(!tier)return false;
    unlock().then(()=>{playSound();updateSoundButton();});
    finish(false);show({id:'preview-'+Date.now(),amountCents,tier,occurredAt:Date.now(),preview:true});return true;
  }
  // Compatibility methods intentionally never open a network connection.
  function disconnect() { connection='disabled';dispatch('connection',{state:connection}); }
  function connect() { disconnect();return false; }
  function connectPolling() { disconnect();return false; }
  window.GBTI_DONATIONS=Object.freeze({receive,preview,connect,connectPolling,disconnect,setSound,unlock,
    stop:()=>{queue.length=0;finish(false);},
    state:()=>({active:current?.tier.id||null,queued:queue.length,soundOn,audioState:audio?.state||'locked',connection})});
  window.addEventListener('gbti:receipt',event=>receive(event.detail));
  function unlockFromPage(event) {
    // The overlay sound button handles its own intent. Unlocking in the capture
    // phase would change "enable sound" into "mute" before its click handler.
    if(event.isTrusted && !event.composedPath().includes(host)) unlock().then(()=>{playSound();updateSoundButton();});
  }
  document.addEventListener('pointerdown',unlockFromPage,{capture:true,passive:true});
  document.addEventListener('keydown',event=>{unlockFromPage(event);if(event.key==='Escape')finish();},{capture:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)finish(false);else drain();});
  window.addEventListener('pagehide',()=>{finish(false);disconnect();if(audio)audio.close().catch(()=>{});audio=null;});
})();

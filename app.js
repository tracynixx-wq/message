/*CRYPTO-START*/
const enc=new TextEncoder(),dec=new TextDecoder();
const b64=u=>{u=u instanceof ArrayBuffer?new Uint8Array(u):u;let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s)};
const unb64=s=>{const b=atob(s),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u};
const cat=(a,b)=>{const u=new Uint8Array(a.length+b.length);u.set(a,0);u.set(b,a.length);return u};
const EC={name:'ECDH',namedCurve:'P-256'};
const CR={
 async genIdentity(){const kp=await crypto.subtle.generateKey(EC,true,['deriveBits']);
  return{priv:kp.privateKey,pub:b64(await crypto.subtle.exportKey('raw',kp.publicKey)),jwk:await crypto.subtle.exportKey('jwk',kp.privateKey)}},
 importPriv:jwk=>crypto.subtle.importKey('jwk',jwk,EC,false,['deriveBits']),
 async pbk(pass,salt,iterations=600000){const k=await crypto.subtle.importKey('raw',enc.encode(pass),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'},k,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])},
 async backup(jwk,pass){const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},await CR.pbk(pass,salt),enc.encode(JSON.stringify(jwk)));
  return{v:2,salt:b64(salt),iv:b64(iv),ct:b64(ct)}},
 async restore(bk,pass){const iterations=bk.v>=2?600000:300000;const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(bk.iv)},await CR.pbk(pass,unb64(bk.salt),iterations),unb64(bk.ct));return JSON.parse(dec.decode(pt))},
 async shared(priv,theirPub,info){const pub=await crypto.subtle.importKey('raw',unb64(theirPub),EC,false,[]);
  const bits=await crypto.subtle.deriveBits({name:'ECDH',public:pub},priv,256);
  const hk=await crypto.subtle.importKey('raw',bits,'HKDF',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:new Uint8Array(32),info:enc.encode('wrap:'+info)},hk,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])},
 newKey:()=>crypto.subtle.importKey('raw',crypto.getRandomValues(new Uint8Array(32)),'AES-GCM',true,['encrypt','decrypt']),
 async wrap(priv,theirPub,K,conv){const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const pub=await crypto.subtle.importKey('raw',unb64(theirPub),EC,false,[]),bits=await crypto.subtle.deriveBits({name:'ECDH',public:pub},priv,256);
  const hk=await crypto.subtle.importKey('raw',bits,'HKDF',false,['deriveKey']);
  const aes=await crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt,info:enc.encode('message/e2ee/key-wrap/v2:'+conv)},hk,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  const raw=new Uint8Array(await crypto.subtle.exportKey('raw',K)),aad=enc.encode('message/e2ee/key-wrap/aad/v2:'+conv);
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},aes,raw);
  return 'v2.'+b64(cat(cat(salt,iv),new Uint8Array(ct)))},
 async unwrap(priv,theirPub,w,conv){let aes,u,iv,ct,aad;
  if(typeof w==='string'&&w.startsWith('v2.')){u=unb64(w.slice(3));const salt=u.slice(0,16);iv=u.slice(16,28);ct=u.slice(28);
   const pub=await crypto.subtle.importKey('raw',unb64(theirPub),EC,false,[]),bits=await crypto.subtle.deriveBits({name:'ECDH',public:pub},priv,256);
   const hk=await crypto.subtle.importKey('raw',bits,'HKDF',false,['deriveKey']);
   aes=await crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt,info:enc.encode('message/e2ee/key-wrap/v2:'+conv)},hk,{name:'AES-GCM',length:256},false,['decrypt']);
   aad=enc.encode('message/e2ee/key-wrap/aad/v2:'+conv);
  }else{aes=await CR.shared(priv,theirPub,conv);u=unb64(w);iv=u.slice(0,12);ct=u.slice(12)}
  const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv,...(aad?{additionalData:aad}:{})},aes,ct);
  return crypto.subtle.importKey('raw',raw,'AES-GCM',true,['encrypt','decrypt'])},
 async sealB(K,conv,bytes){const iv=crypto.getRandomValues(new Uint8Array(12)),magic=new Uint8Array([0x50,0x42,0x02]);
  const aad=enc.encode('message/e2ee/payload/aad/v2:'+conv),ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},K,bytes));
  return cat(cat(magic,iv),ct)},
 async openB(K,conv,u){const v2=u.length>3&&u[0]===0x50&&u[1]===0x42&&u[2]===0x02,off=v2?3:0,iv=u.slice(off,off+12),ct=u.slice(off+12);
  const aad=v2?enc.encode('message/e2ee/payload/aad/v2:'+conv):enc.encode(conv);
  return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad},K,ct))},
 async seal(K,conv,obj){return b64(await CR.sealB(K,conv,enc.encode(JSON.stringify(obj))))},
 async open(K,conv,s){return JSON.parse(dec.decode(await CR.openB(K,conv,unb64(s))))}
};
/*CRYPTO-END*/

const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function creatorBadge(p){return p&&p.id&&window.CFG&&CFG.creator&&p.id===CFG.creator?'<span class="creator-badge" title="Создатель PinBox · подтверждённый профиль" aria-label="Создатель PinBox"><svg viewBox="0 0 20 20" aria-hidden="true"><path class="seal" d="M10.00 0.00 L10.64 0.17 L11.23 0.63 L11.74 1.27 L12.16 1.93 L12.55 2.47 L12.98 2.79 L13.52 2.87 L14.17 2.77 L14.94 2.60 L15.75 2.50 L16.50 2.59 L17.07 2.93 L17.41 3.50 L17.50 4.25 L17.40 5.06 L17.23 5.82 L17.13 6.48 L17.21 7.02 L17.53 7.45 L18.07 7.84 L18.73 8.26 L19.37 8.77 L19.83 9.36 L20.00 10.00 L19.83 10.64 L19.37 11.23 L18.73 11.74 L18.07 12.16 L17.53 12.55 L17.21 12.98 L17.13 13.52 L17.23 14.17 L17.40 14.94 L17.50 15.75 L17.41 16.50 L17.07 17.07 L16.50 17.41 L15.75 17.50 L14.94 17.40 L14.17 17.23 L13.52 17.13 L12.98 17.21 L12.55 17.53 L12.16 18.07 L11.74 18.73 L11.23 19.37 L10.64 19.83 L10.00 20.00 L9.36 19.83 L8.77 19.37 L8.26 18.73 L7.84 18.07 L7.45 17.53 L7.02 17.21 L6.48 17.13 L5.83 17.23 L5.06 17.40 L4.25 17.50 L3.50 17.41 L2.93 17.07 L2.59 16.50 L2.50 15.75 L2.60 14.94 L2.77 14.18 L2.87 13.52 L2.79 12.98 L2.47 12.55 L1.93 12.16 L1.27 11.74 L0.63 11.23 L0.17 10.64 L0.00 10.00 L0.17 9.36 L0.63 8.77 L1.27 8.26 L1.93 7.84 L2.47 7.45 L2.79 7.02 L2.87 6.48 L2.77 5.82 L2.60 5.06 L2.50 4.25 L2.59 3.50 L2.93 2.93 L3.50 2.59 L4.25 2.50 L5.06 2.60 L5.82 2.77 L6.48 2.87 L7.02 2.79 L7.45 2.47 L7.84 1.93 L8.26 1.27 L8.77 0.63 L9.36 0.17Z"/><path class="tick" d="M6 10.3l2.8 2.8L14.2 7.4"/></svg></span>':''}
function displayName(p,name){return esc(name??p?.name??'')+creatorBadge(p)}

const COL=['#4a7ec2','#569c3a','#b8763a','#ae5148','#8654c8','#56a1ad','#a84d7e','#7d8896'];
const ACC=['','#3e88f7','#34a853','#e8710a','#e5483c','#8e55d9','#13a3b8','#d6407f'];
const GR=[['#4a7ec2'],['#569c3a'],['#b8763a'],['#ae5148'],['#8654c8'],['#56a1ad'],['#a84d7e'],['#7d8896'],['#8fd3f2','#5f8dd0'],['#b5d86b','#4f9a62'],['#e8b45a','#c27a50'],['#f09a70','#c0555c'],['#df83e3','#8d62d0'],['#98e0c8','#4e95c5'],['#e891a0','#b84f82'],['#b4bcc8','#6c7685']];
const CV=[['#667eea','#764ba2'],['#f093fb','#f5576c'],['#4facfe','#00c6d7'],['#43e97b','#1fb89a'],['#fa709a','#f7b733'],['#30cfd0','#4b3a8f'],['#a18cd1','#e8a0c8'],['#2c3e50','#4b5563']];
const WALLS={none:['var(--bg)','var(--bg)'],mist:['linear-gradient(180deg,#eef2f7,#dfe7f1)','linear-gradient(180deg,#0d1118,#111b2b)'],mint:['linear-gradient(180deg,#eef6f1,#dcece2)','linear-gradient(180deg,#0b1412,#0f2219)'],dusk:['linear-gradient(180deg,#f2eff8,#e5dff2)','linear-gradient(180deg,#120e1a,#1d1530)'],sand:['linear-gradient(180deg,#f6f3ec,#ebe5d6)','linear-gradient(180deg,#15120d,#241d12)'],rose:['linear-gradient(180deg,#fbeff2,#f3dbe3)','linear-gradient(180deg,#1a0e12,#2b1319)']};
const OUTC=['','#3e88f7','#34a853','#e8710a','#e5483c','#8e55d9','#13a3b8','#d6407f','#4a4e57'],INC=['','#e9ecf1','#fff1d6','#e3f6e8','#fde4ec','#2a2d35','#1d3b2f'];
const okStore=u=>{if(typeof u!=='string'||!u.trim())return false;try{const x=new URL(u,location.href);return x.protocol==='blob:'||(x.origin===new URL(CFG.url).origin&&x.pathname.startsWith('/storage/v1/object/public/'))}catch(_){return false}};
const okUrl=u=>{if(typeof u!=='string'||!u.trim())return false;try{const x=new URL(u,location.href);return ['https:','http:','blob:'].includes(x.protocol)}catch(_){return false}};
const pc=c=>String(c||'').split(',').map(x=>x.trim()).filter(x=>/^#[0-9a-f]{6}$/i.test(x));
const grad=(id,c)=>{let a=pc(c);if(!a.length)a=[COL[Math.abs(hash(id))%COL.length]];if(a.length<2)a=[a[0],a[0]];return`linear-gradient(135deg,${a[0]},${a[1]})`};
const lum=h=>{const n=parseInt(h.slice(1),16);return(.299*(n>>16)+.587*((n>>8)&255)+.114*(n&255))/255};
function cover(p){
 const raw=p?.theme;let t=raw&&typeof raw==='object'?raw:{};
 if(typeof raw==='string'){try{t=JSON.parse(raw)||{}}catch(_){t={}}}
 const image=t.covUrl||t.coverUrl||p?.cover_url||'';
 if(okStore(image))return `url('${encodeURI(String(image)).replace(/'/g,'%27')}') center center / cover no-repeat`;
 const g=CV[t.cov];if(g)return`linear-gradient(150deg,${g[0]},${g[1]})`;
 const a=pc(p?.color),x=a[0]||COL[Math.abs(hash(p?.id||''))%COL.length];return`linear-gradient(150deg,${x},${a[1]||x})`;
}
function cardHtml(p,st){p=p||{};return`<div class="pcard"><div class="pcov" style="background:${cover(p)}"></div><div class="pav">${av(p,92)}</div><h3>${displayName(p)} ${esc(p.status_emoji||'')}</h3><div class="msg unm" data-un="${esc(p.username||'')}">@${esc(p.username||'')}${st?' · '+st:''}</div>${p.bio?`<div class="pbio">${esc(p.bio)}</div>`:''}</div>`}
function scaleImg(f,n=1280){return new Promise((res,rej)=>{const i=new Image(),u=URL.createObjectURL(f);let done=false;const finish=(fn,v)=>{if(done)return;done=true;URL.revokeObjectURL(u);fn(v)};i.onload=()=>{try{if(!i.naturalWidth||!i.naturalHeight)throw new Error('Некорректное изображение');const k=Math.min(1,n/Math.max(i.naturalWidth,i.naturalHeight)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(i.naturalWidth*k));c.height=Math.max(1,Math.round(i.naturalHeight*k));const x=c.getContext('2d');if(!x)throw new Error('Canvas недоступен');x.drawImage(i,0,0,c.width,c.height);c.toBlob(b=>b?finish(res,b):finish(rej,new Error('Не удалось обработать изображение')),'image/jpeg',.88)}catch(e){finish(rej,e)}};i.onerror=()=>finish(rej,new Error('Формат изображения не поддерживается браузером'));i.src=u})}
const EM=['👍','❤️','😂','😮','😢','🔥'];
const BLOB={};
let sb,me=null,prof=null,ID=null,P={},C={},K={},M={},cur=null,reply=null,editing=null,booted=false,authMode='in';

/* ---------- утилиты ---------- */
function toast(t,ms=2800){const e=$('#toast');e.textContent=t;e.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>e.hidden=true,ms)}
const hm=d=>new Date(d).toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'});
const sameDay=(a,b)=>new Date(a).toDateString()===new Date(b).toDateString();
const tm=d=>sameDay(d,Date.now())?hm(d):new Date(d).toLocaleDateString('ru',{day:'numeric',month:'short'});
const hash=s=>[...String(s)].reduce((a,c)=>(a*31+c.charCodeAt(0))|0,7);
const colorOf=(id,c)=>c&&/^#[0-9a-f]{6}$/i.test(c)?c:COL[Math.abs(hash(id))%COL.length];
function av(o,s=40){if(!o)return`<div class="av" style="width:${s}px;height:${s}px;background:#9ca3af"></div>`;
 if(okStore(o.avatar_url))return`<img class="av" style="width:${s}px;height:${s}px" src="${esc(o.avatar_url)}" alt="">`;
 return`<div class="av" style="width:${s}px;height:${s}px;background:${grad(o.id,o.color)};font-size:${s*.42}px">${esc(((o.name||o.title||o.username||'?').trim()[0]||'?').toUpperCase())}</div>`}
function applyTheme(t){t={mode:'auto',accent:'',out:'',inb:'',shape:'r',wall:'none',wallUrl:'',list:'plain',...(t||{})};
 const dark=t.mode==='dark'||(t.mode==='auto'&&matchMedia('(prefers-color-scheme:dark)').matches),hx=/^#[0-9a-f]{6}$/i,r=document.documentElement;
 const nt=dark?'dark':'light';if(r.dataset.t&&r.dataset.t!==nt){r.classList.add('tt');clearTimeout(applyTheme.tt);applyTheme.tt=setTimeout(()=>r.classList.remove('tt'),420)}
 r.dataset.t=nt;if(t.accent==='#3e88f7')t.accent='';const mono=!hx.test(t.accent);r.style.setProperty('--accent',mono?(dark?'#f2f2f4':'#151515'):t.accent);r.style.setProperty('--onacc',mono?(dark?'#090a0c':'#fff'):(lum(t.accent)>.62?'#151515':'#fff'));
 r.style.setProperty('--outtx',hx.test(t.out)?(lum(t.out)>.62?'#151515':'#fff'):'var(--onacc)');
 r.style.setProperty('--out',hx.test(t.out)?t.out:'var(--accent)');
 if(hx.test(t.inb)){r.style.setProperty('--in',t.inb);r.style.setProperty('--intx',lum(t.inb)>.6?'#14161a':'#fff')}else{r.style.removeProperty('--in');r.style.removeProperty('--intx')}
 r.style.setProperty('--br',{r:'18px',m:'12px',s:'5px'}[t.shape]||'18px');
 r.style.setProperty('--wall',t.wall==='custom'&&okStore(t.wallUrl)?`url("${t.wallUrl}") center/cover`:(WALLS[t.wall]||WALLS.none)[dark?1:0]);
 document.body.dataset.list=t.list;
 document.querySelector('meta[name=theme-color]').content=dark?'#090a0c':'#f6f6f7';
 try{localStorage.setItem('th',JSON.stringify(t))}catch(e){}return t}
try{applyTheme(JSON.parse(localStorage.getItem('th')))}catch(e){applyTheme()}
let SHOWN=null;
function show(id){const prev=SHOWN;SHOWN=id;['load','auth','keys','home','chat'].forEach(k=>$('#'+k).hidden=k!==id);
 if(prev&&prev!==id&&(id==='chat'||(id==='home'&&prev==='chat'))){const el=$('#'+id);el.classList.remove('slR','slL');void el.offsetWidth;el.classList.add(id==='chat'?'slR':'slL');setTimeout(()=>el.classList.remove('slR','slL'),350)}}
function releaseSheetMedia(){const s=$('#sheet');s.querySelectorAll('img[src^="blob:"],video[src^="blob:"],audio[src^="blob:"]').forEach(e=>{try{URL.revokeObjectURL(e.src)}catch(_){}});s.querySelectorAll('[data-preview-url]').forEach(e=>{try{URL.revokeObjectURL(e.dataset.previewUrl)}catch(_){};delete e.dataset.previewUrl})}
function sheet(html,mount){const s=$('#sheet');releaseSheetMedia();s.innerHTML=`<div class="sh">${html}</div>`;s.hidden=false;
 s.onclick=e=>{if(e.target===s)closeSheet()};if(mount)mount(s.firstChild);return s.firstChild}
function closeSheet(){releaseSheetMedia();$('#sheet').hidden=true;$('#sheet').innerHTML=''}
const idb=(()=>{let d;const open=()=>d||(d=new Promise((res,rej)=>{const r=indexedDB.open('chat2',1);r.onupgradeneeded=()=>r.result.createObjectStore('k');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}));
 const tx=async(m,f)=>{const db=await open();return new Promise((res,rej)=>{const t=db.transaction('k',m),q=f(t.objectStore('k'));t.oncomplete=()=>res(q.result);t.onerror=()=>rej(t.error)})};
 return{get:k=>tx('readonly',s=>s.get(k)),set:(k,v)=>tx('readwrite',s=>s.put(v,k))}})();

/* ---------- вход ---------- */
function authUI(){const up=authMode==='up';$('#go').textContent=up?'Создать аккаунт':'Войти';$('#swm').textContent=up?'Уже есть аккаунт? Войти':'Создать аккаунт';$('#pw').autocomplete=up?'new-password':'current-password';$('#msg').textContent=''}
$('#swm').onclick=()=>{authMode=authMode==='in'?'up':'in';authUI()};
$('#go').onclick=async()=>{const email=$('#em').value.trim(),password=$('#pw').value;
 if(!email||password.length<6){$('#msg').textContent='Введите почту и пароль от 6 символов';return}
 $('#go').disabled=true;$('#msg').textContent='…';
 try{
  const r=authMode==='up'?await sb.auth.signUp({email,password}):await sb.auth.signInWithPassword({email,password});
  if(r.error){$('#msg').textContent=/Invalid login/i.test(r.error.message)?'Неверная почта или пароль':r.error.message;return}
  if(!r.data.session){$('#msg').textContent='Подтвердите почту по письму, затем войдите';authMode='in';authUI();return}
  await start(r.data.session)
 }catch(e){$('#msg').textContent='Ошибка соединения. Проверьте интернет и попробуйте снова.'}
 finally{$('#go').disabled=false}};
$('#pw').onkeydown=e=>{if(e.key==='Enter')$('#go').click()};

async function boot(){
 if(!window.CFG||!window.supabase){$('#load').innerHTML='<div class="box"><p>Не удалось загрузить приложение. Проверьте интернет и config.js</p></div>';show('load');return}
 try{
  sb=supabase.createClient(CFG.url,CFG.key);
  sb.auth.onAuthStateChange((ev)=>{if(ev==='SIGNED_OUT')location.reload()});
  const {data,error}=await sb.auth.getSession();if(error)throw error;
  if(data.session)await start(data.session);else{authUI();show('auth')}
  if(/iphone|ipad/i.test(navigator.userAgent)&&!navigator.standalone)$('#hint').textContent='Чтобы получать уведомления: «Поделиться» → «На экран Домой»'
 }catch(e){$('#load').innerHTML='<div class="box"><p>Не удалось подключиться. Проверьте интернет.</p><button class="btn" id="retryBoot">Повторить</button></div>';show('load');$('#retryBoot').onclick=()=>boot()}
}
function showStartError(e){$('#load').innerHTML='<div class="box"><p>Не удалось открыть аккаунт: '+esc(e?.message||'ошибка соединения')+'</p><button class="btn" id="retryStart">Повторить</button></div>';show('load');$('#retryStart').onclick=()=>{me=null;start(window.__lastSession).catch(showStartError)}}
let BK0=null;
async function start(s){if(me)return;window.__lastSession=s;me=s.user;if(!window.__shell)show('load');
 try{
  const [pr,bk0]=await Promise.all([sb.from('profiles').select('*').eq('id',me.id).maybeSingle(),sb.from('keybackup').select('data').eq('user_id',me.id).maybeSingle()]);BK0=bk0;
  if(pr.error)throw pr.error;
  prof=pr.data;
  if(!await ensureKeys())throw new Error('Не удалось проверить ключи аккаунта');
  if(!prof||!prof.name||!prof.username){show('home');await editor(true)}
  await enter()
 }catch(e){me=null;showStartError(e)}
}

/* ---------- ключи ---------- */
function askPhrase(create,err){return new Promise(res=>{
 $('#kt').textContent=create?'Ключевая фраза':'Введите ключевую фразу';
 $('#kd').textContent=create?'Создайте длинную уникальную фразу минимум из 16 символов. Она защищает резервную копию ключа. Запишите её: без неё восстановить чаты нельзя.':'Нужна, чтобы расшифровать ваши чаты на этом устройстве.';
 $('#kp').value='';$('#kp2').value='';$('#kp2').hidden=!create;$('#kmsg').textContent=err||'';show('keys');
 const go=()=>{const a=$('#kp').value;if(a.length<(create?16:6)){$('#kmsg').textContent=create?'Минимум 16 символов':'Минимум 6 символов';return}
  if(create&&a!==$('#kp2').value){$('#kmsg').textContent='Фразы не совпадают';return}res(a)};
 $('#kgo').onclick=go;$('#kp').onkeydown=$('#kp2').onkeydown=e=>{if(e.key==='Enter')go()}})}
async function ensureKeys(){
 try{ID=await idb.get('id:'+me.id)}catch(e){ID=null}
 const bk=BK0||await sb.from('keybackup').select('data').eq('user_id',me.id).maybeSingle();BK0=null;
 if(bk.error){toast(bk.error.message);return false}
 if(ID&&bk.data&&bk.data.data?.pub&&ID.pub!==bk.data.data.pub){ID=null;await idb.set('id:'+me.id,null)}
 if(ID){}
 else if(bk.data){let err='';
  for(;;){const ph=await askPhrase(false,err);try{const jwk=await CR.restore(bk.data.data,ph);const priv=await CR.importPriv(jwk);
   ID={priv,pub:bk.data.data.pub};await idb.set('id:'+me.id,ID);break}catch(e){err='Неверная фраза'}}}
 else{const ph=await askPhrase(true);show('load');
  const g=await CR.genIdentity(),b=await CR.backup(g.jwk,ph);b.pub=g.pub;
  const r=await sb.from('keybackup').upsert({user_id:me.id,data:b});if(r.error){toast(r.error.message);return false}
  ID={priv:await CR.importPriv(g.jwk),pub:g.pub};await idb.set('id:'+me.id,ID)}
 if(!prof||prof.pubkey!==ID.pub){const r=await sb.from('profiles').upsert({id:me.id,pubkey:ID.pub}).select().single();
  if(r.error){toast(r.error.message);return false}prof={...(prof||{}),...r.data}}
 return true}

/* ---------- загрузка данных ---------- */
/* Serialize realtime/foreground refreshes to prevent overlapping loads from overwriting newer state. */
let loadPromise=null,loadAgain=false;
async function loadAll(){
 if(loadPromise){loadAgain=true;return loadPromise}
 loadPromise=(async()=>{do{loadAgain=false;await loadAllImpl()}while(loadAgain)})();
 try{return await loadPromise}finally{loadPromise=null}
}

const peerId=c=>(c.members.find(x=>x.user_id!==me.id)||{}).user_id;
const peerOf=c=>P[peerId(c)];
const title=c=>c.kind==='dm'?(peerOf(c)?.name||'…'):(c.title||'Без названия');
const isAdmin=c=>c.my&&(c.my.role==='owner'||c.my.role==='admin');
const canPost=c=>c.kind!=='channel'||isAdmin(c);
async function unwrap(c){if(K[c.id]||!c.my)return;const by=P[c.my.wrapped_by];if(!by?.pubkey)return;
 try{K[c.id]=await CR.unwrap(ID.priv,by.pubkey,c.my.wrapped_key,c.id)}catch(e){}}
async function dc(m){const k=K[m.conv_id];m.p=null;if(!k){m.p={t:'🔒 Нет ключа'};return}
 try{m.p=await CR.open(k,m.conv_id,m.data)}catch(e){m.p={t:'🔒 Не удалось расшифровать'}}}
async function loadAllImpl(){
 const mr=await sb.from('members').select('*').eq('user_id',me.id);
 if(mr.error){toast('Не удалось загрузить список чатов: '+mr.error.message);return}
 const ids=(mr.data||[]).map(x=>x.conv_id);
 if(!ids.length){C={};M={};K={};cur=null;SEL=null;if(SHOWN==='chat')show('home');home();return}
 const [cv,mm]=await Promise.all([sb.from('convs').select('*').in('id',ids),sb.from('members').select('*').in('conv_id',ids)]);
 if(cv.error||mm.error){toast('Не удалось загрузить данные чатов: '+(cv.error||mm.error).message);return}
 const uids=[...new Set((mm.data||[]).flatMap(x=>[x.user_id,x.wrapped_by]))];
 const pr=await sb.from('profiles').select('*').in('id',uids);if(pr.error){toast('Не удалось загрузить профили участников: '+pr.error.message);return}(pr.data||[]).forEach(p=>P[p.id]=p);P[me.id]=prof;
 const nc={};(cv.data||[]).forEach(c=>nc[c.id]={...c,members:[],my:null});
 (mm.data||[]).forEach(x=>{const c=nc[x.conv_id];if(!c)return;c.members.push(x);if(x.user_id===me.id)c.my=x});
 C=nc;for(const id of Object.keys(K))if(!nc[id])delete K[id];if(cur&&!nc[cur]){cur=null;if(SHOWN==='chat')show('home')}if(!cur)home();
 await Promise.all(Object.values(C).map(unwrap));
 // Load each conversation independently so a busy chat cannot hide history from other chats.
 const lists=[];
 for(let i=0;i<ids.length;i+=8){
  const part=await Promise.all(ids.slice(i,i+8).map(id=>sb.from('msgs').select('*').eq('conv_id',id).order('id',{ascending:false}).limit(600)));
  const failed=part.find(x=>x.error);if(failed){toast('Не удалось загрузить сообщения: '+failed.error.message);return}
  lists.push(...part.map(x=>(x.data||[]).reverse()));
 }
 const list=lists.flat();
 for(let i=0;i<list.length;i+=60)await Promise.all(list.slice(i,i+60).map(dc));
 const nm={};for(const m of list)(nm[m.conv_id]=nm[m.conv_id]||[]).push(m);M=nm;
 if(cur&&!C[cur])cur=null;
 if(cur){render();head();markRead()}else home()}
async function enter(){applyTheme(prof.theme);P[me.id]=prof;show('home');await loadAll();
 const q=new URLSearchParams(location.search).get('c');if(q&&C[q])openChat(q);
 realtime();presence();pushSync();
 if(navigator.serviceWorker&&!window.__swMessageBound){window.__swMessageBound=true;navigator.serviceWorker.addEventListener('message',e=>{const id=e.data?.open;if(typeof id!=='string'||!id)return;(async()=>{if(!C[id])await loadAll();if(C[id])openChat(id);else toast('Этот чат больше недоступен')})().catch(err=>console.warn('[notification] open failed',err))})}}
function realtime(){
 sb.channel('room')
 .on('postgres_changes',{event:'*',schema:'public',table:'msgs'},onMsg)
 .on('postgres_changes',{event:'*',schema:'public',table:'members'},onMem)
 .on('postgres_changes',{event:'*',schema:'public',table:'convs'},p=>{if(p.eventType==='UPDATE'&&C[p.new.id]){Object.assign(C[p.new.id],p.new);cur?head():home()}else if(p.eventType==='INSERT')loadAll()})
 .on('postgres_changes',{event:'UPDATE',schema:'public',table:'profiles'},p=>{if(P[p.new.id]){P[p.new.id]=p.new;cur?head():home()}})
 .subscribe();callInit()}
async function onMsg(p){const n=p.new;
 if(p.eventType==='DELETE'){for(const k in M)M[k]=M[k].filter(x=>x.id!==p.old.id)}
 else{if(!n)return;if(!C[n.conv_id]){await loadAll();return}await dc(n);const a=M[n.conv_id]=M[n.conv_id]||[],i=a.findIndex(x=>x.id===n.id);if(i>-1)a[i]=n;else a.push(n)}
 if(cur){render(p.eventType==='INSERT'&&n?.conv_id===cur);markRead()}else home()}
function onMem(p){const x=p.new,o=p.old;
 if(p.eventType==='INSERT'){if(x.user_id===me.id||!C[x.conv_id])loadAll();else loadAll();return}
 if(p.eventType==='DELETE'){if(o.user_id===me.id){delete C[o.conv_id];delete K[o.conv_id];delete M[o.conv_id];if(cur===o.conv_id){cur=null;show('home')}home()}else loadAll();return}
 const c=C[x.conv_id];if(!c)return;const i=c.members.findIndex(m=>m.user_id===x.user_id);if(i>-1)c.members[i]=x;if(x.user_id===me.id)c.my=x;if(cur===x.conv_id)render()}
function presence(){
 const ping=(force)=>{if(force===true||!document.hidden)sb.from('profiles').update({last_seen:new Date().toISOString()}).eq('id',me.id).then(()=>{})};
 const peers=async()=>{if(document.hidden)return;const ids=Object.keys(P).filter(i=>i!==me.id);if(!ids.length)return;
  const r=await sb.from('profiles').select('*').in('id',ids);(r.data||[]).forEach(q=>P[q.id]=q);cur?head():home()};
 ping();setInterval(()=>{ping();peers()},20000);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)ping(true);else{ping();loadAll()}});addEventListener('pagehide',()=>ping(true));addEventListener('focus',()=>ping())}

/* ---------- список чатов ---------- */
const lastOf=c=>{const a=M[c.id]||[];return a[a.length-1]};
function preview(m){const p=m.p||{};return p.k==='img'?'📷 Фото':p.k==='vid'?'🎞 Видео':p.k==='aud'?'🎤 Голосовое':p.k==='file'?'📎 '+(p.n||'Файл'):(p.t||'')}
const unread=c=>(M[c.id]||[]).filter(m=>m.sender!==me.id&&c.my&&m.created_at>c.my.last_read_at).length;
let showArch=false;
let TAB='chats',FILT='all';
const folders=()=>Array.isArray(prof?.theme?.folders)?prof.theme.folders:[];
async function saveFolders(fs){prof.theme={...(prof.theme||{}),folders:fs};P[me.id]=prof;try{localStorage.setItem('th',JSON.stringify(prof.theme))}catch(_){}
 const r=await sb.from('profiles').update({theme:prof.theme}).eq('id',me.id);if(r.error)toast('Не удалось сохранить папки: '+r.error.message);home()}
function passF({c,u}){if(FILT==='all')return true;if(FILT==='unread')return u>0;if(FILT==='dm'||FILT==='group'||FILT==='channel')return c.kind===FILT;
 if(FILT.startsWith('f:')){const f=folders().find(x=>x.id===FILT.slice(2));return !!f&&f.ids.includes(c.id)}return true}
function chipsHtml(){const un=Object.values(C).filter(c=>!c.my?.archived&&unread(c)>0).length;
 const base=[['all','Все'],['unread','Непрочитанные'+(un?' '+un:'')],['dm','Личные'],['group','Группы'],['channel','Каналы']];
 return base.map(([k,n])=>`<button data-fl="${k}" class="${FILT===k?'on':''}">${n}</button>`).join('')+folders().map(f=>`<button data-fl="f:${f.id}" class="${FILT==='f:'+f.id?'on':''}">🗂 ${esc(f.name)}</button>`).join('')+'<button data-newf="1" aria-label="Новая папка">＋</button>'}
function newFolder(then){const n=(prompt('Название папки')||'').trim().slice(0,20);if(!n)return;const f={id:Math.random().toString(36).slice(2,8),name:n,ids:[]};saveFolders([...folders(),f]).then(()=>then&&then(f))}
function folderMenu(f){sheet(`<h3>🗂 ${esc(f.name)}</h3><div class="srow" data-a="ren">✏️ Переименовать</div><div class="srow" data-a="del" style="color:var(--danger)">🗑 Удалить папку (чаты останутся)</div>`,sh=>sh.onclick=async e=>{const a=e.target.closest('[data-a]')?.dataset.a;if(!a)return;closeSheet();
 if(a==='ren'){const n=(prompt('Новое название',f.name)||'').trim().slice(0,20);if(n)await saveFolders(folders().map(x=>x.id===f.id?{...x,name:n}:x))}
 if(a==='del'){if(FILT==='f:'+f.id)FILT='all';await saveFolders(folders().filter(x=>x.id!==f.id))}})}
function chatFolders(c){const fs=folders();sheet(`<h3>В папку</h3>${fs.map(f=>`<div class="srow" data-id="${f.id}">${f.ids.includes(c.id)?'✅':'⬜️'} ${esc(f.name)}</div>`).join('')||'<div class="msg">Папок пока нет</div>'}<div class="srow" data-new="1">＋ Новая папка</div>`,sh=>sh.onclick=async e=>{
 const id=e.target.closest('[data-id]')?.dataset.id;if(id){closeSheet();await saveFolders(folders().map(f=>f.id!==id?f:{...f,ids:f.ids.includes(c.id)?f.ids.filter(x=>x!==c.id):[...f.ids,c.id]}));return}
 if(e.target.closest('[data-new]')){closeSheet();newFolder(f=>saveFolders(folders().map(x=>x.id===f.id?{...x,ids:[c.id]}:x)))}})}
const CH=$('#chips');let chT=null,chLP=0;
CH.onclick=e=>{if(Date.now()-chLP<700)return;if(e.target.closest('[data-newf]')){newFolder();return}const b=e.target.closest('[data-fl]');if(b){FILT=b.dataset.fl;home()}};
CH.addEventListener('pointerdown',e=>{const b=e.target.closest('[data-fl^="f:"]');if(!b)return;chT=setTimeout(()=>{chT=null;chLP=Date.now();navigator.vibrate?.(12);const f=folders().find(x=>x.id===b.dataset.fl.slice(2));if(f)folderMenu(f)},450)});
['pointerup','pointercancel','pointerleave','pointermove'].forEach(t=>CH.addEventListener(t,()=>{clearTimeout(chT);chT=null}));

/* ---------- истории ---------- */
let ST={},SV=new Set(),STERR='',STLOADED=false,stCleaned=false;
const SBG=[['#2b2d33','#0b0c0e'],['#4b6cb7','#182848'],['#c33764','#1d2671'],['#11998e','#38ef7d'],['#f12711','#f5af19'],['#7f00ff','#e100ff']];
const stPath=x=>/^[0-9a-f-]{36}\/story-[\w.-]+$/.test(x||'')?sb.storage.from('avatars').getPublicUrl(x).data.publicUrl:'';
const ago=d=>{const m=Math.max(0,Math.round((Date.now()-new Date(d))/60000));return m<1?'только что':m<60?m+' мин назад':Math.floor(m/60)+' ч назад'};
async function loadStories(){
 const r=await sb.from('stories').select('*').gt('expires_at',new Date().toISOString()).order('created_at',{ascending:true});
 if(r.error){STERR=/stories|relation|does not exist|schema/i.test(r.error.message)?'Выполните stories.sql в Supabase (SQL Editor)':r.error.message;STLOADED=true;if(TAB==='stories')home();return}
 STERR='';ST={};(r.data||[]).forEach(x=>(ST[x.user_id]=ST[x.user_id]||[]).push(x));
 const need=Object.keys(ST).filter(u=>!P[u]);if(need.length){const q=await sb.from('profiles').select('*').in('id',need);(q.data||[]).forEach(x=>P[x.id]=x)}
 const v=await sb.from('story_views').select('story_id').eq('viewer_id',me.id);SV=new Set((v.data||[]).map(x=>x.story_id));STLOADED=true;if(TAB==='stories'&&SHOWN==='home')home();
 if(!stCleaned){stCleaned=true;const old=await sb.from('stories').select('id,path').eq('user_id',me.id).lt('expires_at',new Date().toISOString());
  if(old.data&&old.data.length){const ps=old.data.map(x=>x.path).filter(Boolean);if(ps.length)sb.storage.from('avatars').remove(ps).then(()=>{});sb.from('stories').delete().in('id',old.data.map(x=>x.id)).then(()=>{})}}}
setInterval(()=>{if(me&&TAB==='stories'&&SHOWN==='home'&&!document.hidden)loadStories()},60000);
function storiesList(){
 const mine=ST[me.id]||[];
 let h=`<div class="crow" data-sadd="1"><div class="avw ${mine.length?'sr seen':''}">${av(prof,56)}<i class="plus">+</i></div><div class="ci"><b>Моя история</b><small>${mine.length?mine.length+' · '+ago(mine[mine.length-1].created_at):'Добавить историю на 24 часа'}</small></div>${mine.length?'<button class="sbtn" data-sopen="'+me.id+'">Смотреть</button>':''}</div>`;
 const ids=Object.keys(ST).filter(u=>u!==me.id).sort((a,b)=>{const ua=ST[a].some(x=>!SV.has(x.id)),ub=ST[b].some(x=>!SV.has(x.id));return (ub-ua)||(new Date(ST[b].at(-1).created_at)-new Date(ST[a].at(-1).created_at))});
 if(STERR)h+=`<div class="empty">${esc(STERR)}</div>`;
 else if(!STLOADED)h+='<div class="empty">Загрузка…</div>';
 else h+=ids.length?'<div class="lbl" style="padding:8px 18px 2px">Недавние</div>'+ids.map(u=>{const o=P[u],L=ST[u],un=L.some(x=>!SV.has(x.id));return`<div class="crow" data-sopen="${u}"><div class="avw sr ${un?'':'seen'}">${av(o,56)}</div><div class="ci"><b class="nm"><span class="t">${displayName(o,o?.name||'…')}</span></b><small>${ago(L.at(-1).created_at)}${L.length>1?' · '+L.length:''}</small></div></div>`}).join(''):'<div class="empty">Пока нет историй от ваших собеседников.<br>Их видят только люди, с которыми у вас есть личный чат.</div>';
 $('#clist').innerHTML=h}
let SVQ=null;
function openStory(uid,start){const L=ST[uid];if(!L||!L.length)return;let i=start??0;if(start==null&&uid!==me.id){const k=L.findIndex(x=>!SV.has(x.id));i=k<0?0:k}
 SVQ={uid,L,i,t:null};$('#sv').hidden=false;showStory()}
function closeStory(){if(SVQ)clearTimeout(SVQ.t);SVQ=null;$('#sv').hidden=true;$('#sv').innerHTML='';if(TAB==='stories')home()}
function showStory(){const q=SVQ;if(!q)return;clearTimeout(q.t);const x=q.L[q.i],o=P[q.uid],mineS=q.uid===me.id;
 const bars=q.L.map((_,j)=>`<i class="${j<q.i?'full':j===q.i?'run':''}"></i>`).join('');
 let body='';
 if(x.kind==='img'){const u=stPath(x.path);body=`<div class="svimg"><img src="${u}" alt="">${x.caption?`<div class="svcap">${esc(x.caption)}</div>`:''}</div>`}
 else{const g=SBG[x.bg]||SBG[0];body=`<div class="svtxt" style="background:linear-gradient(160deg,${g[0]},${g[1]})"><div>${esc(x.caption||'')}</div></div>`}
 $('#sv').innerHTML=`<div class="svbars">${bars}</div><div class="svhead">${av(o,36)}<div><b>${displayName(o,o?.name||'…')}</b><small>${ago(x.created_at)}</small></div><button id="svx" aria-label="Закрыть">✕</button></div>${body}<div class="svl" id="svl"></div><div class="svr" id="svr"></div>${mineS?`<div class="svfoot"><span id="svv">👁 …</span><button id="svd">🗑 Удалить</button></div>`:''}`;
 $('#svx').onclick=closeStory;$('#svl').onclick=()=>{if(q.i>0){q.i--;showStory()}else showStory()};$('#svr').onclick=nextStory;
 if(mineS){$('#svd').onclick=async()=>{if(!confirm('Удалить эту историю?'))return;clearTimeout(q.t);const r=await sb.from('stories').delete().eq('id',x.id);if(r.error){toast(r.error.message);return}if(x.path)sb.storage.from('avatars').remove([x.path]).then(()=>{});
   ST[me.id]=(ST[me.id]||[]).filter(y=>y.id!==x.id);if(!ST[me.id].length)delete ST[me.id];q.L=ST[me.id]||[];if(!q.L.length){closeStory();return}q.i=Math.min(q.i,q.L.length-1);showStory()};
  sb.from('story_views').select('viewer_id').eq('story_id',x.id).then(r=>{if(SVQ===q&&q.L[q.i]===x&&$('#svv'))$('#svv').textContent='👁 '+((r.data||[]).filter(v=>v.viewer_id!==me.id).length)})}
 else if(!SV.has(x.id)){SV.add(x.id);sb.from('story_views').upsert({story_id:x.id}).then(()=>{})}
 q.t=setTimeout(nextStory,5200)}
function nextStory(){const q=SVQ;if(!q)return;if(q.i<q.L.length-1){q.i++;showStory()}else closeStory()}
function newStory(){sheet(`<h3>Новая история</h3><div class="msg">Исчезнет через 24 часа. Видят только собеседники из ваших личных чатов. Истории не шифруются так, как переписка.</div><div class="srow" data-a="img">📷 Фото</div><div class="srow" data-a="txt">✍️ Текст</div><input type="file" id="sfile" accept="image/*" hidden>`,sh=>{
  sh.querySelector('#sfile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const b=await scaleImg(f,1080);storyCompose('img',b)}catch(_){toast('Не удалось прочитать фото')}};
  sh.onclick=e=>{const a=e.target.closest('[data-a]')?.dataset.a;if(a==='img')sh.querySelector('#sfile').click();if(a==='txt')storyCompose('txt',null)}})}
function storyCompose(kind,blob){let bg=1;const prev=blob?URL.createObjectURL(blob):'';
 sheet(`<h3>${kind==='img'?'Подпись к фото':'Текст истории'}</h3>${kind==='img'?`<img src="${prev}" style="width:100%;max-height:300px;object-fit:contain;border-radius:16px;background:#000">`:''}
  ${kind==='txt'?`<div class="svprev" id="svp" style="background:linear-gradient(160deg,${SBG[bg][0]},${SBG[bg][1]})"><span id="svpt">Ваш текст</span></div><div class="sw" id="svc">${SBG.map((g,i)=>`<i data-b="${i}" style="background:linear-gradient(135deg,${g[0]},${g[1]})" class="${i===bg?'on':''}"></i>`).join('')}</div>`:''}
  <textarea id="svt" maxlength="${kind==='txt'?200:120}" placeholder="${kind==='txt'?'Напишите что-нибудь…':'Подпись (необязательно)'}" style="min-height:70px"></textarea>
  <div id="svm" class="msg"></div><button class="btn" id="svgo">Опубликовать</button>`,sh=>{
  const t=sh.querySelector('#svt');if(kind==='txt'){t.oninput=()=>sh.querySelector('#svpt').textContent=t.value||'Ваш текст';sh.querySelector('#svc').onclick=e=>{const b=e.target.dataset.b;if(b===undefined)return;bg=+b;sh.querySelectorAll('#svc i').forEach(i=>i.classList.toggle('on',i.dataset.b===b));sh.querySelector('#svp').style.background=`linear-gradient(160deg,${SBG[bg][0]},${SBG[bg][1]})`}}
  sh.querySelector('#svgo').onclick=async()=>{const cap=t.value.trim();if(kind==='txt'&&!cap){sh.querySelector('#svm').textContent='Введите текст';return}
   const btn=sh.querySelector('#svgo');btn.disabled=true;sh.querySelector('#svm').textContent='Публикация…';
   try{let path=null;if(kind==='img'){path=`${me.id}/story-${Date.now()}-${Math.random().toString(36).slice(2,8)}.jpg`;const u=await sb.storage.from('avatars').upload(path,blob,{contentType:'image/jpeg',cacheControl:'3600',upsert:false});if(u.error)throw new Error(u.error.message)}
    const r=await sb.from('stories').insert({kind,path,caption:cap||null,bg:kind==='txt'?bg:0}).select().single();if(r.error){if(path){const rm=await sb.storage.from('avatars').remove([path]);if(rm.error)console.warn('[stories] orphan cleanup failed',rm.error)}throw new Error(/stories|relation/i.test(r.error.message)?'Выполните stories.sql в Supabase':r.error.message)}
    (ST[me.id]=ST[me.id]||[]).push(r.data);closeSheet();toast('История опубликована');if(TAB==='stories')home()}catch(err){btn.disabled=false;sh.querySelector('#svm').textContent=err.message}}})}
function contactsList(f){const seen=new Set(),L=[];Object.values(C).forEach(c=>{if(c.kind!=='dm'||c.secret_ttl)return;const o=peerOf(c);if(!o||seen.has(o.id))return;seen.add(o.id);L.push({c,o})});
 const rows=L.filter(({o})=>!f||(o.name||'').toLowerCase().includes(f)||(o.username||'').toLowerCase().includes(f)).sort((a,b)=>(online(b.o)?1:0)-(online(a.o)?1:0)||(a.o.name||'').localeCompare(b.o.name||'','ru'));
 let h=`<div class="crow" data-find="1"><div class="av" style="width:50px;height:50px;font-size:24px">+</div><div class="ci"><b>Найти пользователя</b><small>Написать новому человеку</small></div></div>`;
 h+=rows.length?rows.map(({c,o})=>`<div class="crow" data-c="${c.id}"><div class="avw">${av(o,50)}${online(o)?'<i class="dot"></i>':''}</div><div class="ci"><b class="nm"><span class="t">${displayName(o,title(c))} ${esc(o.status_emoji||'')}</span></b><small>${online(o)?'в сети':(o.last_seen?'был(а) '+tm(o.last_seen):'@'+esc(o.username||''))}</small></div></div>`).join(''):'<div class="empty">Пока нет контактов.<br>Начните личный чат — человек появится здесь.</div>';
 $('#clist').innerHTML=h}
function setTab(t){if(t==='profile'){sets();return}TAB=t;showArch=false;document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('on',b.dataset.tab===TAB));$('#home .top h2').textContent=TAB==='chats'?'Чаты':TAB==='contacts'?'Контакты':'Истории';home();if(TAB==='stories')loadStories()}
document.querySelectorAll('#nav button').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
function home(){if(!me)return;pruneSecret();const f=$('#q').value.trim().toLowerCase();CH.hidden=TAB!=='chats';if(TAB==='contacts'){contactsList(f);return}if(TAB==='stories'){storiesList();return}CH.innerHTML=chipsHtml();
 const all=Object.values(C),inArch=all.filter(c=>c.my?.archived);
 const rows=all.filter(c=>!!c.my?.archived===showArch).map(c=>({c,l:lastOf(c),u:unread(c)})).filter(r=>(!f||title(r.c).toLowerCase().includes(f))&&passF(r))
  .sort((a,b)=>(b.c.my?.pinned?1:0)-(a.c.my?.pinned?1:0)||new Date(b.l?b.l.created_at:b.c.created_at)-new Date(a.l?a.l.created_at:a.c.created_at));
 const au=inArch.reduce((n,c)=>n+(c.my.muted?0:unread(c)),0);let h='';
 if(!f&&!showArch&&FILT==='all'&&inArch.length)h+=`<div class="crow arch" data-arch="1"><div class="av" style="width:56px;height:56px">📦</div><div class="ci"><b>Архив</b><small>Чатов: ${inArch.length}</small></div>${au?`<div class="cm"><span class="badge">${au}</span></div>`:''}</div>`;
 if(showArch)h+=`<div class="crow arch" data-arch="0"><div class="av" style="width:56px;height:56px">←</div><div class="ci"><b>Архив</b><small>Назад к чатам</small></div></div>`;
 h+=rows.length?rows.map(({c,l,u})=>{const o=c.kind==='dm'?peerOf(c):c,mu=c.my?.muted;
  const who=l?(l.sender===me.id?'Вы: ':(c.kind==='group'&&P[l.sender]?esc(P[l.sender].name||'')+': ':'')):'';
  return`<div class="crow" data-c="${c.id}"><div class="avw">${av(o,56)}${c.kind==='dm'&&online(o)?'<i class="dot"></i>':''}</div><div class="ci"><b class="nm"><span class="t">${c.secret_ttl?'🔒 ':''}${c.kind==='channel'?'📢 ':c.kind==='group'?'👥 ':''}${c.kind==='dm'?displayName(o,title(c)):esc(title(c))} ${c.kind==='dm'?esc(o?.status_emoji||''):''}</span>${mu?'<span>🔇</span>':''}</b><small>${l?who+esc(preview(l)):'Нет сообщений'}</small></div><div class="cm">${l?tm(l.created_at):''}<br>${u?`<span class="badge${mu?' mute':''}">${u}</span>`:c.my?.pinned?'📌':''}</div></div>`}).join('')
  :(showArch?'<div class="empty">В архиве пусто</div>':(FILT!=='all'||f?'<div class="empty">Ничего не найдено</div>':'<div class="empty">Пока нет чатов.<br>Нажмите «+», чтобы написать кому-нибудь.</div>'));
 $('#clist').innerHTML=h}
$('#q').oninput=home;
let clLP=0,clT=null,clXY=null;const CL=$('#clist');
CL.onclick=e=>{if(Date.now()-clLP<700)return;if(e.target.closest('[data-find]')){$('#newb').click();return}const so=e.target.closest('[data-sopen]');if(so){openStory(so.dataset.sopen);return}if(e.target.closest('[data-sadd]')){newStory();return}const a=e.target.closest('[data-arch]');if(a){showArch=a.dataset.arch==='1';home();return}const r=e.target.closest('.crow[data-c]');if(r)openChat(r.dataset.c)};
CL.addEventListener('pointerdown',e=>{if(e.button>0)return;const r=e.target.closest('.crow[data-c]');if(!r)return;clXY=[e.clientX,e.clientY];
 clT=setTimeout(()=>{clT=null;clLP=Date.now();navigator.vibrate?.(12);chatMenu(C[r.dataset.c])},450)});
CL.addEventListener('pointermove',e=>{if(clT&&clXY&&Math.hypot(e.clientX-clXY[0],e.clientY-clXY[1])>9){clearTimeout(clT);clT=null}});
['pointerup','pointercancel','pointerleave'].forEach(t=>CL.addEventListener(t,()=>{clearTimeout(clT);clT=null}));
CL.addEventListener('contextmenu',e=>{const r=e.target.closest('.crow[data-c]');if(r){e.preventDefault();clLP=Date.now();chatMenu(C[r.dataset.c])}});
function chatMenu(c){const m=c&&c.my;if(!m)return;
 sheet(`<h3>${esc(title(c))}</h3><div class="srow" data-f="pinned">📌 ${m.pinned?'Открепить':'Закрепить вверху'}</div>
  <div class="srow" data-f="muted">${m.muted?'🔔 Включить уведомления':'🔇 Отключить уведомления'}</div>
  <div class="srow" data-f="archived">📦 ${m.archived?'Достать из архива':'В архив'}</div><div class="srow" data-a="folder">🗂 В папку…</div><div class="srow" data-a="open">💬 Открыть</div>`,
  s=>s.onclick=async e=>{const f=e.target.closest('[data-f]')?.dataset.f,a=e.target.closest('[data-a]')?.dataset.a;
   if(f){closeSheet();await flag(c,f,!m[f])}if(a==='open'){closeSheet();openChat(c.id)}if(a==='folder'){closeSheet();chatFolders(c)}})}
async function flag(c,f,v){const r=await sb.rpc('member_flag',{c:c.id,f,v});
 if(r.error){toast(/member_flag|function/i.test(r.error.message)?'Выполните design2.sql в Supabase':r.error.message);return}
 c.my[f]=v;if(f==='archived'&&v){toast('Чат в архиве');if(cur===c.id){cur=null;show('home')}}home()}

/* ---------- чат ---------- */
const online=p=>p&&p.last_seen&&Date.now()-new Date(p.last_seen)<70000;
const stat=p=>!p?'':online(p)?'в сети':'был(а) '+(sameDay(p.last_seen,Date.now())?'в '+hm(p.last_seen):new Date(p.last_seen).toLocaleDateString('ru',{day:'numeric',month:'short'}));
const RL={};
function openChat(id){cur=id;if(C[id]&&C[id].secret_ttl)purge();delete RL[id];if(SEL){SEL=null;selUI()}unbar();$('#inp').value='';fit();show('chat');head();render(true);markRead();setComposer()}
$('#back').onclick=()=>{cur=null;unbar();if(SEL){SEL=null;selUI()}show('home');home()};
function setComposer(){const c=C[cur];const ok=c&&canPost(c);$('#comp').hidden=!ok;$('#ro').hidden=ok;if(!ok)unbar()}
function head(){const c=C[cur];if(!c)return;$('#cvoice').hidden=$('#cvideo').hidden=c.kind!=='dm';$('#chat').classList.toggle('secret',!!c.secret_ttl);const o=c.kind==='dm'?peerOf(c):c;$('#hav').innerHTML=av(o,40);
 const sub=c.kind==='dm'?(c.secret_ttl?'🔒 исчезают через '+ttlName(c.secret_ttl):stat(o)):c.kind==='channel'?c.members.length+' подписчиков':c.members.length+' участников';
 $('#who').innerHTML=`<b>${c.kind==='dm'?displayName(o,title(c)):esc(title(c))} ${c.kind==='dm'?esc(o?.status_emoji||''):''}</b><small>${sub}</small>`;setComposer();
 const pm=c.pinned_id&&(M[cur]||[]).find(x=>x.id===c.pinned_id);$('#pin').hidden=!c.pinned_id;if(c.pinned_id)$('#pt').textContent=pm?preview(pm):'Сообщение';}
$('#who').onclick=$('#hav').onclick=()=>{const c=C[cur];if(c)info(c)};
async function markRead(){const c=C[cur];if(!c||document.hidden)return;const l=lastOf(c);
 if(l&&c.my&&l.created_at>c.my.last_read_at){const previous=c.my.last_read_at,next=new Date().toISOString();c.my.last_read_at=next;sb.rpc('mark_read',{c:c.id}).then(({error})=>{if(error&&c.my?.last_read_at===next){c.my.last_read_at=previous;if(cur===c.id)render();else home();console.warn('[read] mark_read failed',error)}}).catch(error=>console.warn('[read] mark_read failed',error))}}
const tick=r=>`<svg class="tk" viewBox="0 0 18 11" width="15" height="10"><path d="${r?'M1 6l3.2 3.2L10.5 1.5M7.2 8.2l1 1L15 1.5':'M3 6l3.2 3.2L13 1.5'}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const audHtml=u=>`<div class="vp" data-src="${u}"><button class="vpb" aria-label="Воспроизвести"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button><div class="vpbar"><i></i></div><span class="vpt">0:00</span></div>`;
function bubble(m,c){const p=m.p||{},mine=m.sender===me.id;let h='';
 if(p.r){const q=(M[c.id]||[]).find(x=>x.id===p.r);h+=`<div class="rp" data-r="${p.r}">${q?esc(preview(q)):'Сообщение удалено'}</div>`}
 if(p.f)h=`<div class="fw">↪ Переслано от ${esc(p.f)}</div>`+h;
 const media=p.k&&p.p;
 if(media){const mid=m.id;
  const u=BLOB[p.p];
  if(p.k==='img')h+=u?`<img class="mi" src="${u}" alt="">`:`<div class="ph" data-m="${mid}">📷</div>`;
  else if(p.k==='vid')h+=u?`<video src="${u}" controls playsinline preload="metadata"></video>`:`<div class="ph" data-m="${mid}">🎞</div>`;
  else if(p.k==='aud')h+=u?audHtml(u):`<div class="ph" data-m="${mid}" style="height:44px;width:200px">🎤</div>`;
  else h+=u?`<a class="file" href="${u}" download="${esc(p.n||'file')}">📎 ${esc(p.n||'Файл')}</a>`:`<a class="file" data-m="${mid}">📎 ${esc(p.n||'Файл')}</a>`}
 if(p.t)h+=esc(p.t);
 const t=`<div class="mt">${m.edited_at?'изм. ':''}${hm(m.created_at)}${mine&&c.kind==='dm'?tick(c.members.some(x=>x.user_id!==me.id&&x.last_read_at>=m.created_at)):''}</div>`;
 const rx={};Object.values(m.reactions||{}).forEach(e=>rx[e]=(rx[e]||0)+1);
 const mineR=(m.reactions||{})[me.id];
 const rh=Object.keys(rx).length?`<div class="rx">${Object.entries(rx).map(([e,n])=>`<span class="${mineR===e?'on':''}" data-id="${m.id}" data-e="${e}">${e} ${n}</span>`).join('')}</div>`:'';
 return`<div class="row ${mine?'me':'th'}${SEL&&SEL.has(m.id)?' sel':''}">${!mine&&c.kind!=='dm'?`<div class="snd">${displayName(P[m.sender],P[m.sender]?.name||'…')}</div>`:''}<div class="b ${media&&!p.t&&(p.k==='img'||p.k==='vid')?'nopad':''}" data-id="${m.id}">${h}${t}</div>${rh}</div>`}
function render(sc){const c=C[cur];if(!c)return;pruneSecret();const box=$('#list'),near=box.scrollHeight-box.scrollTop-box.clientHeight<160;
 const a=M[cur]||[];let h='',pd=null;
 for(const m of a){if(!pd||!sameDay(pd,m.created_at))h+=`<div class="day">${sameDay(m.created_at,Date.now())?'Сегодня':new Date(m.created_at).toLocaleDateString('ru',{day:'numeric',month:'long'})}</div>`;pd=m.created_at;h+=bubble(m,c)}
 box.innerHTML=h||'<div class="empty">🔒 Сообщения защищены сквозным шифрованием.<br>Напишите первым.</div>';
 const seen=RL[cur],maxId=a.length?a[a.length-1].id:0;
 if(seen!==undefined)box.querySelectorAll('.b').forEach(b=>{if(+b.dataset.id>seen)b.parentElement.classList.add('new')});
 RL[cur]=maxId;
 if(sc||near){if(seen!==undefined&&maxId>seen)box.scrollTo({top:box.scrollHeight,behavior:'smooth'});else box.scrollTop=box.scrollHeight}
 box.querySelectorAll('[data-m]').forEach(el=>loadMedia(el))}
$('#list').onclick=e=>{
 const rx=e.target.closest('.rx span');if(rx){react(+rx.dataset.id,rx.dataset.e);return}
 if(SEL){const b=e.target.closest('.b');if(b)toggleSel(+b.dataset.id);return}
 const rp=e.target.closest('.rp');if(rp){jump(+rp.dataset.r);return}
 const im=e.target.closest('img.mi');if(im){$('#viewer').innerHTML=`<img src="${im.src}">`;$('#viewer').hidden=false}};
function jump(id){const el=document.querySelector(`#list .b[data-id="${id}"]`);if(!el){toast('Сообщение далеко вверху или удалено');return}
 el.scrollIntoView({block:'center',behavior:'smooth'});el.classList.remove('flash');void el.offsetWidth;el.classList.add('flash')}
$('#pin').onclick=()=>{const c=C[cur];if(c&&c.pinned_id)jump(c.pinned_id)};
// долгое нажатие / правая кнопка = меню сообщения
let lp=null,lpXY=null;const LST=$('#list');
LST.addEventListener('pointerdown',e=>{if(SEL||e.button>0)return;const b=e.target.closest('.b');if(!b||e.target.closest('video,audio,a.file,.vp'))return;
 lpXY=[e.clientX,e.clientY];lp=setTimeout(()=>{lp=null;navigator.vibrate?.(12);menu(+b.dataset.id)},420)});
LST.addEventListener('pointermove',e=>{if(lp&&lpXY&&Math.hypot(e.clientX-lpXY[0],e.clientY-lpXY[1])>9){clearTimeout(lp);lp=null}});
['pointerup','pointercancel','pointerleave'].forEach(t=>LST.addEventListener(t,()=>{clearTimeout(lp);lp=null}));
LST.addEventListener('contextmenu',e=>{const b=e.target.closest('.b');if(b){e.preventDefault();if(!SEL&&!lp)menu(+b.dataset.id)}});
$('#viewer').onclick=()=>{$('#viewer').hidden=true;$('#viewer').innerHTML=''};

/* ---------- меню сообщения ---------- */
const IC={reply:'<path d="M10 9V5l-7 7 7 7v-4c5 0 8 1 11 5-1-6-4-11-11-11z"/>',
 copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
 edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/>',pin:'<path d="M9 4h6l-1 6 3 3v2h-5v5l-1 1-1-1v-5H5v-2l3-3z"/>',
 fwd:'<path d="M14 9V5l7 7-7 7v-4c-5 0-8 1-11 5 1-6 4-11 11-11z"/>',del:'<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
 sel:'<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>'};
const ico=n=>`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${IC[n]}</svg>`;
const QR=['👍','❤️','😂','😮','😢','🔥','👀'];
const ALLR=['👍','👎','❤️','🔥','🥰','👏','😁','🤔','🤯','😱','😢','🎉','🤩','💩','🙏','👌','🕊','🤡','🥱','🥴','😍','🐳','🌚','💯','🤣','⚡','🍌','🏆','💔','🤨','😐','🍓','🍾','💋','😈','😴','😭','🤓','👻','🎃','🙈','😇','😨','🤝','🤗','🫡','🎅','🎄','☃️','💅','🤪','🗿','🆒','💘','🦄','😘','😎','👾'];
let ctxAt=0;
function closeCtx(){$('#ctx').hidden=true;$('#ctx').innerHTML=''}
function menu(id){const c=C[cur],m=(M[cur]||[]).find(x=>x.id===id),el=document.querySelector(`#list .b[data-id="${id}"]`);if(!c||!m||!el)return;
 const mine=m.sender===me.id,p=m.p||{},canPin=c.kind==='dm'||isAdmin(c),pinned=c.pinned_id===id;
 const items=[canPost(c)&&['reply','Ответить'],p.t&&!c.secret_ttl&&['copy','Скопировать'],mine&&p.t&&!p.k&&['edit','Изменить'],canPin&&['pin',pinned?'Открепить':'Закрепить'],!c.secret_ttl&&['fwd','Переслать'],(mine||isAdmin(c))&&['del','Удалить',1]].filter(Boolean);
 const ov=$('#ctx'),r=el.getBoundingClientRect(),W=innerWidth,H=innerHeight;
 ov.innerHTML=`<div class="cx-rx">${QR.map(e=>`<button data-e="${e}">${e}</button>`).join('')}<button class="cx-more" data-more="1">⌄</button></div><div class="cx-bub ${mine?'me':'th'}"></div>
  <div class="cx-menu">${items.map(([k,t,red])=>`<div class="cx-i${red?' red':''}" data-a="${k}">${ico(k)}<span>${t}</span></div>`).join('')}<div class="cx-sep"></div><div class="cx-i" data-a="sel">${ico('sel')}<span>Выбрать</span></div></div>`;
 const rx=ov.querySelector('.cx-rx'),bb=ov.querySelector('.cx-bub'),mn=ov.querySelector('.cx-menu');
 const cl=el.cloneNode(true);cl.removeAttribute('data-id');cl.classList.remove('flash');bb.appendChild(cl);
 bb.style.width=Math.min(r.width,W-24)+'px';bb.style.maxHeight=Math.round(H*.34)+'px';
 ov.hidden=false;ctxAt=Date.now();
 const rxH=rx.offsetHeight,bH=bb.offsetHeight,mH=mn.offsetHeight,gap=8,topMin=64,botMax=H-18,total=rxH+gap+bH+gap+mH;
 let t0=Math.min(Math.max(r.top-rxH-gap,topMin),Math.max(topMin,botMax-total));
 const bTop=t0+rxH+gap,mTop=bTop+bH+gap;
 rx.style.top=t0+'px';bb.style.top=bTop+'px';bb.style.left=Math.max(12,Math.min(r.left,W-12-bb.offsetWidth))+'px';
 mn.style.top=mTop+'px';mn.style.maxHeight=Math.max(120,botMax-mTop)+'px';
 const side=mine?'right':'left';rx.style[side]='12px';mn.style[side]='12px';
 ov.onclick=e=>{const t=e.target;if(Date.now()-ctxAt<350)return;
  if(t.closest('.cx-more')){mn.hidden=true;rx.classList.add('big');rx.style.top=mTop+'px';rx.style.maxHeight=Math.max(150,botMax-mTop)+'px';
   rx.innerHTML=`<div class="cx-grid">${ALLR.map(e=>`<button data-e="${e}">${e}</button>`).join('')}</div>`;return}
  const em=t.closest('[data-e]');if(em){closeCtx();react(id,em.dataset.e);return}
  const a=t.closest('[data-a]')?.dataset.a;if(a){closeCtx();act(a,m);return}
  if(!t.closest('.cx-bub,.cx-rx,.cx-menu'))closeCtx()}}
async function react(id,e){const m=(M[cur]||[]).find(x=>x.id===id);
 if(m){m.reactions={...(m.reactions||{})};if(m.reactions[me.id]===e)delete m.reactions[me.id];else m.reactions[me.id]=e;render()}
 const r=await sb.rpc('react',{mid:id,e});if(r.error)toast(r.error.message)}
async function act(a,m){const c=C[cur],p=m.p||{};
 if(a==='reply'){reply=m;editing=null;bar('Ответ: '+preview(m));$('#inp').focus()}
 if(a==='copy')navigator.clipboard?.writeText(p.t).then(()=>toast('Скопировано'));
 if(a==='edit'){editing=m;reply=null;bar('Изменить: '+p.t);$('#inp').value=p.t;fit();$('#inp').focus()}
 if(a==='pin'){const un=c.pinned_id===m.id,r=await sb.rpc('pin_msg',{c:c.id,mid:un?null:m.id});
  if(r.error)toast(/pin_msg|function/i.test(r.error.message)?'Выполните update2.sql в Supabase':r.error.message);else{c.pinned_id=un?null:m.id;head();toast(un?'Откреплено':'Закреплено')}}
 if(a==='fwd')pickChat(t=>{closeSheet();forward([m],t)});
 if(a==='del'&&confirm('Удалить сообщение?')){const r=await sb.from('msgs').delete().eq('id',m.id);if(r.error)toast(r.error.message);else{M[cur]=M[cur].filter(x=>x.id!==m.id);render()}}
 if(a==='sel')startSel(m.id)}

/* ---------- выбор нескольких, пересылка ---------- */
let SEL=null;
$('#sc').innerHTML=ico('copy');$('#sf').innerHTML=ico('fwd');$('#sd').innerHTML=ico('del');
function selUI(){const on=!!SEL;if($('#sf'))$('#sf').hidden=!!(C[cur]&&C[cur].secret_ttl);$('#selbar').hidden=!on;$('#chead').hidden=on;$('#cw').hidden=on;$('#list').classList.toggle('selm',on);
 if(on){$('#sn').textContent='Выбрано: '+SEL.size;const c=C[cur];$('#sd').hidden=!selMsgs().every(m=>m.sender===me.id||isAdmin(c))}}
const selMsgs=()=>(M[cur]||[]).filter(m=>SEL&&SEL.has(m.id));
function startSel(id){SEL=new Set([id]);selUI();render()}
function toggleSel(id){if(SEL.has(id))SEL.delete(id);else SEL.add(id);if(!SEL.size)SEL=null;selUI();render()}
function endSel(){SEL=null;selUI();render()}
$('#sx').onclick=endSel;
$('#sc').onclick=()=>{const t=selMsgs().map(m=>m.p?.t).filter(Boolean).join('\n');if(!t){toast('В выбранных нет текста');return}navigator.clipboard?.writeText(t);toast('Скопировано');endSel()};
$('#sf').onclick=()=>{const ms=selMsgs();pickChat(async t=>{closeSheet();endSel();await forward(ms,t)})};
$('#sd').onclick=async()=>{const ms=selMsgs();if(!ms.length||!confirm('Удалить сообщений: '+ms.length+'?'))return;
 const r=await sb.from('msgs').delete().in('id',ms.map(m=>m.id)).select('id');if(r.error){toast(r.error.message);return}
 const gone=new Set((r.data||[]).map(x=>x.id));M[cur]=(M[cur]||[]).filter(x=>!gone.has(x.id));if(gone.size<ms.length)toast('Часть сообщений удалить нельзя');endSel()};
function pickChat(cb){const rows=Object.values(C).filter(canPost);
 sheet(`<h3>Переслать в…</h3>${rows.map(c=>`<div class="mrow" data-c="${c.id}" style="cursor:pointer">${av(c.kind==='dm'?peerOf(c):c,44)}<div class="ci"><b>${esc(title(c))}</b><small>${c.kind==='dm'?'Личный чат':c.kind==='group'?'Группа':'Канал'}</small></div></div>`).join('')||'<p class="msg">Нет доступных чатов</p>'}`,
 s=>s.onclick=e=>{const r=e.target.closest('[data-c]');if(r)cb(C[r.dataset.c])})}
async function forward(ms,t){const sv=reply;reply=null;let n=0;toast('Пересылка…',15000);
 for(const m of [...ms].sort((a,b)=>a.id-b.id)){const p=m.p||{},src=C[m.conv_id],from=p.f||(P[m.sender]?.name||'');
  try{if(p.k&&p.p){const r=await fetch(sb.storage.from('media').getPublicUrl(p.p).data.publicUrl);if(!r.ok)throw 0;
    const raw=await CR.openB(K[src.id],src.id,new Uint8Array(await r.arrayBuffer()));
    if(await upload(t,raw,p.k,p.n,p.y,{f:from,...(p.t?{t:p.t}:{})}))n++}
   else if(await sendPayload(t,{...(p.t?{t:p.t}:{}),f:from}))n++}catch(e){}}
 reply=sv;toast(n?'Переслано: '+n:'Не удалось переслать');
 if(n){if(cur!==t.id)openChat(t.id);else render(true)}}
function bar(t){$('#bt').textContent=t;$('#bar').hidden=false}
function unbar(){reply=editing=null;$('#bar').hidden=true}
$('#bx').onclick=()=>{if(editing)$('#inp').value='';unbar();fit()};

/* ---------- отправка ---------- */
const inp=$('#inp');
function fit(){inp.style.height='auto';inp.style.height=Math.max(44,Math.min(inp.scrollHeight,130))+'px';const has=!!inp.value.trim();$('#sendb').hidden=!has;if(!rec)$('#mic').hidden=has}
inp.oninput=fit;
async function sendPayload(c,payload){if(!K[c.id]){toast('Нет ключа этого чата');return null}
 const r=await sb.from('msgs').insert({conv_id:c.id,sender:me.id,data:await CR.seal(K[c.id],c.id,payload)}).select().single();
 if(r.error){toast(r.error.message);return null}
 await dc(r.data);const a=M[c.id]=M[c.id]||[];if(!a.some(x=>x.id===r.data.id))a.push(r.data);if(cur===c.id)render(true);else home();return r.data}
$('#sendb').onclick=async()=>{const t=inp.value.trim(),c=C[cur];if(!t||!c)return;
 if(editing){const m=editing;unbar();inp.value='';fit();const np={...m.p,t};
  const r=await sb.from('msgs').update({data:await CR.seal(K[c.id],c.id,np),edited_at:new Date().toISOString()}).eq('id',m.id).select().single();
  if(r.error){toast(r.error.message);return}Object.assign(m,r.data);m.p=np;render();return}
 const pl={t};if(reply)pl.r=reply.id;unbar();inp.value='';fit();const sent=await sendPayload(c,pl);if(!sent&&!inp.value.trim()){inp.value=t;fit()}};
inp.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&matchMedia('(hover:hover)').matches){e.preventDefault();$('#sendb').click()}};

/* ---------- файлы ---------- */
async function loadMedia(el){const m=Object.values(M).flat().find(x=>String(x.id)===String(el.dataset.m));if(!m||!m.p||!m.p.p)return;const p=m.p,c=C[m.conv_id];if(!c||!K[c.id]){if(el.isConnected)el.textContent='🔒 нет доступа';return}
 try{let url=BLOB[p.p];
  if(!url){const r=await fetch(sb.storage.from('media').getPublicUrl(p.p).data.publicUrl);if(!r.ok)throw 0;
   const raw=await CR.openB(K[c.id],c.id,new Uint8Array(await r.arrayBuffer()));url=BLOB[p.p]=URL.createObjectURL(new Blob([raw],{type:p.y||'application/octet-stream'}))}
  if(!el.isConnected)return;
  if(p.k==='img'){el.outerHTML=`<img class="mi" src="${url}" alt="">`}
  else if(p.k==='vid'){el.outerHTML=`<video src="${url}" controls playsinline preload="metadata"></video>`}
  else if(p.k==='aud'){el.outerHTML=audHtml(url)}
  else{el.href=url;el.download=p.n||'file'}
 }catch(e){if(el.isConnected&&el.classList.contains('ph'))el.textContent='⚠️ не загрузилось'}}
async function upload(c,bytes,kind,name,mime,extra){
 const sealed=await CR.sealB(K[c.id],c.id,bytes),path=`${c.id}/${crypto.randomUUID()}`;
 const r=await sb.storage.from('media').upload(path,new Blob([sealed]),{contentType:'application/octet-stream'});
 if(r.error){toast('Не загрузилось: '+r.error.message);return}
 const pl={k:kind,p:path,n:name,y:mime,s:bytes.length,...extra};if(reply){pl.r=reply.id;unbar()}let sent;try{sent=await sendPayload(c,pl)}catch(err){const cleanup=await sb.storage.from('media').remove([path]);if(cleanup.error)console.warn('[media] orphan cleanup failed',cleanup.error);throw err}if(!sent){const cleanup=await sb.storage.from('media').remove([path]);if(cleanup.error)console.warn('[media] orphan cleanup failed',cleanup.error);return null}return sent}
function shrink(file,max=1600){return new Promise((res,rej)=>{const im=new Image(),u=URL.createObjectURL(file);let done=false;
 const finish=(fn,v)=>{if(done)return;done=true;URL.revokeObjectURL(u);fn(v)};
 im.onload=()=>{try{if(!im.naturalWidth||!im.naturalHeight)throw new Error('Некорректное изображение');
  const k=Math.min(1,max/Math.max(im.naturalWidth,im.naturalHeight)),cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(im.naturalWidth*k));cv.height=Math.max(1,Math.round(im.naturalHeight*k));
  const ctx=cv.getContext('2d');if(!ctx)throw new Error('Canvas недоступен');ctx.drawImage(im,0,0,cv.width,cv.height);
  cv.toBlob(b=>b?finish(res,b):finish(rej,new Error('Не удалось обработать изображение')),'image/jpeg',.82)
 }catch(e){finish(rej,e)}};im.onerror=()=>finish(rej,new Error('Формат изображения не поддерживается'));im.src=u})}
$('#att').onclick=()=>$('#fileIn').click();
$('#fileIn').onchange=async e=>{const f=e.target.files[0];e.target.value='';const c=C[cur];if(!f||!c)return;
 if(f.size>40*1024*1024){toast('Файл больше 40 МБ');return}toast('Отправка…',20000);
 try{let kind='file',blob=f,mime=f.type,name=f.name;
  if(f.type.startsWith('image/')&&f.type!=='image/gif'){try{blob=await shrink(f);mime='image/jpeg';kind='img'}catch(_){kind='file'}}
  else if(f.type.startsWith('video/'))kind='vid';else if(f.type.startsWith('audio/'))kind='aud';
  await upload(c,new Uint8Array(await blob.arrayBuffer()),kind,name,mime)}catch(err){toast('Ошибка отправки')}
 $('#toast').hidden=true};
const VP={};let vpCur=null;const mmss=t=>{t=Math.max(0,Math.floor(t||0));return Math.floor(t/60)+':'+String(t%60).padStart(2,'0')};
function vpUI(src,a){const el=[...document.querySelectorAll('.vp')].find(x=>x.dataset.src===src);if(!el)return;const fin=isFinite(a.duration)&&a.duration>0;
 el.querySelector('.vpbar i').style.width=(fin?a.currentTime/a.duration*100:0)+'%';el.querySelector('.vpt').textContent=mmss(fin&&a.paused&&!a.currentTime?a.duration:a.currentTime);
 el.querySelector('.vpb').classList.toggle('on',!a.paused)}
$('#list').addEventListener('click',e=>{const el=e.target.closest('.vp');if(!el)return;const src=el.dataset.src;let a=VP[src];
 if(!a){a=VP[src]=new Audio(src);a.preload='metadata';['timeupdate','play','pause','ended','loadedmetadata'].forEach(ev=>a.addEventListener(ev,()=>{if(ev==='ended')a.currentTime=0;vpUI(src,a)}))}
 if(e.target.closest('.vpbar')&&!e.target.closest('.vpb')){const r=el.querySelector('.vpbar').getBoundingClientRect();if(isFinite(a.duration)&&a.duration>0){a.currentTime=Math.min(.999,Math.max(0,(e.clientX-r.left)/r.width))*a.duration;vpUI(src,a)}return}
 if(a.paused){if(vpCur&&vpCur!==a)vpCur.pause();vpCur=a;a.play().catch(()=>toast('Не удалось воспроизвести'))}else a.pause()});
let rec=null,chunks=[],recCancel=false,recT=null,recS=0,recStarting=false;
const REC_MAX_MS=5*60*1000;
function recCleanup(){clearInterval(recT);recT=null;$('#recbar').hidden=true;$('#mic').classList.remove('rec');fit()}
async function finishRecording(r,stream,c){
 const type=r.mimeType||'audio/webm';
 try{
  if(recCancel){recCancel=false;return}
  const blob=new Blob(chunks,{type});
  if(blob.size<800){toast('Запись слишком короткая');return}
  if(blob.size>25*1024*1024){toast('Голосовое больше 25 МБ');return}
  const duration=Math.min(REC_MAX_MS,Date.now()-recS);
  toast('Отправка голосового…',20000);
  const sent=await upload(c,new Uint8Array(await blob.arrayBuffer()),'aud','voice',type.split(';')[0],{d:Math.round(duration/1000)});
  if(sent)toast('Голосовое отправлено');
 }catch(e){toast('Не удалось отправить голосовое: '+(e?.message||'ошибка'))}
 finally{stream.getTracks().forEach(t=>t.stop());chunks=[];recCleanup()}
}
$('#mic').onclick=async()=>{
 const c=C[cur];if(!c)return;
 if(rec){if(rec.state!=='inactive')rec.stop();return}
 if(recStarting)return;
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){toast('Запись голосовых не поддерживается этим браузером');return}
 recStarting=true;$('#mic').disabled=true;
 let stream;
 try{
  stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
  const candidates=['audio/webm;codecs=opus','audio/mp4','audio/webm'];
  const mimeType=candidates.find(t=>MediaRecorder.isTypeSupported?.(t))||'';
  const recorder=new MediaRecorder(stream,mimeType?{mimeType}:{});
  rec=recorder;chunks=[];recCancel=false;recS=Date.now();
  recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
  recorder.onerror=()=>{recCancel=true;toast('Ошибка записи голосового');try{if(recorder.state!=='inactive')recorder.stop()}catch(_){stream.getTracks().forEach(t=>t.stop());rec=null;recCleanup()}};
  recorder.onstop=()=>{if(rec===recorder)rec=null;finishRecording(recorder,stream,c)};
  recorder.start(1000);
  $('#rect').textContent='0:00';$('#recbar').hidden=false;$('#mic').classList.add('rec');
  recT=setInterval(()=>{
   const elapsed=Date.now()-recS;$('#rect').textContent=mmss(elapsed/1000);
   if(elapsed>=REC_MAX_MS&&recorder.state!=='inactive'){toast('Достигнут лимит записи — отправляю голосовое');recorder.stop()}
  },250);
 }catch(e){
  stream?.getTracks().forEach(t=>t.stop());rec=null;recCleanup();
  toast(e?.name==='NotAllowedError'?'Разрешите доступ к микрофону в настройках приложения':'Не удалось начать запись: '+(e?.message||'ошибка'));
 }finally{recStarting=false;$('#mic').disabled=false}
};
$('#recx').onclick=()=>{if(rec&&rec.state!=='inactive'){recCancel=true;rec.stop()}};

/* ---------- звонки (WebRTC) ---------- */
const ICE=[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']},...(window.CFG&&Array.isArray(CFG.ice)?CFG.ice:[])];
let CALL=null,callCh=null,AC=null,ringT=null;const outCh={};
const unlockAudio=()=>{try{AC=AC||new(window.AudioContext||window.webkitAudioContext)();if(AC.state==='suspended')AC.resume()}catch(_){}};
['pointerdown','keydown'].forEach(e=>addEventListener(e,unlockAudio,{passive:true}));
function beep(f,d){if(!AC)return;try{const o=AC.createOscillator(),g=AC.createGain();o.frequency.value=f;g.gain.value=.07;o.connect(g);g.connect(AC.destination);o.start();o.stop(AC.currentTime+d)}catch(_){}}
function ring(mode){clearInterval(ringT);ringT=null;if(!mode)return;const f=()=>{beep(mode==='in'?523:440,.32);setTimeout(()=>beep(mode==='in'?659:440,.32),400)};f();ringT=setInterval(f,2200)}
function callInit(){if(callCh)return;callCh=sb.channel('call:'+me.id).on('broadcast',{event:'sig'},m=>onSig(m.payload||m)).subscribe()}
function sigTo(uid){if(!outCh[uid]){const ch=sb.channel('call:'+uid);outCh[uid]={ch,ready:new Promise(res=>ch.subscribe(st=>{if(st==='SUBSCRIBED')res()}))}}return outCh[uid]}
async function sig(c,o){try{const k=K[c.id];if(!k)return;const d=await CR.seal(k,'call:'+c.id,{...o,ts:Date.now()});const oc=sigTo(peerId(c));await oc.ready;oc.ch.send({type:'broadcast',event:'sig',payload:{c:c.id,f:me.id,d}})}catch(_){}}
async function onSig(pl){try{if(!pl||!pl.c)return;const c=C[pl.c];if(!c||c.kind!=='dm'||!K[c.id]||peerId(c)!==pl.f)return;
 const o=await CR.open(K[c.id],'call:'+c.id,pl.d);if(!o||Math.abs(Date.now()-o.ts)>90000)return;
 if(o.t==='offer'){if(CALL){if(CALL.id!==o.id)sig(c,{t:'busy',id:o.id});return}incoming(c,o);return}
 if(!CALL||CALL.id!==o.id)return;
 if(o.t==='answer'&&CALL.dir==='out'&&CALL.st==='calling'){clearInterval(CALL.resend);CALL.st='connecting';await CALL.pc.setRemoteDescription(o.sdp);ui()}
 else if(o.t==='end'||o.t==='busy')endCall(false,o.t==='busy'?'Занято':(CALL.st==='ringing'?'Пропущенный звонок':'Звонок завершён'))}catch(_){}}
function gathered(pc){return new Promise(res=>{if(pc.iceGatheringState==='complete')return res();const f=()=>{if(pc.iceGatheringState==='complete'){pc.removeEventListener('icegatheringstatechange',f);res()}};pc.addEventListener('icegatheringstatechange',f);setTimeout(res,3500)})}
function mkPc(){const q=CALL,pc=new RTCPeerConnection({iceServers:ICE});q.pc=pc;q.ls.getTracks().forEach(t=>pc.addTrack(t,q.ls));
 pc.ontrack=e=>{q.rs=e.streams[0];ui()};
 pc.onconnectionstatechange=()=>{if(CALL!==q)return;const st=pc.connectionState;
  if(st==='connected'){clearTimeout(q.dc);if(q.st!=='live'){q.st='live';q.t0=Date.now();clearTimeout(q.to);ring(false);q.timer=setInterval(ui,1000)}ui()}
  else if(st==='failed')endCall(true,'Не удалось соединиться: сеть не пропускает звонок');
  else if(st==='disconnected'){clearTimeout(q.dc);q.dc=setTimeout(()=>{if(CALL===q&&pc.connectionState==='disconnected')endCall(true,'Связь потеряна')},6000)}}}
const media=v=>navigator.mediaDevices.getUserMedia({audio:true,video:v?{facingMode:'user'}:false});
async function startCall(c,video){if(CALL){toast('Звонок уже идёт');return}
 if(!navigator.mediaDevices||!window.RTCPeerConnection){toast('Звонки не поддерживаются этим браузером');return}
 if(!K[c.id]){toast('Нет ключа этого чата');return}
 let ls;try{ls=await media(video)}catch(_){toast(video?'Нет доступа к камере или микрофону':'Нет доступа к микрофону');return}
 const id=crypto.randomUUID();const q=CALL={id,c,peer:peerId(c),video,dir:'out',st:'calling',ls,mute:false,cam:true};
 try{mkPc();ui();ring('out');await q.pc.setLocalDescription(await q.pc.createOffer());await gathered(q.pc)}
 catch(_){endCall(false,'Не удалось создать звонок');return}
 if(CALL!==q)return;const send=()=>sig(c,{t:'offer',id,video,sdp:q.pc.localDescription});send();q.resend=setInterval(send,2500);
 q.to=setTimeout(()=>{if(CALL===q&&q.st==='calling')endCall(true,'Нет ответа')},45000);
 sendPayload(c,{t:video?'📹 Видеозвонок':'📞 Голосовой звонок'})}
function incoming(c,o){const q=CALL={id:o.id,c,peer:peerId(c),video:!!o.video,dir:'in',st:'ringing',offer:o.sdp,mute:false,cam:true};ui();ring('in');navigator.vibrate?.([300,200,300]);
 q.to=setTimeout(()=>{if(CALL===q&&q.st==='ringing')endCall(false,'Пропущенный звонок')},46000)}
async function acceptCall(){const q=CALL;if(!q||q.st!=='ringing')return;ring(false);clearTimeout(q.to);
 try{q.ls=await media(q.video)}catch(_){toast('Нет доступа к микрофону или камере');endCall(true);return}
 q.st='connecting';mkPc();ui();
 try{await q.pc.setRemoteDescription(q.offer);await q.pc.setLocalDescription(await q.pc.createAnswer());await gathered(q.pc)}catch(_){endCall(true,'Ошибка звонка');return}
 if(CALL===q)sig(q.c,{t:'answer',id:q.id,sdp:q.pc.localDescription})}
function endCall(send,msg){const q=CALL;if(!q)return;CALL=null;clearInterval(q.resend);clearInterval(q.timer);clearTimeout(q.to);clearTimeout(q.dc);ring(false);
 if(send)sig(q.c,{t:'end',id:q.id});try{q.pc&&q.pc.close()}catch(_){}q.ls&&q.ls.getTracks().forEach(t=>t.stop());const el=$('#call');el.hidden=true;el.innerHTML='';if(msg)toast(msg)}
function ui(){const q=CALL,el=$('#call');if(!q)return;
 if(el.hidden){el.hidden=false;el.innerHTML=`<video id="rv" autoplay playsinline></video><div class="cmid"><div id="cav"></div><h2 id="cnm"></h2><div id="cst"></div></div><video id="lv" autoplay playsinline muted></video><div class="cbtns" id="cbt"></div>`;
  const o=P[q.peer];$('#cav').innerHTML=av(o,110);$('#cnm').textContent=(o?.name||'Собеседник')}
 const t=q.st==='live'?(()=>{const s=Math.floor((Date.now()-q.t0)/1000);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')})():q.st==='calling'?'Вызов…':q.st==='ringing'?(q.video?'Входящий видеозвонок':'Входящий звонок'):'Соединение…';
 $('#cst').textContent=t;const vid=q.video&&q.rs;el.classList.toggle('vid',!!vid);
 const rv=$('#rv');if(q.rs&&rv.srcObject!==q.rs){rv.srcObject=q.rs;rv.play().catch(()=>{})}
 const lv=$('#lv');lv.hidden=!(q.video&&q.ls);if(q.ls&&lv.srcObject!==q.ls)lv.srcObject=q.ls;
 const b=$('#cbt'),key=q.st+q.mute+q.cam;if(b.dataset.k!==key){b.dataset.k=key;
  b.innerHTML=q.st==='ringing'?`<button class="cb red" data-act="end" aria-label="Отклонить">✕</button><button class="cb grn" data-act="acc" aria-label="Принять">✓</button>`:
   `<button class="cb ${q.mute?'off':''}" data-act="mic" aria-label="Микрофон">${q.mute?'🔇':'🎤'}</button>${q.video?`<button class="cb ${q.cam?'':'off'}" data-act="cam" aria-label="Камера">${q.cam?'📹':'🚫'}</button>`:''}<button class="cb red" data-act="end" aria-label="Завершить">✕</button>`}}
$('#call').addEventListener('click',e=>{const a=e.target.closest('[data-act]')?.dataset.act,q=CALL;if(!a||!q)return;
 if(a==='end')endCall(true,q.st==='ringing'?'':'Звонок завершён');if(a==='acc')acceptCall();
 if(a==='mic'){q.mute=!q.mute;q.ls&&q.ls.getAudioTracks().forEach(t=>t.enabled=!q.mute);ui()}
 if(a==='cam'){q.cam=!q.cam;q.ls&&q.ls.getVideoTracks().forEach(t=>t.enabled=q.cam);ui()}});
$('#cvoice').onclick=()=>{const c=C[cur];if(c)startCall(c,false)};$('#cvideo').onclick=()=>{const c=C[cur];if(c)startCall(c,true)};
/* ---------- новые чаты ---------- */
$('#newb').onclick=()=>sheet(`<h3>Новый чат</h3>
 <div class="srow" data-a="dm">💬 Написать человеку</div>
 <div class="srow" data-a="secret">🔒 Секретный чат</div>
 <div class="srow" data-a="group">👥 Создать группу</div>
 <div class="srow" data-a="channel">📢 Создать канал</div>`,s=>s.onclick=e=>{const a=e.target.closest('[data-a]')?.dataset.a;if(!a)return;a==='dm'?pickUser(u=>startDm(u)):a==='secret'?secretStart():newConv(a,false)});
async function findUsers(q){q=q.trim().replace(/^@/,'').replace(/[^\p{L}\p{N}_ -]/gu,'').slice(0,32);if(q.length<2)return[];
 const r=await sb.from('profiles').select('*').or(`username.ilike.${q}%,name.ilike.${q}%`).neq('id',me.id).limit(24);
 if(r.error)throw r.error;const seen=new Set();return(r.data||[]).filter(u=>u&&u.id&&!seen.has(u.id)&&seen.add(u.id))}
function pickUser(cb,exclude=[]){sheet(`<h3>Поиск по @имени или имени</h3><input id="su" placeholder="Например: ivan" autocapitalize="off"><div id="sr"></div>`,s=>{
 let t,seq=0;const box=s.querySelector('#sr'),input=s.querySelector('#su');
 input.oninput=e=>{clearTimeout(t);const value=e.target.value,request=++seq;t=setTimeout(async()=>{
  try{const us=(await findUsers(value)).filter(u=>!exclude.includes(u.id));if(request!==seq||!s.isConnected)return;
   box.innerHTML=us.length?us.map(u=>`<div class="mrow" data-u="${esc(u.id)}" style="cursor:pointer">${av(u,44)}<div class="ci"><b>${displayName(u)}</b><small>@${esc(u.username||'')}</small></div></div>`).join(''):'<p class="msg">Никого не нашли</p>';
   box.onclick=ev=>{const r=ev.target.closest('[data-u]');if(!r)return;const u=us.find(x=>String(x.id)===r.dataset.u);if(!u)return;if(!u.pubkey){toast('Этот человек ещё не открыл новое приложение');return}cb(u)}
  }catch(err){if(request===seq)box.innerHTML='<p class="msg">Не удалось выполнить поиск. Попробуйте ещё раз.</p>'}
 },250)}})}
async function addMembers(c,users,role='member'){const rows=[];
 for(const u of users)rows.push({conv_id:c.id,user_id:u.id,role,wrapped_by:me.id,wrapped_key:await CR.wrap(ID.priv,u.pubkey,K[c.id],c.id)});return sb.from('members').insert(rows)}
const TTL=[[3600,'1 час'],[86400,'1 день'],[604800,'1 неделя']];const ttlName=n=>(TTL.find(x=>x[0]===n)||[0,Math.round(n/3600)+' ч'])[1];
function secretStart(){pickUser(u=>sheet(`<h3>🔒 Секретный чат с ${esc(u.name||'@'+u.username)}</h3><div class="msg">Сообщения исчезают сами. В этом чате нет пересылки и копирования. Выберите время жизни сообщений:</div>${TTL.map(([n,t])=>`<div class="srow" data-t="${n}">⏳ ${t}</div>`).join('')}`,sh=>sh.onclick=e=>{const t=+e.target.closest('[data-t]')?.dataset.t;if(t)startDm(u,t)}))}
function pruneSecret(){let ch=false;Object.values(C).forEach(c=>{if(!c.secret_ttl)return;const a=M[c.id];if(!a)return;const f=a.filter(m=>Date.now()-new Date(m.created_at)<c.secret_ttl*1000);if(f.length!==a.length){M[c.id]=f;ch=true}});return ch}
const purge=()=>{sb.rpc('purge_secret').then(()=>{},()=>{})};
setInterval(()=>{if(!me)return;if(pruneSecret()){if(cur&&SHOWN==='chat')render();else if(SHOWN==='home')home()}},15000);setInterval(()=>{if(me&&Object.values(C).some(c=>c.secret_ttl))purge()},300000);
const dmPending=new Map();
async function startDm(u,ttl){closeSheet();const key=[me.id,u.id].sort().join('_')+(ttl?'_s':'');
 const existing=()=>Object.values(C).find(c=>c.dm_key===key);
 const ex=existing();if(ex){openChat(ex.id);return}
 if(dmPending.has(key)){await dmPending.get(key);await loadAll();const found=existing();if(found)openChat(found.id);return}
 const task=(async()=>{
  const r=await sb.from('convs').insert(ttl?{kind:'dm',dm_key:key,secret_ttl:ttl}:{kind:'dm',dm_key:key}).select().single();
  if(r.error){
   if(ttl&&/secret_ttl|column/i.test(r.error.message)){toast('Выполните secret.sql в Supabase');return}
   if(/duplicate|unique/i.test(r.error.message)){await loadAll();const found=existing();if(found)openChat(found.id);else toast('Не удалось открыть существующий чат')}
   else toast(r.error.message);
   return;
  }
  const c=r.data,k=await CR.newKey();K[c.id]=k;
  const mr=await sb.from('members').insert([
   {conv_id:c.id,user_id:me.id,role:'owner',wrapped_by:me.id,wrapped_key:await CR.wrap(ID.priv,ID.pub,k,c.id)},
   {conv_id:c.id,user_id:u.id,role:'member',wrapped_by:me.id,wrapped_key:await CR.wrap(ID.priv,u.pubkey,k,c.id)}
  ]);
  if(mr.error){await sb.from('convs').delete().eq('id',c.id);delete K[c.id];toast('Не удалось добавить участника: '+mr.error.message);return}
  P[u.id]=u;await loadAll();openChat(c.id);
 })();
 dmPending.set(key,task);
 try{await task}finally{dmPending.delete(key)}
}
let NG={kind:'group',title:'',sel:[]};
function newConv(kind,keep){if(!keep)NG={kind,title:'',sel:[]};
 sheet(`<h3>${NG.kind==='group'?'Новая группа':'Новый канал'}</h3><input id="gt" placeholder="Название" maxlength="60" value="${esc(NG.title)}"><div class="lbl">Участники</div>
  <div class="chips">${NG.sel.map(u=>`<span class="chip">${esc(u.name||u.username)}</span>`).join('')||'<span class="msg">пока никого</span>'}</div>
  <div class="srow" id="ga">➕ Добавить участника</div><button class="btn" id="gc">Создать</button>`,s=>{
  const gt=s.querySelector('#gt');gt.oninput=()=>NG.title=gt.value;
  s.querySelector('#ga').onclick=()=>pickUser(u=>{if(!NG.sel.some(x=>x.id===u.id))NG.sel.push(u);newConv(NG.kind,true)},NG.sel.map(u=>u.id));
  s.querySelector('#gc').onclick=async()=>{const t=gt.value.trim();if(!t){toast('Введите название');return}
   const r=await sb.from('convs').insert({kind:NG.kind,title:t}).select().single();if(r.error){toast(r.error.message);return}
   const c=r.data,k=await CR.newKey();K[c.id]=k;
   const m1=await sb.from('members').insert({conv_id:c.id,user_id:me.id,role:'owner',wrapped_by:me.id,wrapped_key:await CR.wrap(ID.priv,ID.pub,k,c.id)});
   if(m1.error){await sb.from('convs').delete().eq('id',c.id);delete K[c.id];toast('Не удалось создать группу: '+m1.error.message);return}
   if(NG.sel.length){const m2=await addMembers(c,NG.sel);if(m2.error){await sb.from('convs').delete().eq('id',c.id);delete K[c.id];toast('Не удалось добавить участников: '+m2.error.message);return}}
   NG.sel.forEach(u=>P[u.id]=u);closeSheet();await loadAll();openChat(c.id)}})}

/* ---------- информация о чате ---------- */
function profileSheet(u,back){const mine=u.id===me.id;
 sheet(`${cardHtml(u,stat(u))}${mine?'':'<button class="btn" data-a="dm">Написать</button>'}<button class="btn sec" data-a="back">Назад</button>`,s=>s.onclick=async e=>{const a=e.target.dataset.a;
  if(a==='back'){back?back():closeSheet()}
  if(a==='dm'){closeSheet();const ex=Object.values(C).find(c=>c.kind==='dm'&&!c.secret_ttl&&peerOf(c)?.id===u.id);if(ex)openChat(ex.id);else startDm(u)}})}
document.addEventListener('click',e=>{
 const un=e.target.closest('.pcard .unm');if(un&&un.dataset.un){const t='@'+un.dataset.un;(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>toast('Имя пользователя скопировано'),()=>toast(t));return}
 const im=e.target.closest('.pcard .pav img');if(im&&!e.target.closest('.profile-editor')){$('#viewer').innerHTML=`<img src="${im.src}">`;$('#viewer').hidden=false}});
function info(c){
 if(c.kind==='dm'){const o=peerOf(c);return sheet(`${cardHtml(o,o?stat(o):'')}
  <div class="msg" style="text-align:center">🔒 Переписка защищена сквозным шифрованием</div><button class="btn red" data-a="del">Удалить чат</button>`,s=>s.onclick=async e=>{
   if(e.target.dataset.a==='del'&&confirm('Удалить чат для обоих?')){const r=await sb.from('convs').delete().eq('id',c.id);if(r.error)toast(r.error.message);else{closeSheet();cur=null;delete C[c.id];show('home');home()}}})}
 const adm=isAdmin(c),owner=c.my?.role==='owner';
 sheet(`<div style="display:grid;justify-items:center;gap:6px">${av(c,84)}<h3 id="ct">${esc(c.title||'')}</h3><div class="msg">${c.kind==='channel'?'Канал':'Группа'} · ${c.members.length}</div></div>
  ${adm?'<div class="srow" data-a="ren">✏️ Переименовать</div><div class="srow" data-a="gst">🎨 Фото и цвет</div><div class="srow" data-a="add">➕ Добавить участника</div>':''}
  <div class="lbl">Участники</div>
  ${c.members.map(m=>{const u=P[m.user_id];return`<div class="mrow" data-pu="${m.user_id}">${av(u,40)}<div class="ci"><b>${displayName(u,u?.name||'…')}</b><small>@${esc(u?.username||'')}${m.role!=='member'?' · '+(m.role==='owner'?'владелец':'админ'):''}</small></div>${adm&&m.role!=='owner'&&m.user_id!==me.id?`<button data-rm="${m.user_id}" style="color:var(--danger)">Убрать</button>`:''}</div>`}).join('')}
  <div class="msg" style="text-align:center">🔒 Сообщения защищены сквозным шифрованием</div>
  ${owner?'<button class="btn red" data-a="del">Удалить '+(c.kind==='channel'?'канал':'группу')+'</button>':'<button class="btn red" data-a="leave">Выйти</button>'}`,s=>s.onclick=async e=>{
  const a=e.target.dataset.a,rm=e.target.dataset.rm;
  if(!rm){const pu=e.target.closest('[data-pu]')?.dataset.pu;if(pu&&P[pu]){profileSheet(P[pu],()=>info(c));return}}
  if(rm){
   if(c.kind==='group'||c.kind==='channel'){
    try{
     const remaining=c.members.filter(x=>x.user_id!==rm);
     if(!remaining.length)throw new Error('Нельзя удалить последнего участника');
     const nextKey=await CR.newKey(),wrapped={};
     for(const member of remaining){
      const user=P[member.user_id];
      if(!user?.pubkey)throw new Error('Нет открытого ключа участника '+(user?.username||member.user_id));
      wrapped[member.user_id]=await CR.wrap(ID.priv,user.pubkey,nextKey,c.id);
     }
     const r=await sb.rpc('rotate_group_member_key',{p_conv_id:c.id,p_user_id:rm,p_wrapped_keys:wrapped});
     if(r.error)throw r.error;
     K[c.id]=nextKey;closeSheet();await loadAll();if(C[c.id])info(C[c.id]);toast('Участник удалён. Ключ чата обновлён');
    }catch(err){toast('Не удалось безопасно удалить участника: '+(err.message||err),6500)}
   }else{const r=await sb.from('members').delete().eq('conv_id',c.id).eq('user_id',rm);if(r.error)toast(r.error.message);else{c.members=c.members.filter(x=>x.user_id!==rm);info(c)}}
  }
  if(a==='gst'){groupStyle(c);return}if(a==='ren'){const t=prompt('Новое название',c.title||'');if(t&&t.trim()){const r=await sb.from('convs').update({title:t.trim()}).eq('id',c.id);if(r.error)toast(r.error.message);else{c.title=t.trim();head();info(c)}}}
  if(a==='add')pickUser(async u=>{if(c.members.some(x=>x.user_id===u.id)){toast('Уже в чате');return}const r=await addMembers(c,[u]);if(r.error)toast(r.error.message);else{P[u.id]=u;await loadAll();info(C[c.id])}},c.members.map(x=>x.user_id));
  if(a==='leave'&&confirm('Выйти из чата?')){const r=await sb.from('members').delete().eq('conv_id',c.id).eq('user_id',me.id);if(r.error)toast(r.error.message);else{closeSheet();cur=null;delete C[c.id];show('home');home()}}
  if(a==='del'&&confirm('Удалить для всех?')){const r=await sb.from('convs').delete().eq('id',c.id);if(r.error)toast(r.error.message);else{closeSheet();cur=null;delete C[c.id];show('home');home()}}})}

/* ---------- настройки и профиль ---------- */
$('#gear').onclick=()=>sets();
function sets(){const t=prof.theme||{},md=t.mode||'auto';const perm='Notification' in window?Notification.permission:'unsupported';
 sheet(`${cardHtml(prof,'в сети')}
  <div class="srow" data-a="ed">✏️ Изменить профиль</div>
  <div class="srow" data-a="cd">🎨 Оформление чатов</div>
  <div class="lbl">Тема</div><div class="seg">${[['auto','Авто'],['light','Светлая'],['dark','Тёмная']].map(([k,n])=>`<button data-mode="${k}" class="${md===k?'on':''}">${n}</button>`).join('')}</div>
  <div class="lbl">Цвет</div><div class="sw">${ACC.map(c=>`<i data-acc="${c}" style="background:${c||'linear-gradient(135deg,#151515 50%,#f2f2f4 50%)'}" class="${((t.accent==='#3e88f7'?'':t.accent)||'')===c?'on':''}"></i>`).join('')}</div>
  <div class="lbl">Уведомления</div>
  <div class="srow" data-a="push">🔔 Уведомления<b>${perm==='granted'?'Включены':perm==='denied'?'Запрещены':perm==='unsupported'?'Недоступны':'Выключены'}</b></div>
  <div class="srow" data-a="test">🧪 Проверить уведомление</div>
  <div class="msg" style="font-size:13px">🔑 Ключ шифрования хранится на этом устройстве. Для входа с другого телефона понадобится ключевая фраза.</div>
  <button class="btn red" data-a="out">Выйти</button>`,s=>s.onclick=async e=>{
  const a=e.target.closest('[data-a]')?.dataset.a,md2=e.target.dataset.mode,ac=e.target.dataset.acc;
  if(md2||ac!==undefined){const n={...(prof.theme||{})};if(md2)n.mode=md2;if(ac!==undefined)n.accent=ac;prof.theme=applyTheme(n);await sb.from('profiles').update({theme:prof.theme}).eq('id',me.id);sets();return}
  if(a==='cd'){chatDesign();return}if(a==='ed')editor(false);if(a==='push')enablePush();if(a==='test')testPush();
  if(a==='out'&&confirm('Выйти из аккаунта?'))sb.auth.signOut()})}
function editor(first){return new Promise(res=>{
 const T0=prof?.theme||{};let color=prof?.color||GR[0].join(','),cov=T0.cov??null,covUrl=T0.covUrl||'',pend=null,pendCov=null,avatarPreviewUrl=null;
 sheet(`<div class="profile-editor"><div class="profile-editor-head"><div class="pcov" id="pcover" style="background:${cover(prof||{})}"></div><div class="pav" id="pavatar">${av(prof,112)}</div><h3 id="pname">${esc(prof?.name||'Ваше имя')}</h3><div class="handle" id="phandle">@${esc(prof?.username||'username')}</div><div class="edit-actions"><button id="pch">Изменить фото</button><button id="cch">Обложка профиля</button></div></div>
 <input type="file" id="pf" accept="image/*" hidden><input type="file" id="cf" accept="image/*" hidden>
 <div class="profile-section"><div class="profile-section-title">Информация</div><div class="profile-field"><label for="pn">Имя</label><input id="pn" placeholder="Ваше имя" maxlength="40" value="${esc(prof?.name||'')}"></div><div class="profile-field"><label for="pu">Имя пользователя</label><input id="pu" placeholder="username" maxlength="24" autocapitalize="off" value="${esc(prof?.username||'')}"><small>Ссылка на ваш профиль будет доступна по имени пользователя</small></div><div class="profile-field"><label for="pb">О себе</label><textarea id="pb" maxlength="160" placeholder="Расскажите немного о себе">${esc(prof?.bio||'')}</textarea><small>До 160 символов</small></div><div class="profile-field"><label for="pe">Эмодзи-статус</label><input id="pe" placeholder="Например, 🔥" maxlength="4" value="${esc(prof?.status_emoji||'')}"></div></div>
 <div class="profile-section"><div class="profile-section-title">Цвет профиля</div><div class="lbl">Градиент аватара</div><div class="sw" id="pc">${GR.map(g=>`<i data-c="${g.join(',')}" style="background:linear-gradient(135deg,${g[0]},${g[1]||g[0]})"></i>`).join('')}</div><div class="lbl">Обложка</div><div class="sw" id="pcv"><i data-v="" style="background:var(--bg)">A</i>${CV.map((g,i)=>`<i data-v="${i}" style="background:linear-gradient(135deg,${g[0]},${g[1]})"></i>`).join('')}</div></div>
 <div id="pm" class="msg"></div><button class="btn profile-save" id="ps">Сохранить изменения</button>${first?'':'<button class="btn sec profile-cancel" id="px">Отмена</button>'}</div>`,root=>{
 const q=x=>root.querySelector(x);const preview=()=>{const nm=q('#pn').value.trim()||'Ваше имя',un=q('#pu').value.trim().replace(/^@/,'')||'username';q('#pname').textContent=nm+' '+q('#pe').value;q('#phandle').textContent='@'+un;q('#pavatar').innerHTML=av({...prof,id:me.id,name:nm,color,avatar_url:avatarPreviewUrl||prof?.avatar_url},112);if(pendCov){if(q('#pcover').dataset.previewUrl)URL.revokeObjectURL(q('#pcover').dataset.previewUrl);const pu=URL.createObjectURL(pendCov);q('#pcover').dataset.previewUrl=pu;q('#pcover').style.backgroundImage=`url("${pu}")`;q('#pcover').style.backgroundPosition='center';q('#pcover').style.backgroundSize='cover'}else{if(q('#pcover').dataset.previewUrl){URL.revokeObjectURL(q('#pcover').dataset.previewUrl);delete q('#pcover').dataset.previewUrl}q('#pcover').style.background=cover({...prof,theme:{...T0,cov,covUrl}})}q('#pc').querySelectorAll('i').forEach(i=>i.classList.toggle('on',i.dataset.c===color));q('#pcv').querySelectorAll('i').forEach(i=>i.classList.toggle('on',!covUrl&&!pendCov&&(i.dataset.v===''?cov==null:cov===+i.dataset.v)))};
 q('#pch').onclick=()=>q('#pf').click();q('#cch').onclick=()=>q('#cf').click();q('#pf').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{pend=await shrink(f,512);if(avatarPreviewUrl)URL.revokeObjectURL(avatarPreviewUrl);avatarPreviewUrl=URL.createObjectURL(pend);preview()}catch(_){toast('Не удалось прочитать фото')}};q('#cf').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{pendCov=await scaleImg(f,1000);covUrl='';preview()}catch(_){toast('Не удалось прочитать обложку')}};q('#pc').onclick=e=>{if(e.target.dataset.c){color=e.target.dataset.c;preview()}};q('#pcv').onclick=e=>{const v=e.target.dataset.v;if(v===undefined)return;cov=v===''?null:+v;covUrl='';pendCov=null;preview()};['#pn','#pu','#pb','#pe'].forEach(x=>q(x).oninput=preview);preview();if(!first)q('#px').onclick=()=>{if(avatarPreviewUrl)URL.revokeObjectURL(avatarPreviewUrl);closeSheet();res()};
 q('#ps').onclick=async()=>{const name=q('#pn').value.trim(),un=q('#pu').value.trim().replace(/^@/,''),pm=q('#pm');if(!name){pm.textContent='Введите имя';return}if(!/^[A-Za-z0-9_]{3,24}$/.test(un)){pm.textContent='Имя пользователя: 3–24 символа, латиница, цифры, _';return}q('#ps').disabled=true;pm.textContent='Сохранение…';const up=async(b,n)=>{const fp=`${me.id}/${n}${Date.now()}-${Math.random().toString(36).slice(2,7)}.jpg`,bucket=sb.storage.from('avatars'),u=await bucket.upload(fp,b,{contentType:'image/jpeg',cacheControl:'3600',upsert:false});if(u.error)throw new Error('Ошибка загрузки обложки/фото: '+u.error.message);const pub=bucket.getPublicUrl(fp)?.data?.publicUrl;if(!pub)throw new Error('Supabase не вернул публичную ссылку на изображение');return pub};try{let url=prof?.avatar_url||null;if(pend)url=await up(pend,'');if(pendCov)covUrl=await up(pendCov,'cover-');const theme={...T0,cov,covUrl};const r=await sb.from('profiles').upsert({id:me.id,name,username:un,bio:q('#pb').value.trim(),status_emoji:q('#pe').value.trim(),color,avatar_url:url,theme}).select().single();q('#ps').disabled=false;if(r.error){pm.textContent=/duplicate|unique/i.test(r.error.message)?'Это имя пользователя занято':/bio|column/i.test(r.error.message)?'В Supabase не выполнен design.sql':r.error.message;return}prof={...r.data,theme};P[me.id]=prof;if(avatarPreviewUrl)URL.revokeObjectURL(avatarPreviewUrl);closeSheet();toast('Профиль обновлён');if(!first){cur?head():home()}res()}catch(err){q('#ps').disabled=false;pm.textContent='Не удалось сохранить: '+err.message}};
 });
})}

function chatDesign(){let t=applyTheme(prof.theme);const dk=document.documentElement.dataset.t==='dark'?1:0;
 const sw=(arr,k,cur)=>arr.map(c=>`<i data-${k}="${c}" class="${c===cur?'on':''}" style="background:${c||'var(--card)'}">${c?'':'A'}</i>`).join('');
 const seg=(arr,k,cur)=>arr.map(([v,n])=>`<button data-${k}="${v}" class="${cur===v?'on':''}">${n}</button>`).join('');
 sheet(`<h3>Оформление чатов</h3>
  <div class="demo"><div class="row th"><div class="b">Привет! Как дела?</div></div><div class="row me"><div class="b">Отлично 👍</div></div></div>
  <div class="lbl">Обои</div><div class="sw" id="cw1">${Object.keys(WALLS).map(k=>`<i data-w="${k}" class="${t.wall===k?'on':''}" style="background:${k==='none'?'var(--card)':WALLS[k][dk]}"></i>`).join('')}</div>
  <div style="display:flex;gap:22px"><button class="link" id="wch">Своё фото</button><button class="link" id="wcl">Сбросить</button></div><input type="file" id="wf" accept="image/*" hidden>
  <div class="lbl">Мои пузыри</div><div class="sw" id="co">${sw(OUTC,'o',t.out||'')}</div>
  <div class="lbl">Чужие пузыри</div><div class="sw" id="ci2">${sw(INC,'i',t.inb||'')}</div>
  <div class="lbl">Форма пузырей</div><div class="seg" id="csh">${seg([['r','Круглые'],['m','Мягкие'],['s','Острые']],'sh',t.shape)}</div>
  <div class="lbl">Список чатов</div><div class="seg" id="cls">${seg([['plain','Список'],['cards','Карточки'],['compact','Компактно']],'ls',t.list)}</div>
  <button class="btn" id="cdn">Готово</button>`,s=>{
  const q=x=>s.querySelector(x),set=(k,v)=>{t={...t,[k]:v};applyTheme(t)},mark=(id,fn)=>q(id).querySelectorAll('i,button').forEach(x=>x.classList.toggle('on',fn(x)));
  q('#cw1').onclick=e=>{const w=e.target.dataset.w;if(!w)return;set('wall',w);mark('#cw1',x=>x.dataset.w===w)};
  q('#co').onclick=e=>{const v=e.target.dataset.o;if(v===undefined)return;set('out',v);mark('#co',x=>x.dataset.o===v)};
  q('#ci2').onclick=e=>{const v=e.target.dataset.i;if(v===undefined)return;set('inb',v);mark('#ci2',x=>x.dataset.i===v)};
  q('#csh').onclick=e=>{const v=e.target.dataset.sh;if(!v)return;set('shape',v);mark('#csh',x=>x.dataset.sh===v)};
  q('#cls').onclick=e=>{const v=e.target.dataset.ls;if(!v)return;set('list',v);mark('#cls',x=>x.dataset.ls===v)};
  q('#wch').onclick=()=>q('#wf').click();
  q('#wf').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;toast('Загрузка…',20000);
   try{const b=await scaleImg(f,1280),path=`${me.id}/wall-${Date.now()}.jpg`,u=await sb.storage.from('avatars').upload(path,b,{contentType:'image/jpeg'});
    if(u.error)throw new Error(u.error.message);t={...t,wallUrl:sb.storage.from('avatars').getPublicUrl(path).data.publicUrl};set('wall','custom');mark('#cw1',()=>false);toast('Готово')}
   catch(err){toast('Не получилось: '+err.message,5000)}};
  q('#wcl').onclick=()=>{t={...t,wallUrl:''};set('wall','none');mark('#cw1',x=>x.dataset.w==='none')};
  q('#cdn').onclick=async()=>{prof.theme=t;P[me.id]=prof;closeSheet();await sb.from('profiles').update({theme:t}).eq('id',me.id);cur?render():home()}})}

function groupStyle(c){let col=c.color||'',pend=null,previewUrl=null;
 const s=sheet(`<h3>Оформление группы</h3><div id="gp" style="display:grid;justify-items:center"></div>
  <button class="link" id="gpc" style="justify-self:center">Выбрать фото</button><input type="file" id="gpf" accept="image/*" hidden>
  <div class="lbl">Цвет</div><div class="sw" id="gcol">${GR.map(g=>`<i data-c="${g.join(',')}" style="background:linear-gradient(135deg,${g[0]},${g[1]||g[0]})"></i>`).join('')}</div>
  <div id="gm" class="msg"></div><button class="btn" id="gs">Сохранить</button>`,s=>{
  const q=x=>s.querySelector(x),redraw=()=>{if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null}if(pend)previewUrl=URL.createObjectURL(pend);q('#gp').innerHTML=av({...c,color:col,avatar_url:previewUrl||c.avatar_url},96);
   q('#gcol').querySelectorAll('i').forEach(i=>i.classList.toggle('on',i.dataset.c===col))};redraw();
  q('#gpc').onclick=()=>q('#gpf').click();
  q('#gpf').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{pend=await shrink(f,512);redraw()}catch(_){toast('Не удалось прочитать фото')}};
  q('#gcol').onclick=e=>{if(e.target.dataset.c){col=e.target.dataset.c;redraw()}};
  q('#gs').onclick=async()=>{q('#gs').disabled=true;q('#gm').textContent='…';
   try{let url=c.avatar_url||null;if(pend){const path=`${me.id}/g-${Date.now()}.jpg`,u=await sb.storage.from('avatars').upload(path,pend,{contentType:'image/jpeg'});
     if(u.error)throw new Error(u.error.message);url=sb.storage.from('avatars').getPublicUrl(path).data.publicUrl}
    const r=await sb.from('convs').update({color:col||null,avatar_url:url}).eq('id',c.id).select().single();
    if(r.error)throw new Error(/column/i.test(r.error.message)?'В Supabase не выполнен design.sql':r.error.message);
    Object.assign(c,r.data);closeSheet();toast('Сохранено');head();home()}
   catch(err){q('#gs').disabled=false;q('#gm').textContent=err.message}}})}

/* ---------- push ---------- */
 function b64u(s){const p='='.repeat(4-s.length%4),b=(s+p).replace(/-/g,'+').replace(/_/g,'/'),r=atob(b),u=new Uint8Array(r.length);for(let i=0;i<r.length;i++)u[i]=r.charCodeAt(i);return u}
 function pushSupported(){return 'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window}
 async function ensurePushSubscription(reg){
  const key=b64u(CFG.vapid);let sub=await reg.pushManager.getSubscription();
  if(sub){const old=sub.options?.applicationServerKey;const same=old&&old.length===key.length&&key.every((v,i)=>v===old[i]);if(!same){await sub.unsubscribe();sub=null}}
  if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
  const saved=await sb.from('push_subs').upsert({user_id:me.id,endpoint:sub.endpoint,sub:sub.toJSON()},{onConflict:'endpoint'});
  if(saved.error)throw new Error('Не удалось сохранить подписку: '+saved.error.message);
  return sub
 }
 async function pushSync(){if(!me||!pushSupported()||Notification.permission!=='granted')return;
  try{const reg=await navigator.serviceWorker.ready;await ensurePushSubscription(reg)}catch(e){console.warn('[push] sync failed',e)}}
 async function enablePush(){
  if(!pushSupported()){toast('Push недоступен в этой сборке Android. Нужен Chrome/TWA с поддержкой уведомлений.',8000);return}
  try{const perm=await Notification.requestPermission();if(perm!=='granted'){toast('Уведомления запрещены. Разрешите их для приложения в настройках Android.',7000);return}
   const reg=await navigator.serviceWorker.ready;await ensurePushSubscription(reg);
   toast('Устройство зарегистрировано. Серверные уведомления заработают после настройки Push-сервера.',7000);sets()
  }catch(e){toast('Не удалось включить уведомления: '+(e.message||e),7000)}}
 async function testPush(){try{if(!pushSupported())throw new Error('Push API недоступен в этой сборке');
  if(Notification.permission!=='granted')throw new Error('Сначала разрешите уведомления');
  const reg=await navigator.serviceWorker.ready;
  await reg.showNotification('Проверка уведомлений',{body:'Локальные уведомления Android работают',icon:'icon-192.png',badge:'icon-192.png',tag:'local-push-test'});
  toast('Локальная проверка прошла. Для уведомлений о новых сообщениях нужен настроенный сервер Push.',7000)
 }catch(e){toast('Проверка не пройдена: '+(e.message||e),7000)}}
 
 /* ---------- клавиатура ---------- */
if(window.visualViewport){const vv=visualViewport,app=$('#app'),f=()=>{const ae=document.activeElement,ed=!!ae&&/^(INPUT|TEXTAREA)$/.test(ae.tagName),kb=ed||innerHeight-vv.height>120;document.documentElement.classList.toggle('kb',kb);
 app.style.height=vv.height+'px';app.style.top=vv.offsetTop+'px';if(kb){scrollTo(0,0);const l=$('#list');if(l&&!$('#chat').hidden)l.scrollTop=l.scrollHeight}};
 vv.addEventListener('resize',f);vv.addEventListener('scroll',f);addEventListener('focusin',()=>setTimeout(f,60));addEventListener('focusout',()=>setTimeout(()=>{scrollTo(0,0);f()},60))}
if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js').catch(()=>{});let had=!!navigator.serviceWorker.controller;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!had){had=true;return}if(sessionStorage.getItem('swr'))return;sessionStorage.setItem('swr','1');if(!CALL&&!(document.activeElement&&/INPUT|TEXTAREA/.test(document.activeElement.tagName)))location.reload()})}
boot();

const C='chat-v51',CDN='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js',A=['./','index.html','config.js','manifest.webmanifest','styles.css','app.js','icon-192.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(async c=>{await Promise.all(A.map(u=>c.add(new Request(u,{cache:'reload'})).catch(()=>{})));await c.add(new Request(CDN,{mode:'no-cors'})).catch(()=>{})}).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);
 if(r.url===CDN){e.respondWith(caches.match(r).then(h=>h||fetch(r).then(res=>{const cp=res.clone();caches.open(C).then(c=>c.put(r,cp));return res})));return}
 if(u.origin!==location.origin)return;
 e.respondWith(caches.match(r,{ignoreSearch:true}).then(hit=>fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(C).then(c=>c.put(r,cp))}return res}).catch(()=>hit||Promise.reject(new Error('Offline and no cached response')))))});
self.addEventListener('push',e=>{let d={};try{d=e.data?.json()||{}}catch(_){try{d={body:e.data?.text()||'Новое сообщение'}}catch(__){}}
 const conv=d.conv||null;
 e.waitUntil(self.registration.showNotification(d.title||'Чат',{body:d.body||'Новое сообщение',icon:'icon-192.png',badge:'icon-192.png',tag:conv?'c'+conv:'chat-message',renotify:true,data:{conv}}))});
self.addEventListener('notificationclick',e=>{e.notification.close();const conv=e.notification.data&&e.notification.data.conv;
 e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>{
  if(l.length){const target=l.find(c=>c.focused)||l[0];target.postMessage({open:conv});return target.focus()}
  return clients.openWindow('./'+(conv?'?c='+encodeURIComponent(conv):''))}))});

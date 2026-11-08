const C='chat-v10',A=['./','index.html','config.js','manifest.webmanifest','icon-192.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(A)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET'||new URL(r.url).origin!==location.origin)return;
 e.respondWith(fetch(r).then(res=>{const cp=res.clone();caches.open(C).then(c=>c.put(r,cp));return res}).catch(()=>caches.match(r)))});
self.addEventListener('push',e=>{let d={};try{d=e.data.json()}catch(_){}
 e.waitUntil(self.registration.showNotification(d.title||'Чат',{body:d.body||'Новое сообщение',icon:'icon-192.png',badge:'icon-192.png',tag:'c'+(d.conv||''),renotify:true,data:{conv:d.conv}}))});
self.addEventListener('notificationclick',e=>{e.notification.close();const conv=e.notification.data&&e.notification.data.conv;
 e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>{
  if(l.length){l[0].postMessage({open:conv});return l[0].focus()}
  return clients.openWindow('./'+(conv?'?c='+conv:''))}))});

const CACHE='hallel-public-v1';
self.addEventListener('install',ev=>{ev.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/offline.html','/brand/icon-192.png'])).then(()=>self.skipWaiting()));});
self.addEventListener('activate',ev=>ev.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('hallel-public-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',ev=>{
  const u=new URL(ev.request.url);
  if(ev.request.method!=='GET'||u.origin!==location.origin||u.pathname.startsWith('/api/')||u.pathname.startsWith('/s/')||u.pathname.startsWith('/convite/')||u.pathname.startsWith('/auth/'))return;
  if(ev.request.mode==='navigate'){ev.respondWith(fetch(ev.request).catch(()=>caches.match('/offline.html')));return;}
  if(/^\/(brand\/|_next\/static\/(media|css)\/)/.test(u.pathname)){ev.respondWith(caches.match(ev.request).then(hit=>hit||fetch(ev.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(ev.request,copy));}return r;})));}
});

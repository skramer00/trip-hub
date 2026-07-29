const CACHE_NAME='trip-hub-v1';
const CORE_URLS=['/','/manifest.webmanifest','/icon'];

self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(CORE_URLS)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
 event.waitUntil(
  caches.keys()
   .then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key))))
   .then(()=>self.clients.claim()),
 );
});

async function networkFirst(request){
 const cache=await caches.open(CACHE_NAME);
 try{
  const response=await fetch(request);
  if(response.ok)await cache.put(request,response.clone());
  return response;
 }catch{
  return(await cache.match(request))??(request.mode==='navigate'?await cache.match('/'):Response.error());
 }
}

async function cacheFirst(request){
 const cache=await caches.open(CACHE_NAME);
 const cached=await cache.match(request);
 if(cached)return cached;
 const response=await fetch(request);
 if(response.ok)await cache.put(request,response.clone());
 return response;
}

self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin)return;
 if(request.mode==='navigate'||url.pathname==='/api/state'){
  event.respondWith(networkFirst(request));
  return;
 }
 if(url.pathname.startsWith('/_next/static/')||url.pathname==='/icon'||url.pathname==='/manifest.webmanifest'){
  event.respondWith(cacheFirst(request));
 }
});

self.addEventListener('message',event=>{
 if(event.data?.type!=='CACHE_TRIP')return;
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE_NAME);
  await Promise.allSettled([...CORE_URLS,'/api/state'].map(url=>cache.add(url)));
  event.source?.postMessage({type:'TRIP_CACHED'});
 })());
});

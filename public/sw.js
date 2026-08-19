const CACHE_NAME='trip-hub-v3';
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

async function cacheTrip(){
 const cache=await caches.open(CACHE_NAME);
 const page=await fetch('/',{cache:'reload'});
 if(!page.ok)throw new Error('Trip Hub could not be downloaded.');
 await cache.put('/',page.clone());
 const html=await page.text();
 const assets=[...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map(match=>match[1]);
 const urls=[...new Set([...CORE_URLS,...assets])];
 const results=await Promise.allSettled(urls.map(async url=>{
  const response=await fetch(url,{cache:'reload'});
  if(!response.ok)throw new Error(`${url} returned ${response.status}`);
  await cache.put(url,response);
 }));
 const failed=results.filter(result=>result.status==='rejected').length;
 if(failed)throw new Error(`${failed} offline files could not be downloaded.`);
 return urls.length;
}

self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin)return;
 if(url.pathname==='/api/state'){
  event.respondWith(fetch(request));
  return;
 }
 if(request.mode==='navigate'){
  event.respondWith(networkFirst(request));
  return;
 }
 if(url.pathname.startsWith('/_next/static/')||url.pathname==='/icon'||url.pathname==='/manifest.webmanifest'){
  event.respondWith(cacheFirst(request));
 }
});

self.addEventListener('message',event=>{
 if(event.data?.type!=='CACHE_TRIP')return;
 event.waitUntil(cacheTrip()
  .then(count=>event.source?.postMessage({type:'TRIP_CACHED',count}))
  .catch(error=>event.source?.postMessage({type:'TRIP_CACHE_FAILED',message:error instanceof Error?error.message:'Offline download failed.'})));
});

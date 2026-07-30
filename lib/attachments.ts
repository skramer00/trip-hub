export type ReservationAttachment={
 id:string;
 itemId:string;
 name:string;
 type:string;
 size:number;
 createdAt:string;
 file:Blob;
};

const DATABASE_NAME='trip-hub-files';
const STORE_NAME='attachments';
const DATABASE_VERSION=1;

function openDatabase(){
 return new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open(DATABASE_NAME,DATABASE_VERSION);
  request.onupgradeneeded=()=>{
   const database=request.result;
   if(database.objectStoreNames.contains(STORE_NAME))return;
   const store=database.createObjectStore(STORE_NAME,{keyPath:'id'});
   store.createIndex('itemId','itemId',{unique:false});
  };
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error??new Error('Attachment storage could not be opened.'));
 });
}

function attachmentId(){
 return typeof crypto.randomUUID==='function'?crypto.randomUUID():`attachment-${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
}

export async function listReservationAttachments(itemId:string){
 const database=await openDatabase();
 return new Promise<ReservationAttachment[]>((resolve,reject)=>{
  const transaction=database.transaction(STORE_NAME,'readonly');
  const request=transaction.objectStore(STORE_NAME).index('itemId').getAll(itemId);
  request.onsuccess=()=>resolve((request.result as ReservationAttachment[]).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)));
  request.onerror=()=>reject(request.error??new Error('Attachments could not be loaded.'));
  transaction.oncomplete=()=>database.close();
 });
}

export async function saveReservationAttachment(itemId:string,file:File){
 const database=await openDatabase();
 const attachment:ReservationAttachment={
  id:attachmentId(),
  itemId,
  name:file.name,
  type:file.type||'application/octet-stream',
  size:file.size,
  createdAt:new Date().toISOString(),
  file,
 };
 return new Promise<ReservationAttachment>((resolve,reject)=>{
  const transaction=database.transaction(STORE_NAME,'readwrite');
  transaction.objectStore(STORE_NAME).add(attachment);
  transaction.oncomplete=()=>{database.close();resolve(attachment);};
  transaction.onerror=()=>{database.close();reject(transaction.error??new Error('Attachment could not be saved.'));};
 });
}

export async function deleteReservationAttachment(id:string){
 const database=await openDatabase();
 return new Promise<void>((resolve,reject)=>{
  const transaction=database.transaction(STORE_NAME,'readwrite');
  transaction.objectStore(STORE_NAME).delete(id);
  transaction.oncomplete=()=>{database.close();resolve();};
  transaction.onerror=()=>{database.close();reject(transaction.error??new Error('Attachment could not be removed.'));};
 });
}

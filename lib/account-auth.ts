import {createHmac,timingSafeEqual} from 'crypto';
import {cookies} from 'next/headers';
import {db} from './db';
import {DEFAULT_TRIP_ID,LEGACY_TRIP_ID,normalizeTripId} from './trips';

export type AccountRole='owner'|'editor'|'viewer';
export type TripVisibility='private'|'shared'|'public';
export type AccountIdentity={id:string;email:string;name?:string;exp:number};
export const accountCookieName='trip_account';

function secret(){return process.env.ACCOUNT_SESSION_SECRET||process.env.AUTH_SECRET||'development-secret-change-me';}
function sign(payload:string){return createHmac('sha256',secret()).update(payload).digest('base64url');}
function storageTripId(tripId:string){const id=normalizeTripId(tripId);return id===DEFAULT_TRIP_ID?LEGACY_TRIP_ID:id;}

export function accountToken(identity:Omit<AccountIdentity,'exp'>,days=30){
 const value={...identity,exp:Math.floor(Date.now()/1000)+days*86400};
 const payload=Buffer.from(JSON.stringify(value),'utf8').toString('base64url');
 return `${payload}.${sign(payload)}`;
}
export function readAccountToken(token?:string|null):AccountIdentity|null{
 if(!token)return null;const [payload,sig]=token.split('.');if(!payload||!sig)return null;
 const expected=sign(payload);if(sig.length!==expected.length||!timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null;
 try{const value=JSON.parse(Buffer.from(payload,'base64url').toString('utf8')) as AccountIdentity;if(!value.id||!value.email||value.exp<=Math.floor(Date.now()/1000))return null;return value;}catch{return null;}
}
export async function currentAccount(){return readAccountToken((await cookies()).get(accountCookieName)?.value);}
export async function verifySupabaseAccessToken(accessToken:string){
 const {data,error}=await db().auth.getUser(accessToken);if(error||!data.user?.email)return null;
 const meta=data.user.user_metadata??{};
 return {id:data.user.id,email:data.user.email,name:(meta.full_name??meta.name??meta.display_name) as string|undefined};
}
export async function claimPendingInvites(user:{id:string;email:string}){
 const client=db();
 const {data:invites}=await client.from('trip_invitations').select('id,trip_id,role').eq('email',user.email.toLowerCase()).is('accepted_at',null).gt('expires_at',new Date().toISOString());
 for(const invite of invites??[]){await client.from('trip_members').upsert({trip_id:invite.trip_id,user_id:user.id,role:invite.role},{onConflict:'trip_id,user_id'});await client.from('trip_invitations').update({accepted_at:new Date().toISOString()}).eq('id',invite.id);}
}
export async function accountRoleForTrip(userId:string,tripId:string):Promise<AccountRole|null>{
 const {data,error}=await db().from('trip_members').select('role').eq('trip_id',storageTripId(tripId)).eq('user_id',userId).maybeSingle();
 if(error)return null;return (data?.role as AccountRole|undefined)??null;
}
export async function accountCanEdit(tripId:string){const account=await currentAccount();if(!account)return false;const role=await accountRoleForTrip(account.id,tripId);return role==='owner'||role==='editor';}
export async function accountCanView(tripId:string){const account=await currentAccount();if(!account)return false;return Boolean(await accountRoleForTrip(account.id,tripId));}
export async function accountIsOwner(tripId:string){const account=await currentAccount();if(!account)return false;return (await accountRoleForTrip(account.id,tripId))==='owner';}
export async function tripVisibility(tripId:string):Promise<TripVisibility>{
 const {data}=await db().from('trip_access').select('visibility').eq('trip_id',storageTripId(tripId)).maybeSingle();
 return (data?.visibility as TripVisibility|undefined)??'public';
}
export async function setTripVisibility(tripId:string,visibility:TripVisibility){
 const id=storageTripId(tripId);
 const {error}=await db().from('trip_access').upsert({trip_id:id,visibility,updated_at:new Date().toISOString()},{onConflict:'trip_id'});
 if(error)throw error;return visibility;
}
export async function ensureTripAccessRow(tripId:string,visibility:TripVisibility='private'){const id=storageTripId(tripId);await db().from('trip_access').upsert({trip_id:id,visibility},{onConflict:'trip_id',ignoreDuplicates:true});return id;}
export async function membershipsForUser(userId:string){
 const {data,error}=await db().from('trip_members').select('trip_id,role').eq('user_id',userId);if(error)throw error;
 return (data??[]).map(row=>({tripId:row.trip_id===LEGACY_TRIP_ID?DEFAULT_TRIP_ID:row.trip_id,role:row.role as AccountRole}));
}
export function accountStorageTripId(tripId:string){return storageTripId(tripId);}

import {createHmac,timingSafeEqual} from 'crypto';
import {normalizeTripId} from './trips';

export type TripAccessRole='viewer'|'editor';
export type TripInvite={tripId:string;role:TripAccessRole;label?:string;exp:number;iat:number};
export type TripShare={tripId:string;kind:'view';exp:number;iat:number};

function secret(){return process.env.COLLABORATION_SECRET||process.env.AUTH_SECRET||'development-secret-change-me';}
function b64(value:string){return Buffer.from(value,'utf8').toString('base64url');}
function unb64(value:string){return Buffer.from(value,'base64url').toString('utf8');}
function signature(payload:string){return createHmac('sha256',secret()).update(payload).digest('base64url');}
function signed(value:unknown){const payload=b64(JSON.stringify(value));return `${payload}.${signature(payload)}`;}
function verified<T>(token?:string|null):T|null{
 if(!token)return null;const [payload,sig]=token.split('.');if(!payload||!sig)return null;
 const expected=signature(payload);if(sig.length!==expected.length||!timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null;
 try{return JSON.parse(unb64(payload)) as T;}catch{return null;}
}

export function createTripInvite(tripId:string,role:TripAccessRole='editor',label?:string,days=14){
 const now=Math.floor(Date.now()/1000);
 return signed({tripId:normalizeTripId(tripId),role,label:label?.trim().slice(0,80)||undefined,iat:now,exp:now+Math.max(1,Math.min(days,30))*86400} satisfies TripInvite);
}

export function readTripInvite(token?:string|null):TripInvite|null{
 const invite=verified<TripInvite>(token);
 if(!invite?.tripId||!['viewer','editor'].includes(invite.role)||invite.exp<=Math.floor(Date.now()/1000))return null;
 return {...invite,tripId:normalizeTripId(invite.tripId)};
}

export function createTripShare(tripId:string,days=3650){
 const now=Math.floor(Date.now()/1000);
 return signed({tripId:normalizeTripId(tripId),kind:'view',iat:now,exp:now+Math.max(1,Math.min(days,3650))*86400} satisfies TripShare);
}
export function readTripShare(token?:string|null):TripShare|null{
 const share=verified<TripShare>(token);
 if(!share?.tripId||share.kind!=='view'||share.exp<=Math.floor(Date.now()/1000))return null;
 return {...share,tripId:normalizeTripId(share.tripId)};
}
export function validTripShare(token:string|undefined|null,tripId:string){const share=readTripShare(token);return Boolean(share&&share.tripId===normalizeTripId(tripId));}

export function tripAccessCookieName(tripId:string){return `trip_access_${normalizeTripId(tripId).replace(/[^a-z0-9_-]/g,'_').slice(0,70)}`;}
export function inviteCanEdit(token:string|undefined|null,tripId:string){const invite=readTripInvite(token);return Boolean(invite&&invite.tripId===normalizeTripId(tripId)&&invite.role==='editor');}

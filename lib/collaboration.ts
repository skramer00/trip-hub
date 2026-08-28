import {createHmac,timingSafeEqual} from 'crypto';
import {normalizeTripId} from './trips';

export type TripAccessRole='viewer'|'editor';
export type TripInvite={tripId:string;role:TripAccessRole;label?:string;exp:number;iat:number};

function secret(){return process.env.COLLABORATION_SECRET||process.env.AUTH_SECRET||'development-secret-change-me';}
function b64(value:string){return Buffer.from(value,'utf8').toString('base64url');}
function unb64(value:string){return Buffer.from(value,'base64url').toString('utf8');}
function signature(payload:string){return createHmac('sha256',secret()).update(payload).digest('base64url');}

export function createTripInvite(tripId:string,role:TripAccessRole='editor',label?:string,days=14){
 const now=Math.floor(Date.now()/1000);
 const invite:TripInvite={tripId:normalizeTripId(tripId),role,label:label?.trim().slice(0,80)||undefined,iat:now,exp:now+Math.max(1,Math.min(days,30))*86400};
 const payload=b64(JSON.stringify(invite));
 return `${payload}.${signature(payload)}`;
}

export function readTripInvite(token?:string|null):TripInvite|null{
 if(!token)return null;
 const [payload,sig]=token.split('.');
 if(!payload||!sig)return null;
 const expected=signature(payload);
 if(sig.length!==expected.length||!timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null;
 try{
  const invite=JSON.parse(unb64(payload)) as TripInvite;
  if(!invite.tripId||!['viewer','editor'].includes(invite.role)||invite.exp<=Math.floor(Date.now()/1000))return null;
  return {...invite,tripId:normalizeTripId(invite.tripId)};
 }catch{return null;}
}

export function tripAccessCookieName(tripId:string){return `trip_access_${normalizeTripId(tripId).replace(/[^a-z0-9_-]/g,'_').slice(0,70)}`;}
export function inviteCanEdit(token:string|undefined|null,tripId:string){const invite=readTripInvite(token);return Boolean(invite&&invite.tripId===normalizeTripId(tripId)&&invite.role==='editor');}

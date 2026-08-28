'use client';

import {useState} from 'react';
import {activeTripId} from '@/lib/active-trip';

export default function TripCollaboration(){
 const [label,setLabel]=useState('');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [inviteUrl,setInviteUrl]=useState('');
 async function createInvite(){
  setBusy(true);setMessage('');setInviteUrl('');
  try{
   const response=await fetch('/api/collaboration/invite',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tripId:activeTripId(),role:'editor',label,days:14})});
   const result=await response.json() as {url?:string;error?:string};
   if(!response.ok||!result.url)throw new Error(result.error??'Could not create invite.');
   setInviteUrl(result.url);
   try{await navigator.clipboard.writeText(result.url);setMessage('Editor invite copied. It expires in 14 days.');}catch{setMessage('Editor invite created. Copy the link below.');}
  }catch(error){setMessage(error instanceof Error?error.message:'Could not create invite.');}
  finally{setBusy(false);}
 }
 return <section className="collaborationCard">
  <div><div className="eyebrow">TRIP COLLABORATION</div><h3>Invite another editor</h3><p className="muted small">Create a trip-specific editing link instead of sharing the owner PIN. The link works only for this trip and expires after 14 days.</p></div>
  <div className="collaborationInviteRow"><input className="field" value={label} onChange={event=>setLabel(event.target.value)} placeholder="Traveler name (optional)"/><button className="btn primary" disabled={busy} onClick={()=>void createInvite()}>{busy?'Creating…':'Create editor invite'}</button></div>
  {inviteUrl&&<div className="collaborationUrl"><span>{inviteUrl}</span><button className="btn" onClick={()=>void navigator.clipboard.writeText(inviteUrl).then(()=>setMessage('Invite copied.'))}>Copy</button></div>}
  {message&&<p className="shareMessage" role="status">{message}</p>}
  <p className="muted small collaborationNote">Only the owner PIN session can create new editor invitations. Invited editors can change this trip, but they cannot create more invitations.</p>
 </section>;
}

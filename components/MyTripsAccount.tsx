'use client';
import {useState} from 'react';
import {browserSupabase} from '@/lib/supabase-browser';

export default function MyTripsAccount({account}:{account:{email:string;name?:string}|null}){
 const [email,setEmail]=useState('');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 async function emailSignIn(){setBusy(true);setMessage('');const {error}=await browserSupabase.auth.signInWithOtp({email:email.trim(),options:{emailRedirectTo:window.location.href,shouldCreateUser:true}});setBusy(false);setMessage(error?.message??'Check your email for a secure Trip Hub sign-in link.');}
 async function googleSignIn(){setBusy(true);setMessage('');const {error}=await browserSupabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.href}});if(error){setBusy(false);setMessage(error.message);}}
 async function signOut(){setBusy(true);await browserSupabase.auth.signOut();await fetch('/api/account/session',{method:'DELETE'});window.location.reload();}
 if(account)return <div className="myTripsAccount signedIn"><div><span className="accountAvatar">{(account.name||account.email).slice(0,1).toUpperCase()}</span><div><strong>{account.name||account.email}</strong><small>{account.email}</small></div></div><button className="textButton" disabled={busy} onClick={()=>void signOut()}>Sign out</button></div>;
 return <section className="card myTripsSignIn"><div><div className="eyebrow">YOUR TRIPS</div><h2>Sign in to see your trips</h2><p className="muted">Your trip list is private. Public trip links still open directly when someone has the shared URL.</p></div><div className="myTripsSignInActions"><div className="accountEmail"><input className="field" type="email" placeholder="you@example.com" value={email} onChange={event=>setEmail(event.target.value)}/><button className="btn primary" disabled={busy||!email.trim()} onClick={()=>void emailSignIn()}>Email me a sign-in link</button></div><button className="btn" disabled={busy} onClick={()=>void googleSignIn()}>Continue with Google</button></div>{message&&<p className="accountMessage" role="status">{message}</p>}</section>;
}

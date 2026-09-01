'use client';
import {useEffect} from 'react';
import {browserSupabase} from '@/lib/supabase-browser';

export default function AccountSessionBridge(){
 useEffect(()=>{
  let active=true;
  async function sync(accessToken?:string|null){
   try{
    const current=await fetch('/api/account/session',{cache:'no-store'}).then(r=>r.json()) as {account?:{id:string}|null};
    if(!active)return;
    if(accessToken){
     const {data}=await browserSupabase.auth.getUser(accessToken);const userId=data.user?.id;
     if(userId&&current.account?.id===userId)return;
     const response=await fetch('/api/account/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accessToken})});
     if(response.ok&&active)window.location.reload();
    }else if(current.account){
     await fetch('/api/account/session',{method:'DELETE'});if(active)window.location.reload();
    }
   }catch{}
  }
  void browserSupabase.auth.getSession().then(({data})=>sync(data.session?.access_token));
  const {data:listener}=browserSupabase.auth.onAuthStateChange((_event,session)=>{window.setTimeout(()=>void sync(session?.access_token),0);});
  return()=>{active=false;listener.subscription.unsubscribe();};
 },[]);
 return null;
}

'use client';

import {useEffect,useState} from 'react';
import type {CheckItem,TripState} from '@/lib/types';
import {localStateKey,markCloudSynced,pendingSyncKey,pushCloudState,readLocalState,stageDeviceState} from '@/lib/client-state';

type Status='checking'|'hidden'|'ready'|'loading'|'saving'|'error';

export default function FoodListEditor(){
 const [status,setStatus]=useState<Status>('checking');
 const [open,setOpen]=useState(false);
 const [state,setState]=useState<TripState|null>(null);
 const [message,setMessage]=useState('');

 useEffect(()=>{
  let active=true;
  fetch('/api/state',{cache:'no-store'}).then(async response=>{
   if(!response.ok)throw new Error('Unable to check editor access.');
   const result=await response.json();
   if(!active)return;
   setStatus(result.editor?'ready':'hidden');
  }).catch(()=>{if(active)setStatus('hidden');});
  return()=>{active=false;};
 },[]);

 async function load(){
  setStatus('loading');setMessage('');
  try{
   const response=await fetch('/api/state',{cache:'no-store'});
   const result=await response.json();
   if(!response.ok||!result.editor)throw new Error('Editor access is required.');
   // If another Trip Hub control has an unsynced device copy, edit that newest
   // version rather than replacing it with an older cloud snapshot.
   const local=localStorage.getItem(pendingSyncKey)==='true'?readLocalState(localStorage):null;
   setState(local??result.state as TripState);setOpen(true);setStatus('ready');
  }catch(error){setStatus('error');setMessage(error instanceof Error?error.message:'Food list unavailable.');}
 }
 function updateFood(id:string,changes:Partial<CheckItem>){
  if(!state)return;
  const next=structuredClone(state);
  const food=next.foods.find(item=>item.id===id);if(!food)return;
  Object.assign(food,changes);setState(next);
 }
 function addFood(){
  if(!state)return;
  const next=structuredClone(state);
  next.foods.push({id:`food-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,title:'New food',category:'Try',done:false,source:'user'});
  setState(next);
 }
 function deleteFood(id:string){
  if(!state)return;
  const food=state.foods.find(item=>item.id===id);if(!food)return;
  if(!window.confirm(`Delete “${food.title}” from the food list?`))return;
  const next=structuredClone(state);
  next.foods=next.foods.filter(item=>item.id!==id);
  next.places.forEach(place=>{if(place.specialtyFoodIds)place.specialtyFoodIds=place.specialtyFoodIds.filter(foodId=>foodId!==id);});
  next.journalMoments?.forEach(moment=>{if(moment.foodId===id)delete moment.foodId;});
  setState(next);
 }
 function toggleTried(id:string){
  if(!state)return;
  const next=structuredClone(state);const food=next.foods.find(item=>item.id===id);if(!food)return;
  food.done=!food.done;
  if(food.done)food.triedAt=new Date().toISOString();else{delete food.triedAt;delete food.triedAtPlaceId;}
  setState(next);
 }
 async function save(){
  if(!state)return;
  const invalid=state.foods.find(food=>!food.title.trim());
  if(invalid){setMessage('Every food needs a name before saving.');return;}
  setStatus('saving');setMessage('');
  stageDeviceState(localStorage,state);
  try{
   const newest=await pushCloudState(state);
   if(newest){markCloudSynced(localStorage);setMessage('Food list saved. Refreshing Trip Hub…');window.setTimeout(()=>window.location.reload(),450);}
   else {setStatus('ready');setMessage('A newer Trip Hub change is still syncing. Your food edits are saved on this device.');}
  }catch(error){setStatus('ready');setMessage(error instanceof Error?error.message:'Food list could not be saved. Your edits remain on this device.');}
 }

 if(status==='checking'||status==='hidden')return null;
 return <>
  <button type="button" onClick={()=>void load()} style={{position:'fixed',right:18,bottom:18,zIndex:80,border:0,borderRadius:999,padding:'12px 16px',fontWeight:750,background:'#123f2d',color:'#fff',boxShadow:'0 8px 28px rgba(0,0,0,.2)',cursor:'pointer'}}>{status==='loading'?'Loading…':'Edit food list'}</button>
  {open&&state&&<div role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false);}} style={{position:'fixed',inset:0,zIndex:100,background:'rgba(12,25,20,.55)',display:'grid',placeItems:'center',padding:18}}>
   <section role="dialog" aria-modal="true" aria-labelledby="food-editor-title" style={{width:'min(820px,100%)',maxHeight:'90vh',overflow:'auto',background:'#fff',borderRadius:18,padding:22,boxShadow:'0 24px 80px rgba(0,0,0,.3)'}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'flex-start',marginBottom:18}}><div><div style={{fontSize:12,fontWeight:800,letterSpacing:'.08em',color:'#587268'}}>FOOD LIST</div><h2 id="food-editor-title" style={{margin:'4px 0'}}>Edit foods to try and bring home</h2><p style={{margin:0,color:'#66736d'}}>Changes are saved together so adding, editing, and deleting cannot be lost between refreshes.</p></div><button type="button" onClick={()=>setOpen(false)} aria-label="Close food editor" style={{fontSize:24,border:0,background:'transparent',cursor:'pointer'}}>×</button></div>
    <div style={{display:'grid',gap:10}}>{state.foods.map(food=><article key={food.id} style={{display:'grid',gridTemplateColumns:'auto minmax(0,1fr) 150px auto',gap:10,alignItems:'start',padding:12,border:'1px solid #dce5e0',borderRadius:12}}>
     <input type="checkbox" checked={food.done} onChange={()=>toggleTried(food.id)} aria-label={`Mark ${food.title} tried`} style={{marginTop:12}}/>
     <div style={{display:'grid',gap:8}}><input value={food.title} onChange={event=>updateFood(food.id,{title:event.target.value})} aria-label="Food name" style={{width:'100%',padding:'9px 10px',border:'1px solid #cbd8d1',borderRadius:8,fontWeight:650}}/><input value={food.notes??''} onChange={event=>updateFood(food.id,{notes:event.target.value||undefined})} placeholder="Optional note or where to try it" aria-label={`Notes for ${food.title}`} style={{width:'100%',padding:'9px 10px',border:'1px solid #cbd8d1',borderRadius:8}}/></div>
     <select value={food.category} onChange={event=>updateFood(food.id,{category:event.target.value})} aria-label={`List for ${food.title}`} style={{padding:'9px 10px',border:'1px solid #cbd8d1',borderRadius:8}}><option>Try</option><option>Bring home</option></select>
     <button type="button" onClick={()=>deleteFood(food.id)} style={{border:0,background:'transparent',color:'#9b2c2c',padding:'9px 4px',cursor:'pointer'}}>Delete</button>
    </article>)}</div>
    <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',marginTop:18,flexWrap:'wrap'}}><button type="button" onClick={addFood} style={{padding:'10px 14px',border:'1px solid #b9cbc1',borderRadius:9,background:'#fff',fontWeight:700,cursor:'pointer'}}>+ Add food</button><div style={{display:'flex',gap:12,alignItems:'center'}}>{message&&<span role="status" style={{fontSize:14,color:message.includes('saved')?'#176a43':'#9b2c2c'}}>{message}</span>}<button type="button" onClick={()=>void save()} disabled={status==='saving'} style={{padding:'11px 16px',border:0,borderRadius:9,background:'#123f2d',color:'#fff',fontWeight:750,cursor:'pointer'}}>{status==='saving'?'Saving…':'Save food list'}</button></div></div>
   </section>
  </div>}
 </>;
}

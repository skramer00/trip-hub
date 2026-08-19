'use client';

import {useDeferredValue,useMemo,useState} from 'react';
import {dietaryFitLabel,dietaryFits,dietaryPreferenceLabel,dietaryRating,foodPlaceClassification,isFoodPlace,setDietaryRating} from '@/lib/dietary';
import type {DietaryFit,DietaryPreference,Place} from '@/lib/types';

type ReviewFilter='all'|'reviewed'|'unknown'|'not-applicable';

export default function DietaryReview({places,onEdit,onBulkEdit,onSave}:{places:Place[];onEdit:(id:string,changes:Partial<Place>)=>void;onBulkEdit:(updates:{id:string;changes:Partial<Place>}[])=>void;onSave:()=>void}){
 const [preference,setPreference]=useState<DietaryPreference>('low-fodmap');
 const [reviewFilter,setReviewFilter]=useState<ReviewFilter>('all');
 const [region,setRegion]=useState('All');
 const [query,setQuery]=useState('');
 const [selectedIds,setSelectedIds]=useState<Set<string>>(()=>new Set());
 const deferredQuery=useDeferredValue(query.trim().toLowerCase());
 const foodPlaces=useMemo(()=>places.filter(isFoodPlace),[places]);
 const uncertainPlaces=useMemo(()=>places.filter(place=>foodPlaceClassification(place)==='uncertain'),[places]);
 const reviewedCount=foodPlaces.filter(place=>{const rating=dietaryRating(place,preference);return Boolean(rating&&rating.fit!=='unknown'&&rating.fit!=='not-applicable');}).length;
 const notApplicableCount=foodPlaces.filter(place=>dietaryRating(place,preference)?.fit==='not-applicable').length;
 const completedCount=reviewedCount+notApplicableCount;
 const visiblePlaces=useMemo(()=>foodPlaces.filter(place=>{
  const rating=dietaryRating(place,preference);
  const reviewed=Boolean(rating&&rating.fit!=='unknown'&&rating.fit!=='not-applicable');
  if(region!=='All'&&place.region!==region)return false;
  if(reviewFilter==='reviewed'&&!reviewed)return false;
  if(reviewFilter==='unknown'&&reviewed)return false;
  if(reviewFilter==='unknown'&&rating?.fit==='not-applicable')return false;
  if(reviewFilter==='not-applicable'&&rating?.fit!=='not-applicable')return false;
  return !deferredQuery||`${place.name} ${place.area??''} ${place.notes}`.toLowerCase().includes(deferredQuery);
 }).sort((a,b)=>{
  const aRating=dietaryRating(a,preference);
  const bRating=dietaryRating(b,preference);
  const aReviewed=Boolean(aRating&&aRating.fit!=='unknown');
  const bReviewed=Boolean(bRating&&bRating.fit!=='unknown');
  if(aReviewed!==bReviewed)return aReviewed?1:-1;
  return a.name.localeCompare(b.name);
 }),[deferredQuery,foodPlaces,preference,region,reviewFilter]);

 function update(place:Place,fit:DietaryFit,tip:string,saveNow=false){
  onEdit(place.id,{dietaryRatings:setDietaryRating(place,preference,fit,tip)});
  if(saveNow)window.setTimeout(onSave,0);
 }
 function toggleSelected(id:string){
  setSelectedIds(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next;});
 }
 function selectPlaces(selected:Place[]){
  setSelectedIds(current=>{const next=new Set(current);selected.forEach(place=>next.add(place.id));return next;});
 }
 function applyFoodClassification(foodPlace:boolean){
  onBulkEdit([...selectedIds].map(id=>({id,changes:{foodPlace}})));
  setSelectedIds(new Set());
 }
 function applyDietaryFit(fit:DietaryFit){
  const selectedPlaces=places.filter(place=>selectedIds.has(place.id));
  onBulkEdit(selectedPlaces.map(place=>({id:place.id,changes:{foodPlace:true,dietaryRatings:setDietaryRating(place,preference,fit,dietaryRating(place,preference)?.tip??'')}})));
  setSelectedIds(new Set());
 }
 const visibleIds=visiblePlaces.map(place=>place.id);
 const allVisibleSelected=visibleIds.length>0&&visibleIds.every(id=>selectedIds.has(id));

 return <section>
  <div className="pageIntro"><div><div className="eyebrow">DIETARY REVIEW</div><h2>Build practical restaurant guidance</h2><p className="muted">Rate ordering flexibility, not medical safety. Unreviewed places remain visible as Unknown.</p></div><span className="chip">{completedCount}/{foodPlaces.length} classified</span></div>
  {uncertainPlaces.length>0&&<details className="card dietaryCleanup"><summary><span><strong>{uncertainPlaces.length} place{uncertainPlaces.length===1?' needs':'s need'} food classification</strong><small>Review grocery, market, shopping, and “Other” entries</small></span><span className="chip">Cleanup queue</span></summary><div className="dietaryCleanupSelect"><button className="textButton" onClick={()=>selectPlaces(uncertainPlaces)}>Select all uncertain</button></div><div className="dietaryCleanupList">{uncertainPlaces.map(place=><div className="dietaryCleanupRow" key={place.id}><label className="dietarySelect"><input type="checkbox" checked={selectedIds.has(place.id)} onChange={()=>toggleSelected(place.id)} aria-label={`Select ${place.name}`}/><span/></label><div><strong>{place.name}</strong><span>{place.region} · {place.category}</span></div><div className="placeActions"><button className="btn primary" onClick={()=>{onEdit(place.id,{foodPlace:true});window.setTimeout(onSave,0);}}>Food place</button><button className="btn" onClick={()=>{onEdit(place.id,{foodPlace:false});window.setTimeout(onSave,0);}}>Not food</button></div></div>)}</div></details>}
  <div className="card dietaryReviewSummary">
   <div className="dietaryProgressCopy"><strong>{dietaryPreferenceLabel(preference)}</strong><span>{foodPlaces.length?Math.round(completedCount/foodPlaces.length*100):0}% classified</span></div>
   <div className="dietaryProgress" role="progressbar" aria-label={`${dietaryPreferenceLabel(preference)} review progress`} aria-valuemin={0} aria-valuemax={foodPlaces.length} aria-valuenow={completedCount}><i style={{width:`${foodPlaces.length?completedCount/foodPlaces.length*100:0}%`}}/></div>
   <div className="dietaryStats"><span><strong>{reviewedCount}</strong> reviewed</span><span><strong>{foodPlaces.length-completedCount}</strong> unknown</span><span><strong>{notApplicableCount}</strong> not applicable</span></div>
   <p className="muted small">Manual ratings and ordering notes are preserved when other place information refreshes.</p>
  </div>
  <div className="card dietaryReviewFilters">
   <input className="field" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search food places or neighborhoods…" aria-label="Search dietary review places"/>
   <select className="field" value={preference} onChange={event=>setPreference(event.target.value as DietaryPreference)} aria-label="Dietary preference to review"><option value="low-fodmap">Low-FODMAP</option></select>
   <select className="field" value={region} onChange={event=>setRegion(event.target.value)} aria-label="Filter dietary review by region"><option>All</option><option>Toronto</option><option>Niagara & Buffalo</option></select>
   <select className="field" value={reviewFilter} onChange={event=>setReviewFilter(event.target.value as ReviewFilter)} aria-label="Filter by review status"><option value="all">All food places</option><option value="unknown">Needs review</option><option value="reviewed">Reviewed</option><option value="not-applicable">Not applicable</option></select>
   <div className="dietarySelectShown"><label className="toggleLine"><input type="checkbox" checked={allVisibleSelected} onChange={event=>{if(event.target.checked)selectPlaces(visiblePlaces);else setSelectedIds(current=>{const next=new Set(current);visibleIds.forEach(id=>next.delete(id));return next;});}}/> Select all {visiblePlaces.length} shown</label>{selectedIds.size>0&&<button className="textButton" onClick={()=>setSelectedIds(new Set())}>Clear selection</button>}</div>
  </div>
  {selectedIds.size>0&&<div className="card dietaryBatchBar"><strong>{selectedIds.size} selected</strong><div><span>Classify:</span><button className="btn" onClick={()=>applyFoodClassification(true)}>Food place</button><button className="btn" onClick={()=>applyFoodClassification(false)}>Not food</button></div><div><span>Set {dietaryPreferenceLabel(preference)}:</span>{dietaryFits.map(fit=><button className={`btn batch-${fit.id}`} onClick={()=>applyDietaryFit(fit.id)} key={fit.id}>{fit.label}</button>)}</div></div>}
  <div className="dietaryReviewList">{visiblePlaces.map(place=>{
   const rating=dietaryRating(place,preference)??{preference,fit:'unknown' as const,tip:''};
   return <article className={`card dietaryReviewCard review-${rating.fit} ${selectedIds.has(place.id)?'selected':''}`} key={place.id}>
    <label className="dietaryCardSelect"><input type="checkbox" checked={selectedIds.has(place.id)} onChange={()=>toggleSelected(place.id)} aria-label={`Select ${place.name}`}/><span>Select</span></label>
    <div className="dietaryReviewPlace"><div><div className="between"><h3>{place.name}</h3><span className={`dietBadge diet-${rating.fit}`}><i/>{dietaryFitLabel(rating.fit)}</span></div><p className="muted small">{place.area??place.region} · {place.category}</p>{place.notes&&<p className="dietaryPlaceNotes">{place.notes}</p>}</div><div className="dietaryReviewActions"><a className="textButton" href={place.menuUrl||place.websiteUrl||place.mapUrl||`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}`} target="_blank" rel="noreferrer">Review menu ↗</a><button className="textButton" onClick={()=>{onEdit(place.id,{foodPlace:false});window.setTimeout(onSave,0);}}>Not a food place</button></div></div>
    <div className="dietaryQuickFits" aria-label={`${place.name} dietary fit`}>{dietaryFits.map(fit=><button type="button" className={`quickFit fit-${fit.id} ${rating.fit===fit.id?'selected':''}`} aria-pressed={rating.fit===fit.id} onClick={()=>update(place,fit.id,rating.tip??'',true)} key={fit.id}><span/>{fit.label}</button>)}</div>
    <label className="dietaryTipField"><span>Best bet or ordering note</span><textarea className="field" rows={2} value={rating.tip??''} onChange={event=>update(place,rating.fit,event.target.value)} onBlur={onSave} placeholder="Example: grilled fish with potatoes; ask about seasoning and request sauce separately."/></label>
   </article>;
  })}</div>
  {!visiblePlaces.length&&<div className="empty card">No food places match these review filters.</div>}
 </section>;
}

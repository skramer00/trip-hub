'use client';

import {useState} from 'react';
import type {GooglePlaceCandidate,Place,TripState} from '@/lib/types';

type Review={key:string;dayIndex:number;itemIndex:number;title:string;destination?:string;region:string;candidates:GooglePlaceCandidate[];selected:number;confidence:'high'|'medium'|'low';approved:boolean};

function normalize(value:string){return value.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(Boolean);}
function score(title:string,destination:string|undefined,candidate:GooglePlaceCandidate){
 const wanted=new Set(normalize(`${title} ${destination??''}`).filter(word=>word.length>2));
 const got=new Set(normalize(`${candidate.name} ${candidate.formattedAddress??''}`).filter(word=>word.length>2));
 if(!wanted.size)return 0;
 const overlap=[...wanted].filter(word=>got.has(word)).length/wanted.size;
 const exactName=candidate.name.trim().toLowerCase()===title.trim().toLowerCase()?0.45:0;
 const address=destination&&candidate.formattedAddress?.toLowerCase().includes(destination.toLowerCase())?0.35:0;
 return Math.min(1,overlap+exactName+address);
}
function confidence(value:number):Review['confidence']{return value>=.72?'high':value>=.42?'medium':'low';}
function regionForCity(city:string){return city.toLowerCase().includes('toronto')?'Toronto':/niagara|buffalo/i.test(city)?'Niagara & Buffalo':'Other';}
function mapSearch(value:string){return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}`;}

export default function BulkLocationMatcher({state,onApply}:{state:TripState;onApply:(next:TripState)=>void}){
 const [open,setOpen]=useState(false);const [loading,setLoading]=useState(false);const [reviews,setReviews]=useState<Review[]>([]);const [message,setMessage]=useState('');
 async function scan(){
  setOpen(true);setLoading(true);setMessage('Searching Google Maps…');setReviews([]);
  const targets=state.days.flatMap((day,dayIndex)=>day.items.map((item,itemIndex)=>({day,item,dayIndex,itemIndex}))).filter(({item})=>!item.placeId&&!item.locationNotNeeded&&item.type!=='travel'&&(item.destination||item.title));
  const found:Review[]=[];
  for(const target of targets){
   try{
    const region=regionForCity(target.day.city);const query=[target.item.title,target.item.destination].filter(Boolean).join(', ');
    const response=await fetch('/api/places/search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query,region})});if(!response.ok)continue;
    const result=await response.json() as {results?:GooglePlaceCandidate[]};const candidates=(result.results??[]).slice(0,3);if(!candidates.length)continue;
    const ranked=candidates.map(candidate=>({candidate,value:score(target.item.title,target.item.destination,candidate)})).sort((a,b)=>b.value-a.value);
    found.push({key:`${target.dayIndex}-${target.itemIndex}`,dayIndex:target.dayIndex,itemIndex:target.itemIndex,title:target.item.title,destination:target.item.destination,region,candidates:ranked.map(item=>item.candidate),selected:0,confidence:confidence(ranked[0].value),approved:confidence(ranked[0].value)==='high'});
   }catch{}
  }
  setReviews(found);setLoading(false);setMessage(found.length?`${found.length} possible location match${found.length===1?'':'es'} found. High-confidence matches are preselected; review the rest.`:'No Google Maps matches were found for unlinked itinerary items.');
 }
 function patch(key:string,changes:Partial<Review>){setReviews(current=>current.map(review=>review.key===key?{...review,...changes}:review));}
 function apply(){
  const approved=reviews.filter(review=>review.approved&&review.candidates[review.selected]);if(!approved.length)return;
  const next=structuredClone(state);const stamp=Date.now();
  approved.forEach((review,index)=>{const candidate=review.candidates[review.selected];const item=next.days[review.dayIndex]?.items[review.itemIndex];if(!item)return;const address=candidate.formattedAddress?.trim().toLowerCase();let place=next.places.find(saved=>saved.googlePlaceId===candidate.googlePlaceId||(address&&saved.formattedAddress?.trim().toLowerCase()===address));if(!place){place={id:`place-map-${stamp}-${index}`,name:candidate.name,region:review.region,category:item.type==='food'?'Food':item.type==='hotel'?'Hotel':'Attraction',notes:item.details??'',mapUrl:candidate.mapUrl??mapSearch(candidate.name),menuUrl:'',websiteUrl:candidate.websiteUrl??'',tags:[],priority:'possible',visited:false,estimatedDuration:item.estimatedDuration??60,googlePlaceId:candidate.googlePlaceId,formattedAddress:candidate.formattedAddress,latitude:candidate.latitude,longitude:candidate.longitude,weeklyHours:candidate.weeklyHours,hoursSource:'google',hoursVerifiedAt:new Date().toISOString()} as Place;next.places.unshift(place);}item.placeId=place.id;item.destination=place.formattedAddress||place.name;item.mapUrl=candidate.mapUrl??mapSearch(item.destination);});
  onApply(next);setMessage(`${approved.length} location${approved.length===1?'':'s'} connected.`);window.setTimeout(()=>setOpen(false),500);
 }
 return <><button className="btn" onClick={()=>void scan()}>Connect locations to Google Maps</button>{open&&<div className="editorUnlockBackdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!loading)setOpen(false);}}><section className="card locationMatchDialog" role="dialog" aria-modal="true" aria-labelledby="location-match-title"><button className="editorUnlockClose" aria-label="Close location matcher" onClick={()=>setOpen(false)}>×</button><div className="eyebrow">GOOGLE MAPS REVIEW</div><h2 id="location-match-title">Connect itinerary locations</h2><p className="muted">Trip Hub compares up to three Google results per itinerary item. Only high-confidence matches are preapproved; ambiguous names stay unchecked until you review them.</p>{message&&<p className="itineraryImportMessage" role="status">{message}</p>}{loading?<div className="locationMatchLoading">Searching locations…</div>:<div className="locationMatchList">{reviews.map(review=><article className={`locationMatchRow confidence-${review.confidence}`} key={review.key}><label className="locationMatchApprove"><input type="checkbox" checked={review.approved} onChange={event=>patch(review.key,{approved:event.target.checked})}/><span><strong>{review.title}</strong><small>{review.destination||'No address provided'}</small></span></label><span className={`matchConfidence ${review.confidence}`}>{review.confidence} confidence</span><div className="locationCandidates">{review.candidates.map((candidate,index)=><label className={review.selected===index?'selected':''} key={candidate.googlePlaceId}><input type="radio" name={`match-${review.key}`} checked={review.selected===index} onChange={()=>patch(review.key,{selected:index,approved:true,confidence:confidence(score(review.title,review.destination,candidate))})}/><span><strong>{candidate.name}</strong><small>{candidate.formattedAddress||'Address unavailable'}</small></span>{candidate.mapUrl&&<a className="textLink" href={candidate.mapUrl} target="_blank" rel="noreferrer" onClick={event=>event.stopPropagation()}>Map ↗</a>}</label>)}</div></article>)}</div>}<div className="itineraryImportActions"><button className="btn" onClick={()=>setOpen(false)}>Cancel</button><button className="btn primary" disabled={loading||!reviews.some(review=>review.approved)} onClick={apply}>Connect approved</button></div></section></div>}</>;
}

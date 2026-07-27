'use client';

import {useEffect,useMemo,useState} from 'react';
import type {ItineraryItem,Place,TripState} from '@/lib/types';

const tabs=['Today','Itinerary','Food','Places','Checklist'] as const;
type Tab=(typeof tabs)[number];

function activeDayIndex(days:TripState['days']){
 const today=new Date();
 const local=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
 const exact=days.findIndex(day=>day.date===local);
 if(exact>=0)return exact;
 const future=days.findIndex(day=>day.date>local);
 return future>=0?future:days.length-1;
}

function placeMatchesDay(place:Place,city:string,date:string){
 if(place.recommendedDates?.length)return place.recommendedDates.includes(date);
 if(city.includes('Toronto'))return place.region==='Toronto';
 if(city.includes('Buffalo')||city.includes('Niagara'))return place.region==='Niagara & Buffalo';
 return true;
}

export default function TripApp(){
 const [state,setState]=useState<TripState|null>(null);
 const [tab,setTab]=useState<Tab>('Today');
 const [cloud,setCloud]=useState(false);
 const [query,setQuery]=useState('');
 const [region,setRegion]=useState('All');
 const [category,setCategory]=useState('All');
 const [priority,setPriority]=useState('All');
 const [showVisited,setShowVisited]=useState(true);

 useEffect(()=>{fetch('/api/state').then(r=>r.json()).then(result=>{const local=localStorage.getItem('trip-state');setState(result.cloud?result.state:local?JSON.parse(local):result.state);setCloud(result.cloud);});},[]);
 async function persist(next:TripState){setState(next);localStorage.setItem('trip-state',JSON.stringify(next));if(cloud)await fetch('/api/state',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(next)});}
 function toggleDay(di:number,ii:number){if(!state)return;const next=structuredClone(state);next.days[di].items[ii].done=!next.days[di].items[ii].done;void persist(next);}
 function editItem(di:number,ii:number,key:'keyInfo'|'userNotes',value:string){if(!state)return;const next=structuredClone(state);next.days[di].items[ii][key]=value;setState(next);localStorage.setItem('trip-state',JSON.stringify(next));}
 function saveEdits(){if(state)void persist(state);}
 function toggleList(key:'foods'|'packing',index:number){if(!state)return;const next=structuredClone(state);next[key][index].done=!next[key][index].done;void persist(next);}
 function toggleVisited(id:string){if(!state)return;const next=structuredClone(state);const place=next.places.find(p=>p.id===id);if(place)place.visited=!place.visited;void persist(next);}

 const currentDayIndex=useMemo(()=>(state?activeDayIndex(state.days):0),[state]);
 const currentDay=state?.days[currentDayIndex];
 const nextStepIndex=currentDay?.items.findIndex(item=>!item.done)??-1;
 const nextStep=nextStepIndex>=0?currentDay?.items[nextStepIndex]:undefined;
 const filtered=useMemo(()=>{if(!state)return[];const needle=query.trim().toLowerCase();return state.places.filter(place=>(region==='All'||place.region===region)&&(category==='All'||place.category===category)&&(priority==='All'||place.priority===priority)&&(showVisited||!place.visited)&&(!needle||`${place.name} ${place.notes} ${place.tags.join(' ')}`.toLowerCase().includes(needle)));},[state,query,region,category,priority,showVisited]);
 const nearbySuggestions=useMemo(()=>{if(!state||!currentDay)return[];const rank={must:0,possible:1,backup:2};return state.places.filter(place=>placeMatchesDay(place,currentDay.city,currentDay.date)&&!place.visited).sort((a,b)=>rank[a.priority]-rank[b.priority]).slice(0,6);},[state,currentDay]);

 if(!state)return <main className="shell"><div className="card">Loading trip…</div></main>;
 const completedToday=currentDay?.items.filter(i=>i.done).length??0;
 const totalToday=currentDay?.items.length??0;
 const tripProgress=state.days.flatMap(day=>day.items);
 const completedTrip=tripProgress.filter(i=>i.done).length;

 return <>
  <header className="hero"><div className="heroInner"><div><div className="eyebrow">TRIP HUB</div><h1>Toronto · Niagara · Buffalo</h1><p>September 24–October 1, 2026</p></div><div className="headerActions"><span className={`sync ${cloud?'online':''}`}>{cloud?'● Shared sync':'○ Device only'}</span></div></div></header>
  <main className="shell">
   <nav className="tabs" aria-label="Trip sections">{tabs.map(item=><button key={item} className={tab===item?'active':''} onClick={()=>setTab(item)}>{item}</button>)}</nav>
   {tab==='Today'&&currentDay&&<section>
    <div className="todayHero card"><div><div className="eyebrow">TODAY</div><h2>{currentDay.label} · {currentDay.city}</h2><p className="muted">Recommendations below are selected for this specific itinerary day.</p></div><div className="progressRing" aria-label={`${completedToday} of ${totalToday} complete`}><strong>{completedToday}/{totalToday}</strong><span>done</span></div></div>
    {nextStep?<div className="card" style={{marginTop:'16px'}}><div className="eyebrow">NEXT STEP</div><div className="between" style={{alignItems:'flex-start',gap:'16px',marginTop:'6px'}}><div><h2 style={{marginBottom:'4px'}}>{nextStep.title}</h2><div className="muted">{nextStep.time}</div>{nextStep.details&&<p>{nextStep.details}</p>}{nextStep.routeText&&<p className="muted small">🚌 {nextStep.routeText}</p>}{(nextStep.keyInfo||nextStep.confirmationNumber)&&<div style={{marginTop:'12px'}}><strong>Key Info</strong><p style={{whiteSpace:'pre-wrap',marginTop:'4px'}}>{nextStep.keyInfo??nextStep.confirmationNumber}</p></div>}</div><span className="chip">{nextStepIndex+1} of {currentDay.items.length}</span></div><div className="placeActions" style={{marginTop:'14px'}}>{nextStep.mapUrl&&<a className="btn primary" href={nextStep.mapUrl} target="_blank" rel="noreferrer">Open transit directions</a>}<button className="btn" onClick={()=>toggleDay(currentDayIndex,nextStepIndex)}>Mark complete</button></div></div>:<div className="card" style={{marginTop:'16px'}}><div className="eyebrow">NEXT STEP</div><h2 style={{marginTop:'6px'}}>You’re done for today</h2><p className="muted">Every itinerary item for this day is complete.</p></div>}
    <div className="statGrid"><div className="stat"><span>Trip progress</span><strong>{completedTrip}/{tripProgress.length}</strong></div><div className="stat"><span>Saved places</span><strong>{state.places.length}</strong></div><div className="stat"><span>Foods remaining</span><strong>{state.foods.filter(i=>!i.done).length}</strong></div></div>
    <h2 className="sectionTitle">Today’s plan</h2>
    {currentDay.items.map((item,index)=><div className={`card timelineItem ${item.done?'done':''}`} key={item.id}><input aria-label={`Mark ${item.title} complete`} type="checkbox" checked={item.done} onChange={()=>toggleDay(currentDayIndex,index)}/><div className="timeBadge">{item.time}</div><ItineraryDetails item={item} dayIndex={currentDayIndex} itemIndex={index} onEdit={editItem} onSave={saveEdits}/></div>)}
    <div className="between sectionHeading"><h2 className="sectionTitle">Recommended for this day</h2><button className="textButton" onClick={()=>{setRegion(currentDay.city.includes('Toronto')?'Toronto':'Niagara & Buffalo');setTab('Places');}}>See all</button></div>
    <div className="grid compactGrid">{nearbySuggestions.map(place=><PlaceCard key={place.id} place={place} onToggle={()=>toggleVisited(place.id)}/>)}</div>
   </section>}
   {tab==='Itinerary'&&<section><div className="pageIntro"><div><div className="eyebrow">FULL SCHEDULE</div><h2>Eight days, one clear plan</h2></div><span className="chip">{completedTrip}/{tripProgress.length} complete</span></div>{state.days.map((day,di)=><article className="card dayCard" key={day.date}><div className="between dayHeader"><div><div className="eyebrow">{day.date}</div><h2>{day.label} · {day.city}</h2></div><span className="chip">{day.items.filter(i=>i.done).length}/{day.items.length}</span></div>{day.items.map((item,ii)=><div className={`itineraryRow ${item.done?'done':''}`} key={item.id}><input aria-label={`Mark ${item.title} complete`} type="checkbox" checked={item.done} onChange={()=>toggleDay(di,ii)}/><div className="itineraryTime">{item.time}</div><ItineraryDetails item={item} dayIndex={di} itemIndex={ii} onEdit={editItem} onSave={saveEdits}/></div>)}</article>)}</section>}
   {tab==='Food'&&<section><div className="pageIntro"><div><div className="eyebrow">LOCAL FLAVORS</div><h2>Eat the trip</h2></div><span className="chip">{state.foods.filter(i=>i.done).length}/{state.foods.length} tried</span></div>{['Try','Bring home'].map(group=><div key={group} className="listGroup"><h2 className="sectionTitle">{group}</h2><div className="grid">{state.foods.map((food,index)=>food.category===group&&<label className={`card checkCard ${food.done?'done':''}`} key={food.id}><input type="checkbox" checked={food.done} onChange={()=>toggleList('foods',index)}/><div><h3>{food.title}</h3>{food.notes&&<p className="muted small">{food.notes}</p>}</div></label>)}</div></div>)}</section>}
   {tab==='Places'&&<section><div className="pageIntro"><div><div className="eyebrow">SAVED SPOTS</div><h2>Find the right place fast</h2></div><span className="chip">{filtered.length} shown</span></div><div className="filterPanel card"><input className="field searchField" placeholder="Search restaurants, museums, notes…" value={query} onChange={e=>setQuery(e.target.value)}/><div className="filterGrid"><select className="field" value={region} onChange={e=>setRegion(e.target.value)}><option>All</option><option>Toronto</option><option>Niagara & Buffalo</option></select><select className="field" value={category} onChange={e=>setCategory(e.target.value)}><option>All</option>{[...new Set(state.places.map(p=>p.category))].sort().map(v=><option key={v}>{v}</option>)}</select><select className="field" value={priority} onChange={e=>setPriority(e.target.value)}><option>All</option><option value="must">Must do</option><option value="possible">Possible</option><option value="backup">Backup</option></select></div><label className="toggleLine"><input type="checkbox" checked={showVisited} onChange={e=>setShowVisited(e.target.checked)}/> Show visited places</label></div><div className="grid placeGrid">{filtered.map(place=><PlaceCard key={place.id} place={place} onToggle={()=>toggleVisited(place.id)}/>)}</div>{filtered.length===0&&<div className="empty card">No saved places match those filters.</div>}</section>}
   {tab==='Checklist'&&<section><div className="pageIntro"><div><div className="eyebrow">PACK SMART</div><h2>Nothing important left behind</h2></div><span className="chip">{state.packing.filter(i=>i.done).length}/{state.packing.length} packed</span></div>{[...new Set(state.packing.map(i=>i.category))].map(group=><div key={group} className="listGroup"><h2 className="sectionTitle">{group}</h2><div className="grid">{state.packing.map((item,index)=>item.category===group&&<label className={`card checkCard ${item.done?'done':''}`} key={item.id}><input type="checkbox" checked={item.done} onChange={()=>toggleList('packing',index)}/><div>{item.title}</div></label>)}</div></div>)}</section>}
  </main>
 </>;
}

function ItineraryDetails({item,dayIndex,itemIndex,onEdit,onSave}:{item:ItineraryItem;dayIndex:number;itemIndex:number;onEdit:(di:number,ii:number,key:'keyInfo'|'userNotes',value:string)=>void;onSave:()=>void}){
 const keyInfo=item.keyInfo??item.confirmationNumber??'';
 return <div className="timelineCopy"><div className="titleRow"><h3>{item.title}</h3>{item.optional&&<span className="chip neutral">Optional</span>}</div>{item.details&&<p className="muted small">{item.details}</p>}<details style={{marginTop:'10px'}}><summary className="textLink" style={{cursor:'pointer'}}>Trip details</summary><div style={{paddingTop:'10px'}}>{item.routeText&&<p className="muted small">🚌 {item.routeText}</p>}{item.mapUrl&&<a className="textLink" href={item.mapUrl} target="_blank" rel="noreferrer">Transit from current location ↗</a>}<div className="filterGrid" style={{marginTop:'12px'}}><label className="small">Key Info<textarea className="field" rows={3} value={keyInfo} placeholder="Confirmation, seat, terminal, ticket details…" onChange={e=>onEdit(dayIndex,itemIndex,'keyInfo',e.target.value)} onBlur={onSave}/></label><label className="small">Notes<textarea className="field" rows={3} value={item.userNotes??''} placeholder="Add reminders or details" onChange={e=>onEdit(dayIndex,itemIndex,'userNotes',e.target.value)} onBlur={onSave}/></label></div></div></details></div>;
}

function PlaceCard({place,onToggle}:{place:Place;onToggle:()=>void}){
 return <article className={`card placeCard ${place.visited?'visited':''}`}><div className="between"><span className={`priority priority-${place.priority}`}>{place.priority==='must'?'Must do':place.priority}</span><button className="visitedButton" onClick={onToggle}>{place.visited?'✓ Visited':'Mark visited'}</button></div><h3>{place.name}</h3><div className="muted small">{place.region} · {place.category}</div>{place.notes&&<p>{place.notes}</p>}{place.tags.length>0&&<div className="tagRow">{place.tags.slice(0,4).map(tag=><span className="chip neutral" key={tag}>{tag}</span>)}</div>}<div className="placeActions"><a className="btn primary" href={place.mapUrl} target="_blank" rel="noreferrer">Directions</a>{place.menuUrl&&<a className="btn" href={place.menuUrl} target="_blank" rel="noreferrer">Menu</a>}{place.websiteUrl&&<a className="btn" href={place.websiteUrl} target="_blank" rel="noreferrer">Website</a>}</div></article>;
}

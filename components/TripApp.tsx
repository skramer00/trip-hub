'use client';

import {useEffect,useMemo,useState} from 'react';
import {buildAssistantState,estimatedItemDuration,findSuggestionCandidates,inferItemType,isFixedItem} from '@/lib/assistant';
import type {AssistantState,SuggestedPlace} from '@/lib/assistant';
import type {ItineraryItem,Place,TripState} from '@/lib/types';

const tabs=['Today','Assistant','Itinerary','Food','Places','Checklist'] as const;
type Tab=(typeof tabs)[number];

type EditableKey='time'|'title'|'details'|'destination'|'routeText'|'keyInfo'|'userNotes'|'optional'|'fixed'|'type'|'estimatedDuration'|'travelMinutes'|'prepBuffer';
type EditableValue=string|boolean|number|undefined;

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

function timeValue(value:string){
 const match=value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
 if(!match)return 9999;
 let hour=Number(match[1]);
 const minute=Number(match[2]??0);
 const suffix=match[3]?.toUpperCase();
 if(suffix==='PM'&&hour<12)hour+=12;
 if(suffix==='AM'&&hour===12)hour=0;
 return hour*60+minute;
}

function sortItems(items:ItineraryItem[]){return [...items].sort((a,b)=>timeValue(a.time)-timeValue(b.time));}
function mapsUrl(destination:string){return destination.trim()?`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination.trim())}&travelmode=transit`:'';}

export default function TripApp(){
 const [state,setState]=useState<TripState|null>(null);
 const [tab,setTab]=useState<Tab>('Today');
 const [cloud,setCloud]=useState(false);
 const [query,setQuery]=useState('');
 const [region,setRegion]=useState('All');
 const [category,setCategory]=useState('All');
 const [priority,setPriority]=useState('All');
 const [showVisited,setShowVisited]=useState(true);
 const [now,setNow]=useState(()=>new Date());

 useEffect(()=>{fetch('/api/state').then(r=>r.json()).then(result=>{const local=localStorage.getItem('trip-state');setState(result.cloud?result.state:local?JSON.parse(local):result.state);setCloud(result.cloud);});},[]);
 useEffect(()=>{const timer=window.setInterval(()=>setNow(new Date()),60000);return()=>window.clearInterval(timer);},[]);
 async function persist(next:TripState){setState(next);localStorage.setItem('trip-state',JSON.stringify(next));if(cloud)await fetch('/api/state',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(next)});}
 function toggleDay(di:number,ii:number){if(!state)return;const next=structuredClone(state);next.days[di].items[ii].done=!next.days[di].items[ii].done;void persist(next);}
 function editItem(di:number,ii:number,key:EditableKey,value:EditableValue){if(!state)return;const next=structuredClone(state);const item=next.days[di].items[ii];if(key==='optional'||key==='fixed')item[key]=Boolean(value);else if(key==='estimatedDuration'||key==='travelMinutes'||key==='prepBuffer'){if(value===undefined||value==='')delete item[key];else item[key]=Math.max(0,Number(value));}else if(key==='type')item.type=String(value) as ItineraryItem['type'];else item[key]=String(value);if(key==='destination')item.mapUrl=mapsUrl(String(value));setState(next);localStorage.setItem('trip-state',JSON.stringify(next));}
 function saveEdits(di?:number){if(!state)return;const next=structuredClone(state);if(di!==undefined)next.days[di].items=sortItems(next.days[di].items);void persist(next);}
 function addItem(di:number){if(!state)return;const next=structuredClone(state);next.days[di].items.push({id:`custom-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,time:'12:00 PM',title:'New stop',details:'',destination:'',routeText:'',keyInfo:'',userNotes:'',done:false,optional:false,fixed:false,type:'activity',estimatedDuration:60,travelMinutes:20,prepBuffer:15});next.days[di].items=sortItems(next.days[di].items);void persist(next);}
 function deleteItem(di:number,ii:number){if(!state||!window.confirm(`Delete “${state.days[di].items[ii].title}”?`))return;const next=structuredClone(state);next.days[di].items.splice(ii,1);void persist(next);}
 function moveItem(di:number,ii:number,target:number){if(!state||target===di)return;const next=structuredClone(state);const [item]=next.days[di].items.splice(ii,1);next.days[target].items.push(item);next.days[target].items=sortItems(next.days[target].items);void persist(next);}
 function reorderItem(di:number,ii:number,direction:-1|1){if(!state)return;const target=ii+direction;if(target<0||target>=state.days[di].items.length)return;const next=structuredClone(state);[next.days[di].items[ii],next.days[di].items[target]]=[next.days[di].items[target],next.days[di].items[ii]];void persist(next);}
 function toggleList(key:'foods'|'packing',index:number){if(!state)return;const next=structuredClone(state);next[key][index].done=!next[key][index].done;void persist(next);}
 function toggleVisited(id:string){if(!state)return;const next=structuredClone(state);const place=next.places.find(p=>p.id===id);if(place)place.visited=!place.visited;void persist(next);}

 const currentDayIndex=useMemo(()=>(state?activeDayIndex(state.days):0),[state]);
 const currentDay=state?.days[currentDayIndex];
 const nextStepIndex=currentDay?.items.findIndex(item=>!item.done)??-1;
 const nextStep=nextStepIndex>=0?currentDay?.items[nextStepIndex]:undefined;
 const filtered=useMemo(()=>{if(!state)return[];const needle=query.trim().toLowerCase();return state.places.filter(place=>(region==='All'||place.region===region)&&(category==='All'||place.category===category)&&(priority==='All'||place.priority===priority)&&(showVisited||!place.visited)&&(!needle||`${place.name} ${place.notes} ${place.tags.join(' ')}`.toLowerCase().includes(needle)));},[state,query,region,category,priority,showVisited]);
 const nearbySuggestions=useMemo(()=>{if(!state||!currentDay)return[];const rank={must:0,possible:1,backup:2};return state.places.filter(place=>placeMatchesDay(place,currentDay.city,currentDay.date)&&!place.visited).sort((a,b)=>rank[a.priority]-rank[b.priority]).slice(0,6);},[state,currentDay]);
 const assistant=useMemo(()=>state?buildAssistantState(state,now):null,[state,now]);

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
    {currentDay.items.map((item,index)=><div className={`card timelineItem ${item.done?'done':''}`} key={item.id}><input aria-label={`Mark ${item.title} complete`} type="checkbox" checked={item.done} onChange={()=>toggleDay(currentDayIndex,index)}/><div className="timeBadge">{item.time}</div><ItineraryDetails item={item} dayIndex={currentDayIndex} itemIndex={index} onEdit={editItem} onSave={()=>saveEdits(currentDayIndex)}/></div>)}
    <div className="between sectionHeading"><h2 className="sectionTitle">Recommended for this day</h2><button className="textButton" onClick={()=>{setRegion(currentDay.city.includes('Toronto')?'Toronto':'Niagara & Buffalo');setTab('Places');}}>See all</button></div>
    <div className="grid compactGrid">{nearbySuggestions.map(place=><PlaceCard key={place.id} place={place} onToggle={()=>toggleVisited(place.id)}/>)}</div>
   </section>}
   {tab==='Assistant'&&assistant&&<AssistantView assistant={assistant} tripState={state} onComplete={item=>{
    const day=state.days[assistant.currentDayIndex];
    const itemIndex=day?.items.findIndex(candidate=>candidate.id===item.id)??-1;
    if(itemIndex>=0)toggleDay(assistant.currentDayIndex,itemIndex);
   }} onVisited={toggleVisited} onShowPlaces={place=>{
    setQuery(place.name);
    setRegion(place.region);
    setCategory('All');
    setPriority('All');
    setTab('Places');
   }}/>}
   {tab==='Itinerary'&&<section><div className="pageIntro"><div><div className="eyebrow">FULL SCHEDULE</div><h2>Edit the trip without touching code</h2></div><span className="chip">{completedTrip}/{tripProgress.length} complete</span></div>{state.days.map((day,di)=><article className="card dayCard" key={day.date}><div className="between dayHeader"><div><div className="eyebrow">{day.date}</div><h2>{day.label} · {day.city}</h2></div><div className="placeActions"><span className="chip">{day.items.filter(i=>i.done).length}/{day.items.length}</span><button className="btn primary" onClick={()=>addItem(di)}>+ Add stop</button></div></div>{day.items.map((item,ii)=><div className={`itineraryRow ${item.done?'done':''}`} key={item.id}><input aria-label={`Mark ${item.title} complete`} type="checkbox" checked={item.done} onChange={()=>toggleDay(di,ii)}/><div style={{minWidth:0,flex:1}}><ItineraryEditor item={item} dayIndex={di} itemIndex={ii} days={state.days} onEdit={editItem} onSave={()=>saveEdits(di)} onMove={moveItem} onReorder={reorderItem} onDelete={deleteItem}/></div></div>)}</article>)}</section>}
   {tab==='Food'&&<section><div className="pageIntro"><div><div className="eyebrow">LOCAL FLAVORS</div><h2>Eat the trip</h2></div><span className="chip">{state.foods.filter(i=>i.done).length}/{state.foods.length} tried</span></div>{['Try','Bring home'].map(group=><div key={group} className="listGroup"><h2 className="sectionTitle">{group}</h2><div className="grid">{state.foods.map((food,index)=>food.category===group&&<label className={`card checkCard ${food.done?'done':''}`} key={food.id}><input type="checkbox" checked={food.done} onChange={()=>toggleList('foods',index)}/><div><h3>{food.title}</h3>{food.notes&&<p className="muted small">{food.notes}</p>}</div></label>)}</div></div>)}</section>}
   {tab==='Places'&&<section><div className="pageIntro"><div><div className="eyebrow">SAVED SPOTS</div><h2>Find the right place fast</h2></div><span className="chip">{filtered.length} shown</span></div><div className="filterPanel card"><input className="field searchField" placeholder="Search restaurants, museums, notes…" value={query} onChange={e=>setQuery(e.target.value)}/><div className="filterGrid"><select className="field" value={region} onChange={e=>setRegion(e.target.value)}><option>All</option><option>Toronto</option><option>Niagara & Buffalo</option></select><select className="field" value={category} onChange={e=>setCategory(e.target.value)}><option>All</option>{[...new Set(state.places.map(p=>p.category))].sort().map(v=><option key={v}>{v}</option>)}</select><select className="field" value={priority} onChange={e=>setPriority(e.target.value)}><option>All</option><option value="must">Must do</option><option value="possible">Possible</option><option value="backup">Backup</option></select></div><label className="toggleLine"><input type="checkbox" checked={showVisited} onChange={e=>setShowVisited(e.target.checked)}/> Show visited places</label></div><div className="grid placeGrid">{filtered.map(place=><PlaceCard key={place.id} place={place} onToggle={()=>toggleVisited(place.id)}/>)}</div>{filtered.length===0&&<div className="empty card">No saved places match those filters.</div>}</section>}
   {tab==='Checklist'&&<section><div className="pageIntro"><div><div className="eyebrow">PACK SMART</div><h2>Nothing important left behind</h2></div><span className="chip">{state.packing.filter(i=>i.done).length}/{state.packing.length} packed</span></div>{[...new Set(state.packing.map(i=>i.category))].map(group=><div key={group} className="listGroup"><h2 className="sectionTitle">{group}</h2><div className="grid">{state.packing.map((item,index)=>item.category===group&&<label className={`card checkCard ${item.done?'done':''}`} key={item.id}><input type="checkbox" checked={item.done} onChange={()=>toggleList('packing',index)}/><div>{item.title}</div></label>)}</div></div>)}</section>}
  </main>
 </>;
}

function ItineraryEditor({item,dayIndex,itemIndex,days,onEdit,onSave,onMove,onReorder,onDelete}:{item:ItineraryItem;dayIndex:number;itemIndex:number;days:TripState['days'];onEdit:(di:number,ii:number,key:EditableKey,value:EditableValue)=>void;onSave:()=>void;onMove:(di:number,ii:number,target:number)=>void;onReorder:(di:number,ii:number,direction:-1|1)=>void;onDelete:(di:number,ii:number)=>void}){
 const [open,setOpen]=useState(false);
 const inferredDuration=estimatedItemDuration(item);
 const fixed=isFixedItem(item);
 const itemType=inferItemType(item);
 return <div className="timelineCopy"><div className="between itinerarySummary"><div><div className="titleRow"><h3>{item.title}</h3><span className={`chip ${fixed?'':'neutral'}`}>{fixed?'Fixed':'Flexible'}</span><span className="chip neutral">{itemType}</span>{item.optional&&<span className="chip neutral">Optional</span>}</div><div className="muted small">{item.time}{item.destination?` · ${item.destination}`:''}{` · ${inferredDuration} min`}</div>{item.details&&<p className="muted small">{item.details}</p>}</div><button className="btn" onClick={()=>setOpen(v=>!v)}>{open?'Close':'Edit'}</button></div>{open&&<div className="itineraryEditPanel"><div className="filterGrid"><label className="small">Time<input className="field" value={item.time} onChange={e=>onEdit(dayIndex,itemIndex,'time',e.target.value)} onBlur={onSave}/></label><label className="small">Title<input className="field" value={item.title} onChange={e=>onEdit(dayIndex,itemIndex,'title',e.target.value)} onBlur={onSave}/></label></div><div className="scheduleFields"><label className="small">Planning status<select className="field" value={fixed?'fixed':'flexible'} onChange={e=>{onEdit(dayIndex,itemIndex,'fixed',e.target.value==='fixed');setTimeout(onSave,0);}}><option value="fixed">Fixed plan</option><option value="flexible">Flexible idea</option></select></label><label className="small">Activity type<select className="field" value={itemType} onChange={e=>{onEdit(dayIndex,itemIndex,'type',e.target.value);setTimeout(onSave,0);}}><option value="reservation">Reservation</option><option value="activity">Activity</option><option value="food">Food</option><option value="travel">Travel</option><option value="hotel">Hotel</option></select></label><label className="small">Duration (minutes)<input className="field" type="number" min="0" step="5" value={item.estimatedDuration??''} placeholder={String(inferredDuration)} onChange={e=>onEdit(dayIndex,itemIndex,'estimatedDuration',e.target.value===''?undefined:Number(e.target.value))} onBlur={onSave}/></label><label className="small">Travel time (minutes)<input className="field" type="number" min="0" step="5" value={item.travelMinutes??''} placeholder="20" onChange={e=>onEdit(dayIndex,itemIndex,'travelMinutes',e.target.value===''?undefined:Number(e.target.value))} onBlur={onSave}/></label><label className="small">Preparation buffer<input className="field" type="number" min="0" step="5" value={item.prepBuffer??''} placeholder="15" onChange={e=>onEdit(dayIndex,itemIndex,'prepBuffer',e.target.value===''?undefined:Number(e.target.value))} onBlur={onSave}/></label></div><p className="muted small planningHint">Travel time and preparation buffer determine the Assistant’s suggested leave time for fixed plans.</p><label className="small">Description<textarea className="field" rows={2} value={item.details??''} onChange={e=>onEdit(dayIndex,itemIndex,'details',e.target.value)} onBlur={onSave}/></label><label className="small">Destination<input className="field" value={item.destination??''} placeholder="St. Lawrence Market" onChange={e=>onEdit(dayIndex,itemIndex,'destination',e.target.value)} onBlur={onSave}/></label><label className="small">Transit instructions<textarea className="field" rows={2} value={item.routeText??''} onChange={e=>onEdit(dayIndex,itemIndex,'routeText',e.target.value)} onBlur={onSave}/></label><div className="filterGrid"><label className="small">Key Info<textarea className="field" rows={3} value={item.keyInfo??item.confirmationNumber??''} onChange={e=>onEdit(dayIndex,itemIndex,'keyInfo',e.target.value)} onBlur={onSave}/></label><label className="small">Notes<textarea className="field" rows={3} value={item.userNotes??''} onChange={e=>onEdit(dayIndex,itemIndex,'userNotes',e.target.value)} onBlur={onSave}/></label></div><label className="toggleLine"><input type="checkbox" checked={Boolean(item.optional)} onChange={e=>{onEdit(dayIndex,itemIndex,'optional',e.target.checked);setTimeout(onSave,0);}}/> Optional stop</label><div className="placeActions"><button className="btn" disabled={itemIndex===0} onClick={()=>onReorder(dayIndex,itemIndex,-1)}>↑ Move up</button><button className="btn" disabled={itemIndex===days[dayIndex].items.length-1} onClick={()=>onReorder(dayIndex,itemIndex,1)}>↓ Move down</button><select className="field" value={dayIndex} onChange={e=>onMove(dayIndex,itemIndex,Number(e.target.value))} aria-label="Move to another day">{days.map((day,index)=><option key={day.date} value={index}>{index===dayIndex?'Move to day…':`${day.label} · ${day.city}`}</option>)}</select><button className="btn" onClick={()=>onDelete(dayIndex,itemIndex)}>Delete</button></div>{item.mapUrl&&<a className="textLink" href={item.mapUrl} target="_blank" rel="noreferrer">Preview transit directions ↗</a>}</div>}</div>;
}

function ItineraryDetails({item,dayIndex,itemIndex,onEdit,onSave}:{item:ItineraryItem;dayIndex:number;itemIndex:number;onEdit:(di:number,ii:number,key:EditableKey,value:EditableValue)=>void;onSave:()=>void}){
 const keyInfo=item.keyInfo??item.confirmationNumber??'';
 return <div className="timelineCopy"><div className="titleRow"><h3>{item.title}</h3>{item.optional&&<span className="chip neutral">Optional</span>}</div>{item.details&&<p className="muted small">{item.details}</p>}<details style={{marginTop:'10px'}}><summary className="textLink" style={{cursor:'pointer'}}>Trip details</summary><div style={{paddingTop:'10px'}}>{item.routeText&&<p className="muted small">🚌 {item.routeText}</p>}{item.mapUrl&&<a className="textLink" href={item.mapUrl} target="_blank" rel="noreferrer">Transit from current location ↗</a>}<div className="filterGrid" style={{marginTop:'12px'}}><label className="small">Key Info<textarea className="field" rows={3} value={keyInfo} placeholder="Confirmation, seat, terminal, ticket details…" onChange={e=>onEdit(dayIndex,itemIndex,'keyInfo',e.target.value)} onBlur={onSave}/></label><label className="small">Notes<textarea className="field" rows={3} value={item.userNotes??''} placeholder="Add reminders or details" onChange={e=>onEdit(dayIndex,itemIndex,'userNotes',e.target.value)} onBlur={onSave}/></label></div></div></details></div>;
}

function formatClock(value:Date){
 return value.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
}

function statusLabel(status:AssistantState['status']){
 if(status==='beforeTrip')return 'Trip preview';
 if(status==='activity')return 'Right now';
 if(status==='leaveSoon')return 'Leave soon';
 if(status==='leaveNow')return 'Ready when you are';
 if(status==='explore')return 'Room to explore';
 if(status==='finished')return 'Open time';
 return 'Plenty of flexibility';
}

function AssistantView({assistant,tripState,onComplete,onVisited,onShowPlaces}:{assistant:AssistantState;tripState:TripState;onComplete:(item:ItineraryItem)=>void;onVisited:(id:string)=>void;onShowPlaces:(place:Place)=>void}){
 const [extraMinutes,setExtraMinutes]=useState<number|null>(null);
 const actionItem=assistant.currentActivity??assistant.nextReservation??assistant.nextItem;
 const fixedItem=assistant.nextReservation;
 const extraSuggestions=useMemo(()=>assistant.currentDay&&extraMinutes?findSuggestionCandidates(tripState,assistant.currentDay,extraMinutes,6):[],[assistant.currentDay,extraMinutes,tripState]);
 const displayedSuggestions:SuggestedPlace[]=extraMinutes?extraSuggestions:assistant.suggestions;
 return <section className="assistantPage">
  <div className={`card assistantHero assistant-${assistant.status}`}>
   <div className="assistantStatus"><span className="assistantPulse"/>{statusLabel(assistant.status)}</div>
   <div className="eyebrow">{assistant.currentDay?`${assistant.currentDay.label} · ${assistant.currentDay.city}`:'SMART TRIP ASSISTANT'}</div>
   <h2>{assistant.headline}</h2>
   <p>{assistant.subheadline}</p>
   {assistant.notices.map((notice,index)=><div className={`assistantNotice notice-${notice.type}`} key={`${notice.type}-${index}`}>{notice.message}</div>)}
   <div className="extraTimeControl">
    <button className="btn" onClick={()=>setExtraMinutes(value=>value?null:60)}>{extraMinutes?'Close extra-time ideas':'I’ve got extra time'}</button>
    {extraMinutes&&<div className="timeChoices" aria-label="Available free time">
     {[30,60,90,120].map(minutes=><button className={extraMinutes===minutes?'active':''} key={minutes} onClick={()=>setExtraMinutes(minutes)}>{minutes<120?`${minutes} min`:'2 hours'}</button>)}
    </div>}
   </div>
  </div>

  {actionItem&&<div className="card assistantAction">
   <div>
    <div className="eyebrow">{assistant.currentActivity?'CURRENT ACTIVITY':fixedItem?'WHAT YOU NEED NEXT':'NEXT IDEA'}</div>
    <h2>{actionItem.title}</h2>
    <div className="muted">{actionItem.time}{actionItem.destination?` · ${actionItem.destination}`:''}</div>
    {actionItem.details&&<p>{actionItem.details}</p>}
    {actionItem.routeText&&<p className="muted small">🚌 {actionItem.routeText}</p>}
    {(actionItem.keyInfo||actionItem.confirmationNumber)&&<div className="keyInfo"><strong>Key Info</strong><p>{actionItem.keyInfo??actionItem.confirmationNumber}</p></div>}
   </div>
   <div className="assistantButtons">
    {actionItem.mapUrl&&<a className="btn primary" href={actionItem.mapUrl} target="_blank" rel="noreferrer">Open transit directions</a>}
    {!actionItem.done&&<button className="btn" onClick={()=>onComplete(actionItem)}>Mark complete</button>}
   </div>
  </div>}

  {assistant.leaveBy&&fixedItem&&<div className="card leaveCard">
   <div><div className="eyebrow">SUGGESTED DEPARTURE</div><strong className="leaveTime">{formatClock(assistant.leaveBy)}</strong><p className="muted">A relaxed estimate with the 15-minute preparation buffer included.</p></div>
   <div className="reservationSummary"><span>Next fixed plan</span><strong>{fixedItem.title}</strong><small>{fixedItem.time}</small></div>
  </div>}

  {displayedSuggestions.length>0&&<section>
   <div className="pageIntro assistantIntro"><div><div className="eyebrow">{extraMinutes?'EXTRA-TIME IDEAS':'GREAT OPTIONS RIGHT NOW'}</div><h2>{extraMinutes?`Good options for about ${extraMinutes} minutes`:'You have time for something nearby'}</h2><p className="muted">These are options, not obligations. Pick whatever sounds good.</p></div><span className="chip">About {extraMinutes??assistant.availableMinutes} min free</span></div>
   <div className="grid assistantGrid">{displayedSuggestions.map(suggestion=><article className="card suggestionCard" key={suggestion.place.id}>
    <div className="between"><span className={`priority priority-${suggestion.place.priority}`}>{suggestion.place.priority==='must'?'Must do':suggestion.place.priority}</span><span className="duration">{suggestion.estimatedDuration} min</span></div>
    <h3>{suggestion.place.name}</h3>
    <div className="muted small">{suggestion.place.category} · {suggestion.place.region}</div>
    {suggestion.place.notes&&<p>{suggestion.place.notes}</p>}
    <div className="whyBox"><strong>Why this fits</strong><ul>{suggestion.reasons.slice(0,3).map(reason=><li key={reason}>{reason}</li>)}</ul></div>
    <div className="placeActions"><a className="btn primary" href={suggestion.place.mapUrl} target="_blank" rel="noreferrer">Directions</a><button className="btn" onClick={()=>onShowPlaces(suggestion.place)}>View details</button><button className="textButton" onClick={()=>onVisited(suggestion.place.id)}>Mark visited</button></div>
   </article>)}</div>
  </section>}

  {extraMinutes&&displayedSuggestions.length===0&&<div className="card assistantEmpty"><div className="assistantEmptyIcon">✦</div><h2>No saved places fit that window yet.</h2><p className="muted">Try a longer time window or browse all saved places.</p></div>}
  {!extraMinutes&&assistant.suggestions.length===0&&!actionItem&&<div className="card assistantEmpty"><div className="assistantEmptyIcon">✦</div><h2>Nothing you need to do right now.</h2><p className="muted">Enjoy the open time. Your itinerary and saved places are still available whenever you want them.</p></div>}
 </section>;
}

function PlaceCard({place,onToggle}:{place:Place;onToggle:()=>void}){
 return <article className={`card placeCard ${place.visited?'visited':''}`}><div className="between"><span className={`priority priority-${place.priority}`}>{place.priority==='must'?'Must do':place.priority}</span><button className="visitedButton" onClick={onToggle}>{place.visited?'✓ Visited':'Mark visited'}</button></div><h3>{place.name}</h3><div className="muted small">{place.region} · {place.category}</div>{place.notes&&<p>{place.notes}</p>}{place.tags.length>0&&<div className="tagRow">{place.tags.slice(0,4).map(tag=><span className="chip neutral" key={tag}>{tag}</span>)}</div>}<div className="placeActions"><a className="btn primary" href={place.mapUrl} target="_blank" rel="noreferrer">Directions</a>{place.menuUrl&&<a className="btn" href={place.menuUrl} target="_blank" rel="noreferrer">Menu</a>}{place.websiteUrl&&<a className="btn" href={place.websiteUrl} target="_blank" rel="noreferrer">Website</a>}</div></article>;
}

'use client';

import {useState} from 'react';
import {formatPrepDueDate,isPrepTask,packingItems,prepDueStatus,prepTasks,suggestedPrepChecklist} from '@/lib/trip-prep';
import type {CheckItem} from '@/lib/types';

type ChecklistView='prep'|'packing';

export default function TripChecklist({items,startDate,onToggle,onUpdate,onAdd,onDelete,onAddSuggested}:{items:CheckItem[];startDate:string;onToggle:(id:string)=>void;onUpdate:(id:string,changes:Partial<CheckItem>,saveNow?:boolean)=>void;onAdd:(item:CheckItem)=>void;onDelete:(id:string)=>void;onAddSuggested:(items:CheckItem[])=>void}){
 const [view,setView]=useState<ChecklistView>('prep');
 const [showAdd,setShowAdd]=useState(false);
 const [title,setTitle]=useState('');
 const [category,setCategory]=useState('Trip preparation');
 const [dueDate,setDueDate]=useState('');
 const [notes,setNotes]=useState('');
 const preparation=prepTasks({packing:items});
 const packing=packingItems({packing:items});
 const visible=view==='prep'?preparation:packing;
 const suggested=suggestedPrepChecklist(startDate,items);
 const complete=visible.filter(item=>item.done).length;

 function chooseView(next:ChecklistView){
  setView(next);
  setCategory(next==='prep'?'Trip preparation':'Travel');
  setDueDate('');
  setShowAdd(false);
 }

 function addItem(){
  const trimmed=title.trim();
  if(!trimmed)return;
  onAdd({id:`check-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,title:trimmed,category:category.trim()||'Other',done:false,notes:notes.trim()||undefined,checklistType:view,dueDate:view==='prep'&&dueDate?dueDate:undefined});
  setTitle('');setNotes('');setDueDate('');setShowAdd(false);
 }

 return <section className="checklistPage">
  <div className="pageIntro"><div><div className="eyebrow">PREP & PACKING</div><h2>Ready without the last-minute scramble</h2><p className="muted">Plan what needs to happen before departure, then keep the packing list separate.</p></div><span className="chip">{complete}/{visible.length} complete</span></div>
  <div className="checklistTabs" role="tablist" aria-label="Checklist views"><button role="tab" aria-selected={view==='prep'} className={view==='prep'?'active':''} onClick={()=>chooseView('prep')}>Before You Go <span>{preparation.filter(item=>!item.done).length}</span></button><button role="tab" aria-selected={view==='packing'} className={view==='packing'?'active':''} onClick={()=>chooseView('packing')}>Packing <span>{packing.filter(item=>!item.done).length}</span></button></div>

  {view==='prep'&&suggested.length>0&&<div className="card prepSuggestions"><div><strong>{preparation.length?'Add any missing preparation steps':'Start with a practical trip-prep list'}</strong><p className="muted small">Five reusable suggestions are timed from this trip’s departure date. You can edit or remove any of them.</p></div><button className="btn" onClick={()=>onAddSuggested(suggested)}>Add {suggested.length} suggestion{suggested.length===1?'':'s'}</button></div>}

  <div className="checklistToolbar"><div>{view==='prep'?<span className="muted small">Due dates are optional. Overdue items rise to the top.</span>:<span className="muted small">Existing checklist items remain in Packing unless you move them.</span>}</div><button className="btn primary" onClick={()=>setShowAdd(current=>!current)}>+ Add {view==='prep'?'task':'item'}</button></div>
  {showAdd&&<div className="card checklistAdd"><label>Task<input className="field" value={title} onChange={event=>setTitle(event.target.value)} placeholder={view==='prep'?'Confirm game-day transportation':'Packable rain jacket'} autoFocus/></label><label>Category<input className="field" value={category} onChange={event=>setCategory(event.target.value)} placeholder="Category"/></label>{view==='prep'&&<label>Due date<input className="field" type="date" value={dueDate} onChange={event=>setDueDate(event.target.value)}/></label>}<label className="checklistNotes">Notes<textarea className="field" rows={2} value={notes} onChange={event=>setNotes(event.target.value)} placeholder="Optional details"/></label><div className="placeActions"><button className="btn" onClick={()=>setShowAdd(false)}>Cancel</button><button className="btn primary" disabled={!title.trim()} onClick={addItem}>Add</button></div></div>}

  {visible.length?<div className={`checklistItems ${view}`}>{visible.toSorted((a,b)=>{
   if(a.done!==b.done)return a.done?1:-1;
   if(view==='prep')return (a.dueDate??'9999-12-31').localeCompare(b.dueDate??'9999-12-31');
   return a.category.localeCompare(b.category)||a.title.localeCompare(b.title);
  }).map(item=>{
   const dueStatus=view==='prep'?prepDueStatus(item):undefined;
   return <article className={`card checklistItem ${item.done?'done':''} ${dueStatus?`due-${dueStatus}`:''}`} key={item.id}>
    <label className="checklistComplete"><input type="checkbox" checked={item.done} onChange={()=>onToggle(item.id)} aria-label={`Mark ${item.title} complete`}/><span/></label>
    <div className="checklistItemCopy"><div className="checklistItemTitle"><h3>{item.title}</h3>{view==='prep'&&<span className={`dueBadge due-${dueStatus}`}>{formatPrepDueDate(item)}</span>}</div><p className="checklistMeta">{item.category}</p>{item.notes&&<p className="muted small">{item.notes}</p>}
     <details className="checklistEdit"><summary>Edit</summary><div className="checklistEditFields"><label>Title<input className="field" value={item.title} onChange={event=>onUpdate(item.id,{title:event.target.value})} onBlur={()=>onUpdate(item.id,{},true)}/></label><label>Category<input className="field" value={item.category} onChange={event=>onUpdate(item.id,{category:event.target.value})} onBlur={()=>onUpdate(item.id,{},true)}/></label>{view==='prep'&&<label>Due date<input className="field" type="date" value={item.dueDate??''} onChange={event=>onUpdate(item.id,{dueDate:event.target.value||undefined},true)}/></label>}<label>List<select className="field" value={isPrepTask(item)?'prep':'packing'} onChange={event=>onUpdate(item.id,{checklistType:event.target.value as ChecklistView,dueDate:event.target.value==='packing'?undefined:item.dueDate},true)}><option value="prep">Before You Go</option><option value="packing">Packing</option></select></label><label className="checklistNotes">Notes<textarea className="field" rows={2} value={item.notes??''} onChange={event=>onUpdate(item.id,{notes:event.target.value})} onBlur={()=>onUpdate(item.id,{},true)}/></label><button className="textButton dangerText" onClick={()=>{if(window.confirm(`Delete “${item.title}”?`))onDelete(item.id);}}>Delete</button></div></details>
    </div>
   </article>;
  })}</div>:<div className="card checklistEmpty"><strong>{view==='prep'?'No preparation tasks yet':'No packing items yet'}</strong><p className="muted small">{view==='prep'?'Add the suggested list or create only the reminders you need.':'Add an item whenever something comes to mind.'}</p></div>}
 </section>;
}

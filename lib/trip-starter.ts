import type {CheckItem,DietaryPreference,ItineraryItemType,Place,TripState} from './types';

export type TripStarterPlace={name:string;category:string;reason:string;priority?:'must'|'possible'|'backup';foodPlace?:boolean};
export type TripStarterAnchor={date:string;title:string;type:ItineraryItemType;note?:string};
export type TripStarterItem={title:string;category:string;notes?:string};
export type TripStarterSuggestion={summary:string;anchors:TripStarterAnchor[];places:TripStarterPlace[];foods:TripStarterItem[];packing:TripStarterItem[];bucket:TripStarterItem[]};
export type TripStarterSelections={anchors?:TripStarterAnchor[];places?:TripStarterPlace[];foods?:TripStarterItem[];packing?:TripStarterItem[];bucket?:TripStarterItem[];dietaryPreferences?:DietaryPreference[]};

function id(prefix:string,index:number){return `${prefix}-${Date.now()}-${index}-${Math.random().toString(36).slice(2,7)}`;}
function checkItem(item:TripStarterItem,index:number,kind:'food'|'packing'|'bucket'):CheckItem{return {id:id(`starter-${kind}`,index),title:item.title.trim(),category:item.category||'Other',notes:item.notes?.trim(),done:false,checklistType:kind==='food'?'bucket':kind,source:'suggested',optional:true,sortOrder:index};}

export function applyTripStarter(state:TripState,starter?:TripStarterSelections):TripState{
 if(!starter)return state;
 const next=structuredClone(state);
 const dayMap=new Map(next.days.map(day=>[day.date,day]));
 (starter.anchors??[]).forEach((anchor,index)=>{const day=dayMap.get(anchor.date);if(!day||!anchor.title.trim())return;day.items.push({id:id('starter-plan',index),time:'Flexible',title:anchor.title.trim(),details:anchor.note?.trim(),done:false,optional:true,fixed:false,type:anchor.type||'activity',estimatedDuration:90});});
 (starter.places??[]).forEach((place,index)=>{if(!place.name.trim())return;const entry:Place={id:id('starter-place',index),name:place.name.trim(),region:next.settings?.destinations||'Trip',category:place.category||'Attraction',notes:place.reason?.trim()||'Smart Trip Starter suggestion — verify details before visiting.',mapUrl:'',menuUrl:'',websiteUrl:'',tags:['Smart starter'],priority:place.priority||'possible',visited:false,foodPlace:Boolean(place.foodPlace),estimatedDuration:90};next.places.push(entry);});
 next.foods.push(...(starter.foods??[]).filter(item=>item.title.trim()).map((item,index)=>checkItem(item,index,'food')));
 next.packing.push(...(starter.packing??[]).filter(item=>item.title.trim()).map((item,index)=>checkItem(item,index,'packing')),...(starter.bucket??[]).filter(item=>item.title.trim()).map((item,index)=>checkItem(item,index,'bucket')));
 if(starter.dietaryPreferences?.length)next.dietaryPreferences=[...new Set([...(next.dietaryPreferences??[]),...starter.dietaryPreferences])];
 return next;
}

export function fallbackTripStarter(input:{destinations:string;startDate:string;endDate:string;pace?:string;interests?:string[]}):TripStarterSuggestion{
 const interests=input.interests??[];const days:string[]=[];for(let d=new Date(`${input.startDate}T12:00:00Z`),end=new Date(`${input.endDate}T12:00:00Z`);d<=end;d.setUTCDate(d.getUTCDate()+1))days.push(d.toISOString().slice(0,10));
 const anchors:TripStarterAnchor[]=days.slice(0,Math.min(days.length,4)).map((date,index)=>({date,title:index===0?'Get oriented in the main neighborhood':interests.includes('food')&&index===1?'Try a signature local food':interests.includes('museums')?'Visit a standout museum or cultural site':'Explore one must-see area',type:index===1&&interests.includes('food')?'food':'activity',note:'Flexible starter idea — choose the exact place and timing later.'}));
 return {summary:`A light ${input.pace||'balanced'} starter for ${input.destinations}, intentionally leaving room to decide as you go.`,anchors,places:[{name:'Main historic or cultural district',category:'Area',reason:'A useful first area to research and save.',priority:'possible'},{name:'Signature local attraction',category:'Attraction',reason:'Pick the landmark or experience that best matches your interests.',priority:'possible'}],foods:[{title:'Signature local specialty',category:'Local food',notes:'Research one locally distinctive dish or snack to try.'},{title:'Favorite neighborhood breakfast or bakery',category:'Breakfast',notes:'Save one convenient local option near your plans.'}],packing:[{title:'Phone charger + portable battery',category:'Tech'},{title:'Comfortable walking shoes',category:'Clothing'},{title:'Weather-appropriate outer layer',category:'Clothing'},{title:'Travel documents / confirmations',category:'Documents'}],bucket:[{title:`Experience something unique to ${input.destinations}`,category:'Experience'},{title:'Try one local specialty food',category:'Food'}]};
}

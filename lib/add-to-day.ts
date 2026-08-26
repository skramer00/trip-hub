import type {GooglePlaceCandidate,ItineraryItem,ItineraryItemType,Place,TripDay} from '@/lib/types';

export function formatTripTime(totalMinutes:number){
 const normalized=((Math.round(totalMinutes/5)*5)%1440+1440)%1440;
 const hour24=Math.floor(normalized/60);
 const minute=normalized%60;
 const suffix=hour24>=12?'PM':'AM';
 const hour=hour24%12||12;
 return `${hour}:${String(minute).padStart(2,'0')} ${suffix}`;
}

export function itineraryTimeMinutes(value:string){
 const match=value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
 if(!match)return undefined;
 let hour=Number(match[1]);
 const minute=Number(match[2]??0);
 const suffix=match[3]?.toUpperCase();
 if(suffix==='PM'&&hour<12)hour+=12;
 if(suffix==='AM'&&hour===12)hour=0;
 if(hour>23||minute>59)return undefined;
 return hour*60+minute;
}

export function suggestedAddTime(day:TripDay){
 const timed=day.items.flatMap(item=>{
  const start=itineraryTimeMinutes(item.time);
  return start===undefined?[]:[start+(item.estimatedDuration??60)+(item.travelMinutes??20)];
 });
 return formatTripTime(timed.length?Math.min(Math.max(...timed),23*60+55):12*60);
}

export function regionForTripDay(day:TripDay){
 if(day.city.includes('Toronto'))return 'Toronto';
 if(day.city.includes('Buffalo')||day.city.includes('Niagara'))return 'Niagara & Buffalo';
 return 'Other';
}

export function inputTimeValue(value:string){
 const minutes=itineraryTimeMinutes(value)??12*60;
 return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
}

export function itemTypeForPlace(place:Pick<Place,'category'|'tags'>):ItineraryItemType{
 const category=`${place.category} ${place.tags.join(' ')}`.toLowerCase();
 if(/restaurant|food|bakery|coffee|cafe|dessert|candy|bar/.test(category))return 'food';
 if(/hotel|lodging/.test(category))return 'hotel';
 if(/transit|station|airport/.test(category))return 'travel';
 return 'activity';
}

export function categoryForGooglePlace(candidate:GooglePlaceCandidate){
 const category=(candidate.category??'').toLowerCase();
 if(/restaurant|food|bakery|coffee|cafe|dessert|candy|bar/.test(category))return 'Food';
 if(/hotel|lodging/.test(category))return 'Hotel';
 if(/transit|station|airport/.test(category))return 'Transit';
 return candidate.category||'Attraction';
}

export function defaultDurationForCategory(category:string){
 const value=category.toLowerCase();
 if(/restaurant|food|bakery|coffee|cafe|dessert|candy|bar/.test(value))return 75;
 if(/hotel|lodging|transit|station|airport/.test(value))return 30;
 return 90;
}

export function itineraryItemFromPlace(place:Place,time:string,optional=false):ItineraryItem{
 const destination=place.formattedAddress||place.name;
 return {
  id:`place-stop-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
  time,title:place.name,details:place.notes,destination,
  mapUrl:`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=transit`,
  routeText:'Open transit directions from your current location.',keyInfo:'',userNotes:'',done:false,
  optional,fixed:false,type:itemTypeForPlace(place),estimatedDuration:place.estimatedDuration??60,
  travelMinutes:20,travelMode:'transit',prepBuffer:15,placeId:place.id
 };
}

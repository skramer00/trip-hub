import type {Place,PlaceHoursInterval,PlaceHoursRange,Weekday} from '@/lib/types';

const WEEKDAYS:Weekday[]=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

type GoogleTimePoint={day?:number;hour?:number;minute?:number};
type GooglePeriod={open?:GoogleTimePoint;close?:GoogleTimePoint};
type GooglePlace={
 id?:string;
 displayName?:{text?:string};
 formattedAddress?:string;
 googleMapsUri?:string;
 websiteUri?:string;
 regularOpeningHours?:{periods?:GooglePeriod[];weekdayDescriptions?:string[]};
};

function clock(point?:GoogleTimePoint){
 if(!point||point.hour===undefined)return undefined;
 return `${String(point.hour).padStart(2,'0')}:${String(point.minute??0).padStart(2,'0')}`;
}

function rangesFromPeriods(periods:GooglePeriod[]=[]){
 const grouped=new Map<Weekday,PlaceHoursInterval[]>();
 for(const period of periods){
  const dayNumber=period.open?.day;
  const open=clock(period.open);
  if(dayNumber===undefined||!open)continue;
  if(!period.close){
   for(const weekday of WEEKDAYS)grouped.set(weekday,[{open:'00:00',close:'24:00'}]);
   continue;
  }
  const day=WEEKDAYS[dayNumber];
  if(!day)continue;
  const close=clock(period.close)??'24:00';
  const closeDayNumber=period.close.day??dayNumber;
  const ranges=grouped.get(day)??[];
  ranges.push({open,close:closeDayNumber===dayNumber?close:'24:00'});
  grouped.set(day,ranges);
  if(closeDayNumber!==dayNumber&&close!=='00:00'){
   const closeDay=WEEKDAYS[closeDayNumber];
   if(closeDay){
    const closeDayRanges=grouped.get(closeDay)??[];
    closeDayRanges.push({open:'00:00',close});
    grouped.set(closeDay,closeDayRanges);
   }
  }
 }
 const result:Partial<Record<Weekday,PlaceHoursRange>>={};
 for(const day of WEEKDAYS){
  const intervals=grouped.get(day);
  result[day]=intervals?.length
   ?{open:intervals[0].open,close:intervals.at(-1)?.close??intervals[0].close,closed:false,intervals}
   :{open:'09:00',close:'17:00',closed:true,intervals:[]};
 }
 return result;
}

function queryFor(place:Place){
 const area=place.region==='Toronto'?'Toronto, Ontario, Canada':'Niagara Falls or Buffalo, New York';
 return `${place.name}, ${area}`;
}

function normalizedWords(value:string){
 return new Set(value.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(word=>word.length>2));
}

function questionableMatch(savedName:string,matchedName:string){
 const saved=normalizedWords(savedName);
 const matched=normalizedWords(matchedName);
 if(!saved.size||!matched.size)return false;
 const overlap=[...saved].filter(word=>matched.has(word)).length;
 return overlap/Math.min(saved.size,matched.size)<0.5;
}

export async function fetchGooglePlace(place:Place){
 const apiKey=process.env.GOOGLE_PLACES_API_KEY;
 if(!apiKey)throw new Error('GOOGLE_PLACES_API_KEY is not configured.');
 const response=await fetch('https://places.googleapis.com/v1/places:searchText',{
  method:'POST',
  headers:{
   'content-type':'application/json',
   'X-Goog-Api-Key':apiKey,
   'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.websiteUri,places.regularOpeningHours',
  },
  body:JSON.stringify({textQuery:queryFor(place),pageSize:1,languageCode:'en'}),
  cache:'no-store',
 });
 if(!response.ok){
  const message=await response.text();
  throw new Error(`Google Places returned ${response.status}: ${message.slice(0,300)}`);
 }
 const result=await response.json() as {places?:GooglePlace[]};
 const match=result.places?.[0];
 if(!match)throw new Error(`Google could not find a match for “${place.name}”.`);
 const matchedName=match.displayName?.text??place.name;
 return {
  matchedName,
  matchWarning:questionableMatch(place.name,matchedName)?`Check this match: Google returned “${matchedName}”.`:undefined,
  googlePlaceId:match.id,
  formattedAddress:match.formattedAddress,
  mapUrl:match.googleMapsUri,
  websiteUrl:match.websiteUri,
  weeklyHours:rangesFromPeriods(match.regularOpeningHours?.periods),
 };
}

import type {Place} from '@/lib/types';

type AreaCenter={
 name:string;
 region:Place['region'];
 latitude:number;
 longitude:number;
 maxDistanceKm:number;
};

export const suggestedAreaNames=[
 'Toronto — Waterfront',
 'Toronto — Downtown / Entertainment',
 'Toronto — St. Lawrence / Distillery',
 'Toronto — Kensington / Chinatown',
 'Toronto — Yorkville / ROM',
 'Toronto — Midtown / Casa Loma',
 'Toronto — West End / Liberty Village',
 'Toronto — East End',
 'Toronto — Islands',
 'Toronto — Pearson Airport',
 'Niagara Falls — Canada',
 'Niagara Falls — New York',
 'Buffalo — Downtown',
 'Buffalo — Elmwood / AKG',
 'Buffalo — Orchard Park',
 'Buffalo — Airport',
] as const;

const centers:AreaCenter[]=[
 {name:'Toronto — Islands',region:'Toronto',latitude:43.6216,longitude:-79.3786,maxDistanceKm:2.4},
 {name:'Toronto — Waterfront',region:'Toronto',latitude:43.6408,longitude:-79.3796,maxDistanceKm:2},
 {name:'Toronto — Downtown / Entertainment',region:'Toronto',latitude:43.6503,longitude:-79.3871,maxDistanceKm:2},
 {name:'Toronto — St. Lawrence / Distillery',region:'Toronto',latitude:43.6513,longitude:-79.3657,maxDistanceKm:2},
 {name:'Toronto — Kensington / Chinatown',region:'Toronto',latitude:43.6546,longitude:-79.4008,maxDistanceKm:1.8},
 {name:'Toronto — Yorkville / ROM',region:'Toronto',latitude:43.6707,longitude:-79.3911,maxDistanceKm:1.8},
 {name:'Toronto — Midtown / Casa Loma',region:'Toronto',latitude:43.678,longitude:-79.4094,maxDistanceKm:2.8},
 {name:'Toronto — West End / Liberty Village',region:'Toronto',latitude:43.6394,longitude:-79.4245,maxDistanceKm:3},
 {name:'Toronto — East End',region:'Toronto',latitude:43.6713,longitude:-79.337,maxDistanceKm:6},
 {name:'Toronto — Pearson Airport',region:'Toronto',latitude:43.6777,longitude:-79.6248,maxDistanceKm:7},
 {name:'Niagara Falls — Canada',region:'Niagara & Buffalo',latitude:43.0896,longitude:-79.0849,maxDistanceKm:12},
 {name:'Niagara Falls — New York',region:'Niagara & Buffalo',latitude:43.0945,longitude:-79.0567,maxDistanceKm:12},
 {name:'Buffalo — Downtown',region:'Niagara & Buffalo',latitude:42.8864,longitude:-78.8784,maxDistanceKm:10},
 {name:'Buffalo — Elmwood / AKG',region:'Niagara & Buffalo',latitude:42.9322,longitude:-78.876,maxDistanceKm:8},
 {name:'Buffalo — Orchard Park',region:'Niagara & Buffalo',latitude:42.7738,longitude:-78.787,maxDistanceKm:12},
 {name:'Buffalo — Airport',region:'Niagara & Buffalo',latitude:42.9405,longitude:-78.7322,maxDistanceKm:8},
];

function distanceKm(from:{latitude:number;longitude:number},to:{latitude:number;longitude:number}){
 const radians=(degrees:number)=>degrees*Math.PI/180;
 const latitudeDelta=radians(to.latitude-from.latitude);
 const longitudeDelta=radians(to.longitude-from.longitude);
 const startLatitude=radians(from.latitude);
 const endLatitude=radians(to.latitude);
 const value=Math.sin(latitudeDelta/2)**2+Math.cos(startLatitude)*Math.cos(endLatitude)*Math.sin(longitudeDelta/2)**2;
 return 6371*2*Math.atan2(Math.sqrt(value),Math.sqrt(1-value));
}

function addressArea(place:Place){
 const text=`${place.name} ${place.formattedAddress??''} ${place.notes}`.toLowerCase();
 if(/pearson|mississauga|etobicoke/.test(text))return 'Toronto — Pearson Airport';
 if(/toronto island|centre island|ward.?s island|hanlan/.test(text))return 'Toronto — Islands';
 if(/orchard park|highmark stadium/.test(text))return 'Buffalo — Orchard Park';
 if(/niagara falls.*\bny\b|niagara falls.*new york|maid of the mist/.test(text))return 'Niagara Falls — New York';
 if(/niagara falls.*\bon\b|niagara falls.*ontario|horseshoe falls|clifton hill|table rock/.test(text))return 'Niagara Falls — Canada';
 if(/\b14127\b/.test(text))return 'Buffalo — Orchard Park';
 if(/\b1420[234]\b/.test(text))return 'Buffalo — Downtown';
 if(/\b1420[19]\b|\b1421[23]\b|\b14222\b/.test(text))return 'Buffalo — Elmwood / AKG';
 if(/\b14225\b|buffalo niagara international airport/.test(text))return 'Buffalo — Airport';
 if(/\b1430[1-5]\b/.test(text))return 'Niagara Falls — New York';
 if(/\bl2[eght]\b/.test(text))return 'Niagara Falls — Canada';
 if(/\bm5j\b/.test(text))return 'Toronto — Waterfront';
 if(/\bm5a\b|\bm5e\b/.test(text))return 'Toronto — St. Lawrence / Distillery';
 if(/\bm5t\b/.test(text))return 'Toronto — Kensington / Chinatown';
 if(/\bm5[rs]\b|\bm4y\b/.test(text))return 'Toronto — Yorkville / ROM';
 if(/\bm5p\b|\bm5n\b|\bm4[prs]\b|\bm6c\b/.test(text))return 'Toronto — Midtown / Casa Loma';
 if(/\bm6[jkgh]\b/.test(text))return 'Toronto — West End / Liberty Village';
 if(/\bm4[jklm]\b/.test(text))return 'Toronto — East End';
 if(/\bm5[bcghklvwx]\b/.test(text))return 'Toronto — Downtown / Entertainment';
 return undefined;
}

export function suggestPlaceArea(place:Place){
 const fromAddress=addressArea(place);
 if(fromAddress)return fromAddress;
 if(!Number.isFinite(place.latitude)||!Number.isFinite(place.longitude))return undefined;
 const location={latitude:place.latitude as number,longitude:place.longitude as number};
 return centers
  .filter(center=>center.region===place.region)
  .map(center=>({center,distance:distanceKm(location,center)}))
  .filter(candidate=>candidate.distance<=candidate.center.maxDistanceKm)
  .sort((a,b)=>a.distance-b.distance)[0]?.center.name;
}

export function areaOptions(places:Place[]){
 return [...new Set([...suggestedAreaNames,...places.map(place=>place.area).filter((area):area is string=>Boolean(area))])].sort();
}

export function areaLabel(area:string){
 return area.split(' — ').at(-1)??area;
}

export type PlaceAreaGroup={area:string;label:string;places:Place[]};

export function groupPlacesByArea(places:Place[]):PlaceAreaGroup[]{
 const groups=new Map<string,Place[]>();
 for(const place of places){
  const area=place.area??suggestPlaceArea(place)??'Unassigned';
  const group=groups.get(area)??[];
  group.push(place);
  groups.set(area,group);
 }
 return [...groups.entries()]
  .map(([area,group])=>({area,label:areaLabel(area),places:[...group].sort((a,b)=>a.name.localeCompare(b.name))}))
  .sort((a,b)=>{
   if(a.area==='Unassigned')return 1;
   if(b.area==='Unassigned')return -1;
   const regionCompare=(a.places[0]?.region??'').localeCompare(b.places[0]?.region??'');
   return regionCompare||a.label.localeCompare(b.label);
  });
}

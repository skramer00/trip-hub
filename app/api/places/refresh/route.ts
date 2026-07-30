import {NextResponse} from 'next/server';
import {fetchGooglePlace} from '@/lib/google-places';
import {loadState,saveState} from '@/lib/db';
import type {Place} from '@/lib/types';

export const runtime='nodejs';
export const maxDuration=60;

export async function POST(request:Request){
 try{
  const {placeId,placeIds,secret}=await request.json() as {placeId?:string;placeIds?:string[];secret?:string};
  const expectedSecret=process.env.PLACES_REFRESH_SECRET;
  if(!expectedSecret)return NextResponse.json({error:'PLACES_REFRESH_SECRET is not configured.'},{status:503});
  if(!secret||secret!==expectedSecret)return NextResponse.json({error:'That refresh password is not correct.'},{status:401});
  const requestedIds=[...new Set(placeIds?.length?placeIds:placeId?[placeId]:[])];
  if(!requestedIds.length)return NextResponse.json({error:'Choose at least one place to refresh.'},{status:400});
  if(requestedIds.length>10)return NextResponse.json({error:'A batch can refresh at most 10 places.'},{status:400});

  const state=await loadState();
  if(!state)return NextResponse.json({error:'The shared trip state is unavailable.'},{status:503});
  const results:{placeId:string;name:string;ok:boolean;matchedName?:string;matchWarning?:string;error?:string}[]=[];
  const updatedPlaces:Place[]=[];
  for(const id of requestedIds){
   const place=state.places.find(candidate=>candidate.id===id);
   if(!place){
    results.push({placeId:id,name:'Unknown place',ok:false,error:'Saved place not found.'});
    continue;
   }
   try{
    const google=await fetchGooglePlace(place);
    if(google.googlePlaceId)place.googlePlaceId=google.googlePlaceId;
    if(google.formattedAddress)place.formattedAddress=google.formattedAddress;
    if(google.mapUrl)place.mapUrl=google.mapUrl;
    if(google.websiteUrl&&!place.websiteUrl)place.websiteUrl=google.websiteUrl;
    place.weeklyHours=google.weeklyHours;
    place.hoursTimeZone=place.region==='Toronto'?'America/Toronto':'America/New_York';
    place.hoursVerifiedAt=new Date().toISOString();
    place.hoursSource='google';
    updatedPlaces.push(place);
    results.push({placeId:id,name:place.name,ok:true,matchedName:google.matchedName,matchWarning:google.matchWarning});
   }catch(error){
    results.push({placeId:id,name:place.name,ok:false,error:error instanceof Error?error.message:'Google refresh failed.'});
   }
  }
  if(updatedPlaces.length)await saveState(state);

  if(placeId&&requestedIds.length===1){
   const first=results[0];
   if(!first.ok)return NextResponse.json({error:first.error},{status:502});
   return NextResponse.json({place:updatedPlaces[0],matchedName:first.matchedName,matchWarning:first.matchWarning});
  }
  return NextResponse.json({places:updatedPlaces,results});
 }catch(error){
  console.error('Google Places refresh failed.',error);
  return NextResponse.json({error:error instanceof Error?error.message:'Unable to refresh this place.'},{status:500});
 }
}

import {NextResponse} from 'next/server';
import {fetchGooglePlace} from '@/lib/google-places';
import {loadState,saveState} from '@/lib/db';

export const runtime='nodejs';

export async function POST(request:Request){
 try{
  const {placeId,secret}=await request.json() as {placeId?:string;secret?:string};
  const expectedSecret=process.env.PLACES_REFRESH_SECRET;
  if(!expectedSecret)return NextResponse.json({error:'PLACES_REFRESH_SECRET is not configured.'},{status:503});
  if(!secret||secret!==expectedSecret)return NextResponse.json({error:'That refresh password is not correct.'},{status:401});
  if(!placeId)return NextResponse.json({error:'Choose a place to refresh.'},{status:400});

  const state=await loadState();
  if(!state)return NextResponse.json({error:'The shared trip state is unavailable.'},{status:503});
  const place=state.places.find(candidate=>candidate.id===placeId);
  if(!place)return NextResponse.json({error:'That saved place could not be found.'},{status:404});

  const google=await fetchGooglePlace(place);
  if(google.googlePlaceId)place.googlePlaceId=google.googlePlaceId;
  if(google.formattedAddress)place.formattedAddress=google.formattedAddress;
  if(google.mapUrl)place.mapUrl=google.mapUrl;
  if(google.websiteUrl&&!place.websiteUrl)place.websiteUrl=google.websiteUrl;
  place.weeklyHours=google.weeklyHours;
  place.hoursTimeZone=place.region==='Toronto'?'America/Toronto':'America/New_York';
  place.hoursVerifiedAt=new Date().toISOString();
  place.hoursSource='google';
  await saveState(state);

  return NextResponse.json({place,matchedName:google.matchedName});
 }catch(error){
  console.error('Google Places refresh failed.',error);
  return NextResponse.json({error:error instanceof Error?error.message:'Unable to refresh this place.'},{status:500});
 }
}

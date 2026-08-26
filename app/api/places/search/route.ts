import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {searchGooglePlaces} from '@/lib/google-places';
import {validToken} from '@/lib/auth';

export const runtime='nodejs';
export const maxDuration=20;

const cache=new Map<string,{expires:number;results:Awaited<ReturnType<typeof searchGooglePlaces>>}>();

async function authorized(secret?:string){
 const token=(await cookies()).get('trip_auth')?.value;
 if(validToken(token))return true;
 const expectedSecret=process.env.PLACES_REFRESH_SECRET;
 return Boolean(expectedSecret&&secret&&secret===expectedSecret);
}

export async function POST(request:Request){
 try{
  const {query,region,secret}=await request.json() as {query?:string;region?:string;secret?:string};
  if(!(await authorized(secret)))return NextResponse.json({error:'Editor access or the Google Places password is required.'},{status:401});
  const cleanQuery=query?.trim()??'';
  if(cleanQuery.length<3)return NextResponse.json({error:'Enter at least three characters.'},{status:400});
  const cleanRegion=['Toronto','Niagara & Buffalo','Other'].includes(region??'')?region!:'Other';
  const key=`${cleanRegion}:${cleanQuery.toLowerCase()}`;
  const cached=cache.get(key);
  if(cached&&cached.expires>Date.now())return NextResponse.json({results:cached.results,cached:true});
  const results=await searchGooglePlaces(cleanQuery,cleanRegion,5);
  if(cache.size>=100)cache.delete(cache.keys().next().value as string);
  cache.set(key,{expires:Date.now()+15*60*1000,results});
  return NextResponse.json({results,cached:false});
 }catch(error){
  console.error('Google Places search failed.',error);
  return NextResponse.json({error:error instanceof Error?error.message:'Unable to search Google Places.'},{status:500});
 }
}

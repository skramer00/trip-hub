import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {validToken} from '@/lib/auth';
import {currentAccount} from '@/lib/account-auth';
import {fallbackTripStarter,type TripStarterSuggestion} from '@/lib/trip-starter';

async function allowed(){return Boolean(await currentAccount())||validToken((await cookies()).get('trip_auth')?.value);}
function clean(value:unknown){return typeof value==='string'?value.trim():'';}
function parseJson(text:string){const fenced=text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]??text;return JSON.parse(fenced.trim());}

export async function POST(req:Request){
 if(!(await allowed()))return NextResponse.json({error:'Sign in to build a trip starter.'},{status:401});
 const body=await req.json() as {destinations?:string;startDate?:string;endDate?:string;pace?:string;interests?:string[];dietaryPreferences?:string[];notes?:string};
 const destinations=clean(body.destinations),startDate=clean(body.startDate),endDate=clean(body.endDate);if(!destinations||!startDate||!endDate)return NextResponse.json({error:'Destination and trip dates are required.'},{status:400});
 const fallback=fallbackTripStarter({destinations,startDate,endDate,pace:clean(body.pace)||'balanced',interests:body.interests??[]});
 const apiKey=process.env.OPENAI_API_KEY;if(!apiKey)return NextResponse.json({starter:fallback,source:'smart-template'});
 try{
  const prompt=`Create a light, review-first starter for a leisure trip. Destination: ${destinations}. Dates: ${startDate} through ${endDate}. Pace: ${clean(body.pace)||'balanced'}. Interests: ${(body.interests??[]).join(', ')||'general sightseeing and local experiences'}. Dietary preferences: ${(body.dietaryPreferences??[]).join(', ')||'none specified'}. Traveler notes: ${clean(body.notes)||'none'}.
Do not over-schedule. Offer options, not a packed day-by-day plan. Suggest at most one flexible anchor on up to 4 trip dates, 4-7 notable places/areas, 3-6 local foods or food experiences, 6-10 broadly useful packing items, and 3-6 bucket-list ideas. Prefer established, distinctive places and experiences, but do not claim current hours, prices, availability, or reservations. Every suggestion will be reviewed by the traveler and later matched to Google Maps.
Return JSON only with this exact shape: {"summary":"...","anchors":[{"date":"YYYY-MM-DD","title":"...","type":"activity|food","note":"..."}],"places":[{"name":"...","category":"Attraction|Museum|Area|Park|Food|Hotel|Other","reason":"...","priority":"must|possible|backup","foodPlace":false}],"foods":[{"title":"...","category":"Local food|Breakfast|Dessert|Meal","notes":"..."}],"packing":[{"title":"...","category":"Documents|Tech|Clothing|Toiletries|Health|Other","notes":"..."}],"bucket":[{"title":"...","category":"Experience|Food|Place","notes":"..."}]}`;
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},body:JSON.stringify({model:process.env.TRIP_STARTER_MODEL||'gpt-5-mini',input:[{role:'user',content:[{type:'input_text',text:prompt}]}],max_output_tokens:2400}),cache:'no-store'});
  if(!response.ok)throw new Error(`OpenAI ${response.status}`);
  const result=await response.json() as {output_text?:string;output?:Array<{content?:Array<{type?:string;text?:string}>}>};
  const text=result.output_text??result.output?.flatMap(item=>item.content??[]).filter(item=>item.type==='output_text').map(item=>item.text??'').join('\n')??'';
  const parsed=parseJson(text) as TripStarterSuggestion;
  if(!parsed?.summary||!Array.isArray(parsed.anchors)||!Array.isArray(parsed.places)||!Array.isArray(parsed.foods)||!Array.isArray(parsed.packing)||!Array.isArray(parsed.bucket))throw new Error('Invalid starter response');
  const dates=new Set(fallback.anchors.map(item=>item.date));parsed.anchors=parsed.anchors.filter(item=>dates.has(item.date)||item.date>=startDate&&item.date<=endDate).slice(0,4);parsed.places=parsed.places.slice(0,7);parsed.foods=parsed.foods.slice(0,6);parsed.packing=parsed.packing.slice(0,10);parsed.bucket=parsed.bucket.slice(0,6);
  return NextResponse.json({starter:parsed,source:'ai'});
 }catch(error){console.error('Smart Trip Starter generation failed.',error);return NextResponse.json({starter:fallback,source:'smart-template',warning:'AI suggestions were unavailable, so Trip Hub created a lightweight starter template instead.'});}
}

import {NextRequest,NextResponse} from 'next/server';
import {weatherKind,weatherSummary} from '@/lib/weather';
import type {DailyWeather,WeatherResponse} from '@/lib/weather';

const LOCATIONS=[
 {city:'Toronto',latitude:43.6532,longitude:-79.3832,timezone:'America/Toronto'},
 {city:'Niagara Falls',latitude:43.0896,longitude:-79.0849,timezone:'America/Toronto'},
 {city:'Buffalo',latitude:42.8864,longitude:-78.8784,timezone:'America/New_York'}
];
function dateKey(date:Date){return date.toISOString().slice(0,10);}

export async function GET(request:NextRequest){
 const requested=request.nextUrl.searchParams.get('date')??dateKey(new Date());
 if(!/^\d{4}-\d{2}-\d{2}$/.test(requested))return NextResponse.json({error:'Use a date in YYYY-MM-DD format.'},{status:400});
 const today=new Date();today.setUTCHours(0,0,0,0);
 const windowEnd=new Date(today);windowEnd.setUTCDate(windowEnd.getUTCDate()+15);
 const response:WeatherResponse={date:requested,generatedAt:new Date().toISOString(),forecastWindowEnd:dateKey(windowEnd),forecasts:[]};
 const requestedDate=new Date(`${requested}T00:00:00Z`);
 if(requestedDate<today||requestedDate>windowEnd){
  response.forecasts=LOCATIONS.map(({city})=>({city,date:requested,status:'unavailable',message:`Forecasts will appear when ${requested} is within the 16-day forecast window.`}));
  return NextResponse.json(response,{headers:{'Cache-Control':'public, s-maxage=21600, stale-while-revalidate=86400'}});
 }
 response.forecasts=await Promise.all(LOCATIONS.map(async location=>{
  try{
   const params=new URLSearchParams({latitude:String(location.latitude),longitude:String(location.longitude),timezone:location.timezone,start_date:requested,end_date:requested,daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max',temperature_unit:'fahrenheit',wind_speed_unit:'mph'});
   const result=await fetch(`https://api.open-meteo.com/v1/forecast?${params}`,{next:{revalidate:3600}});
   if(!result.ok)throw new Error(`Weather service returned ${result.status}`);
   const data=await result.json() as {daily?:{weather_code?:number[];temperature_2m_max?:number[];temperature_2m_min?:number[];precipitation_probability_max?:number[];wind_speed_10m_max?:number[]}};
   const code=data.daily?.weather_code?.[0];
   return {city:location.city,date:requested,status:'available',weatherCode:code,kind:weatherKind(code),summary:weatherSummary(code),temperatureMax:data.daily?.temperature_2m_max?.[0],temperatureMin:data.daily?.temperature_2m_min?.[0],precipitationProbability:data.daily?.precipitation_probability_max?.[0],windSpeedMax:data.daily?.wind_speed_10m_max?.[0]} satisfies DailyWeather;
  }catch(error){return {city:location.city,date:requested,status:'error',message:error instanceof Error?error.message:'Forecast temporarily unavailable.'} satisfies DailyWeather;}
 }));
 return NextResponse.json(response,{headers:{'Cache-Control':'public, s-maxage=3600, stale-while-revalidate=21600'}});
}

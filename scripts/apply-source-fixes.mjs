import fs from 'node:fs';

const path='components/TripApp.tsx';
let source=fs.readFileSync(path,'utf8');

const oldImport="import {resolvedTripSettings,tripDateLabel} from '@/lib/trip-settings';";
const newImport=`${oldImport}\nimport {dateKeyInTimeZone,resolvedTripTimeZone} from '@/lib/timezones';`;
if(!source.includes("from '@/lib/timezones';"))source=source.replace(oldImport,newImport);

const oldActiveDay=`function activeDayIndex(days:TripState['days']){\n const today=new Date();\n const local=\`${'${today.getFullYear()}'}-${'${String(today.getMonth()+1).padStart(2,\'0\')}'}-${'${String(today.getDate()).padStart(2,\'0\')}'}\`;\n const exact=days.findIndex(day=>day.date===local);\n if(exact>=0)return exact;\n const future=days.findIndex(day=>day.date>local);\n return future>=0?future:days.length-1;\n}`;
const newActiveDay=`function activeDayIndex(state:TripState,now=new Date()){\n const days=state.days;\n if(!days.length)return 0;\n const tripDate=dateKeyInTimeZone(now,resolvedTripTimeZone(state.settings));\n const exact=days.findIndex(day=>day.date===tripDate);\n if(exact>=0)return exact;\n const future=days.findIndex(day=>day.date>tripDate);\n return future>=0?future:days.length-1;\n}`;
if(source.includes(oldActiveDay))source=source.replace(oldActiveDay,newActiveDay);

const oldCall="const currentDayIndex=useMemo(()=>(state?activeDayIndex(state.days):0),[state]);";
const newCall="const currentDayIndex=useMemo(()=>(state?activeDayIndex(state,now):0),[state,now]);";
source=source.replace(oldCall,newCall);

if(source.includes(oldCall)||source.includes("function activeDayIndex(days:TripState['days'])")){
 throw new Error('Timezone Today source fix did not apply cleanly.');
}

fs.writeFileSync(path,source);

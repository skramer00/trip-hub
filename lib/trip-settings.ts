import type {TripCoverTheme,TripSettings} from './types';

export const defaultTripSettings:TripSettings={
 version:3,
 title:'Toronto · Niagara · Buffalo',
 destinations:'Toronto, Niagara Falls & Buffalo',
 startDate:'2026-09-24',
 endDate:'2026-10-01',
 publicMessage:'Follow along as we explore Toronto, Niagara Falls, and Buffalo—with a Bills game in the middle.',
 coverTheme:'forest',
 publicSections:['overview','today','recap','explore','food'],
 homeTimeZone:'America/Los_Angeles',
 tripTimeZone:'America/Toronto'
};

export function resolvedTripSettings(settings?:Partial<TripSettings>):TripSettings{
 const savedSections=settings?.publicSections?.length?settings.publicSections:defaultTripSettings.publicSections;
 const publicSections=settings&&Number(settings.version??0)<2&&!savedSections.includes('overview')?['overview' as const,...savedSections]:savedSections;
 return {...defaultTripSettings,...settings,version:3,publicSections};
}

function dateAtNoon(value:string){const [year,month,day]=value.split('-').map(Number);return new Date(year,month-1,day,12);}

export function tripDateLabel(startDate:string,endDate:string){
 const start=dateAtNoon(startDate),end=dateAtNoon(endDate);
 if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime()))return [startDate,endDate].filter(Boolean).join('–');
 const startMonth=start.toLocaleDateString('en-US',{month:'long'}),endMonth=end.toLocaleDateString('en-US',{month:'long'}),year=end.getFullYear();
 return start.getFullYear()===year&&startMonth===endMonth?`${startMonth} ${start.getDate()}–${end.getDate()}, ${year}`:`${startMonth} ${start.getDate()}–${endMonth} ${end.getDate()}, ${year}`;
}

export function coverGradient(theme:TripCoverTheme){
 if(theme==='lake')return 'linear-gradient(135deg,#123b56,#217799)';
 if(theme==='sunset')return 'linear-gradient(135deg,#61334a,#bb6942)';
 return 'linear-gradient(135deg,#103b2a,#176a43)';
}

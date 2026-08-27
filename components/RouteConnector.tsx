import {boardPlace,buildGoogleMapsLeg,routeSegment} from '@/lib/board-planner';
import {formatTripTime} from '@/lib/add-to-day';
import type {DayScheduleConnection} from '@/lib/day-schedule';
import type {ItineraryItem,Place,TravelMode} from '@/lib/types';

const modeLabels:Record<TravelMode,string>={walking:'Walk',transit:'Transit',driving:'Drive'};
const modeIcons:Record<TravelMode,string>={walking:'↟',transit:'▣',driving:'◆'};

function estimateLabel(from:ItineraryItem,to:ItineraryItem,places:Place[]){
 if(to.travelMinutes!==undefined)return `${to.travelMinutes} min`;
 const fromPlace=boardPlace(from,places);
 const toPlace=boardPlace(to,places);
 if(!fromPlace||!toPlace)return 'Time not set';
 const segment=routeSegment(fromPlace,toPlace);
 return segment.travelMinutes?`About ${segment.travelMinutes} min`:segment.label;
}

function timingLabel(timing?:DayScheduleConnection){
 if(!timing||timing.arrivalMinutes===undefined)return undefined;
 const gap=timing.gapMinutes;
 if(gap===undefined)return `Arrive around ${formatTripTime(timing.arrivalMinutes)}`;
 if(gap<0)return `Arrive ${formatTripTime(timing.arrivalMinutes)} · ${Math.abs(gap)} min late`;
 if(gap<15)return `Arrive ${formatTripTime(timing.arrivalMinutes)} · ${gap} min margin`;
 return `Leave ${formatTripTime(timing.departureMinutes!)} · arrive ${formatTripTime(timing.arrivalMinutes)} · ${gap} min free`;
}

export default function RouteConnector({from,to,places,timing,compact=false,editable=false,onModeChange}:{from:ItineraryItem;to:ItineraryItem;places:Place[];timing?:DayScheduleConnection;compact?:boolean;editable?:boolean;onModeChange?:(mode:TravelMode)=>void}){
 if(from.locationNotNeeded||to.locationNotNeeded)return null;
 const mode=to.travelMode??'transit';
 const directions=buildGoogleMapsLeg(from,to,places,mode);
 const scheduleLabel=timingLabel(timing);
 return <div className={`routeConnector ${compact?'compact':''} ${directions?'':'missing'} ${timing?`timing-${timing.status}`:''}`} aria-label={`Route from ${from.title} to ${to.title}`}>
  <span className="routeConnectorLine" aria-hidden="true"/>
  <span className="routeConnectorIcon" aria-hidden="true">{modeIcons[mode]}</span>
  {editable?<label className="routeMode"><span className="srOnly">Travel mode from {from.title} to {to.title}</span><select value={mode} onChange={event=>onModeChange?.(event.target.value as TravelMode)}><option value="walking">Walk</option><option value="transit">Transit</option><option value="driving">Drive</option></select></label>:<strong>{modeLabels[mode]}</strong>}
  <span>{estimateLabel(from,to,places)}</span>
  {scheduleLabel&&<span className="routeTiming">{scheduleLabel}</span>}
  {directions?<a href={directions} target="_blank" rel="noreferrer">Directions ↗</a>:<span className="routeMissing">Add both locations</span>}
 </div>;
}

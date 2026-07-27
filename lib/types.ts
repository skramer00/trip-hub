export type ItineraryItem={id:string,time:string,title:string,details?:string,done:boolean,optional?:boolean,mapUrl?:string};
export type TripDay={date:string,label:string,city:string,items:ItineraryItem[]};
export type CheckItem={id:string,title:string,category:string,done:boolean,notes?:string};
export type Place={id:string,name:string,region:string,category:string,notes:string,mapUrl:string,menuUrl:string,websiteUrl:string,tags:string[],priority:'must'|'possible'|'backup',visited:boolean};
export type TripState={days:TripDay[],foods:CheckItem[],packing:CheckItem[],places:Place[]};

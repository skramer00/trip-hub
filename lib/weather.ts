export type WeatherKind='clear'|'cloudy'|'rain'|'snow'|'storm'|'fog'|'unknown';
export type WeatherPreference='indoor'|'outdoor'|'neutral';

export type DailyWeather={city:string;date:string;status:'available'|'unavailable'|'error';weatherCode?:number;kind?:WeatherKind;summary?:string;temperatureMax?:number;temperatureMin?:number;precipitationProbability?:number;windSpeedMax?:number;message?:string};
export type WeatherResponse={date:string;generatedAt:string;forecastWindowEnd:string;forecasts:DailyWeather[]};

export function weatherKind(code?:number):WeatherKind{
 if(code===undefined)return 'unknown';
 if(code===0)return 'clear';
 if(code<=3)return 'cloudy';
 if(code===45||code===48)return 'fog';
 if((code>=51&&code<=67)||(code>=80&&code<=82))return 'rain';
 if((code>=71&&code<=77)||(code>=85&&code<=86))return 'snow';
 if(code>=95)return 'storm';
 return 'unknown';
}

export function weatherSummary(code?:number){
 const kind=weatherKind(code);
 if(kind==='clear')return 'Clear';
 if(kind==='cloudy')return code===1?'Mostly clear':code===2?'Partly cloudy':'Cloudy';
 if(kind==='fog')return 'Foggy';
 if(kind==='rain')return 'Rain possible';
 if(kind==='snow')return 'Snow possible';
 if(kind==='storm')return 'Thunderstorms possible';
 return 'Forecast available';
}

export function weatherPreference(forecast?:DailyWeather):WeatherPreference{
 if(!forecast||forecast.status!=='available')return 'neutral';
 const wet=['rain','snow','storm'].includes(forecast.kind??'unknown')||(forecast.precipitationProbability??0)>=40;
 const uncomfortable=(forecast.temperatureMax??70)>=86||(forecast.temperatureMax??70)<=48;
 if(wet||uncomfortable)return 'indoor';
 const pleasant=(forecast.precipitationProbability??100)<=20&&['clear','cloudy'].includes(forecast.kind??'unknown')&&(forecast.temperatureMax??0)>=55&&(forecast.temperatureMax??100)<=82;
 return pleasant?'outdoor':'neutral';
}

export function weatherNotice(forecast?:DailyWeather){
 if(!forecast||forecast.status!=='available')return undefined;
 if(['rain','storm'].includes(forecast.kind??'')||(forecast.precipitationProbability??0)>=40)return 'Rain may affect outdoor plans. Indoor options are being prioritized.';
 if(forecast.kind==='snow')return 'Wintry weather may affect outdoor plans. Indoor options are being prioritized.';
 if((forecast.temperatureMax??0)>=86)return 'It may be hot. Indoor options and breaks are being prioritized.';
 if((forecast.temperatureMax??100)<=48)return 'It may be chilly. Warm indoor stops are being prioritized.';
 if(weatherPreference(forecast)==='outdoor')return 'The forecast looks comfortable for waterfront and outdoor stops.';
 return undefined;
}

export function weatherPackingReminders(forecast?:DailyWeather){
 if(!forecast||forecast.status!=='available')return [] as string[];
 const reminders:string[]=[];
 if(['rain','storm'].includes(forecast.kind??'')||(forecast.precipitationProbability??0)>=35)reminders.push('Pack a compact umbrella or rain shell.');
 if(forecast.kind==='snow')reminders.push('Pack warm, water-resistant layers.');
 if((forecast.temperatureMax??0)>=82)reminders.push('Bring water and sun protection.');
 if((forecast.temperatureMin??100)<=52)reminders.push('Bring a light jacket for the morning and evening.');
 if((forecast.windSpeedMax??0)>=25)reminders.push('A wind-resistant outer layer may help near the waterfront.');
 return reminders;
}

export function placeWeatherSetting(value:string){
 const text=value.toLowerCase();
 if(/aquarium|bakery|cafe|coffee|gallery|hall of fame|indoor|library|mall|market|museum|restaurant|shop|shopping|store|theatre|theater/.test(text))return 'indoor' as const;
 if(/beach|falls|ferry|garden|glen|island|lookout|outdoor|park|parkway|patio|trail|waterfront|whirlpool/.test(text))return 'outdoor' as const;
 return 'neutral' as const;
}

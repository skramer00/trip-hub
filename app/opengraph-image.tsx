import {ImageResponse} from 'next/og';
import {loadState} from '@/lib/db';
import {coverGradient,resolvedTripSettings,tripDateLabel} from '@/lib/trip-settings';

export const alt='Trip Hub shared trip';
export const size={width:1200,height:630};
export const contentType='image/png';
export const dynamic='force-dynamic';

export default async function Image(){
 let settings=resolvedTripSettings();
 try{settings=resolvedTripSettings((await loadState())?.settings);}catch{}
 return new ImageResponse(<div style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',justifyContent:'space-between',padding:'72px 78px',background:coverGradient(settings.coverTheme),color:'white'}}><div style={{display:'flex',fontSize:22,fontWeight:800,letterSpacing:5,opacity:.72}}>TRIP HUB</div><div style={{display:'flex',flexDirection:'column'}}><div style={{display:'flex',fontSize:72,fontWeight:850,letterSpacing:-3,lineHeight:1.02,maxWidth:1020}}>{settings.title}</div><div style={{display:'flex',fontSize:31,marginTop:24,opacity:.85}}>{settings.destinations}</div></div><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:25,opacity:.82}}><span>{tripDateLabel(settings.startDate,settings.endDate)}</span><span>Shared travel companion</span></div></div>,size);
}

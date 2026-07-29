import {ImageResponse} from 'next/og';

export const size={width:512,height:512};
export const contentType='image/png';

export default function Icon(){
 return new ImageResponse(
  <div style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'linear-gradient(145deg, #103b2a, #176a43)',color:'white',fontFamily:'sans-serif'}}>
   <div style={{fontSize:178,fontWeight:800,letterSpacing:-16,lineHeight:1}}>TH</div>
   <div style={{fontSize:44,fontWeight:700,letterSpacing:8,marginTop:24}}>TRIP HUB</div>
  </div>,
  {...size},
 );
}

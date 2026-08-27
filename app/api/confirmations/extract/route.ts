import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {validToken} from '@/lib/auth';

export const runtime='nodejs';
export const maxDuration=30;

async function editorRequest(){return validToken((await cookies()).get('trip_auth')?.value);}

export async function POST(request:Request){
 if(!(await editorRequest()))return NextResponse.json({error:'Editor access required.'},{status:401});
 try{
  const form=await request.formData();
  const file=form.get('file');
  if(!(file instanceof File))return NextResponse.json({error:'Choose a confirmation file.'},{status:400});
  if(file.size>10*1024*1024)return NextResponse.json({error:'Confirmation files must be under 10 MB.'},{status:413});
  const mime=file.type.toLowerCase();
  const isPdf=mime==='application/pdf'||file.name.toLowerCase().endsWith('.pdf');
  const isImage=mime.startsWith('image/');
  if(!isPdf&&!isImage)return NextResponse.json({error:'This extractor accepts PDF or image confirmations.'},{status:400});
  const apiKey=process.env.OPENAI_API_KEY;
  if(!apiKey)return NextResponse.json({error:'PDF/image extraction is not configured yet. Add OPENAI_API_KEY in Vercel to enable it.'},{status:503});
  const base64=Buffer.from(await file.arrayBuffer()).toString('base64');
  const dataUrl=`data:${isPdf?'application/pdf':mime};base64,${base64}`;
  const content:any[]=isPdf
   ?[{type:'input_file',filename:file.name,file_data:dataUrl},{type:'input_text',text:'Extract the useful travel confirmation text from this document. Preserve dates, times, flight/train numbers, hotel/restaurant/venue names, addresses, confirmation or booking numbers, and concise reservation details. Return plain text only. Do not infer missing facts.'}]
   :[{type:'input_image',image_url:dataUrl,detail:'high'},{type:'input_text',text:'Extract the useful travel confirmation text visible in this image. Preserve dates, times, flight/train numbers, hotel/restaurant/venue names, addresses, confirmation or booking numbers, and concise reservation details. Return plain text only. Do not infer missing facts.'}];
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},body:JSON.stringify({model:process.env.CONFIRMATION_EXTRACTION_MODEL||'gpt-5-mini',input:[{role:'user',content}],max_output_tokens:1800}),cache:'no-store'});
  if(!response.ok){const detail=await response.text();console.error('Confirmation extraction failed',response.status,detail.slice(0,500));return NextResponse.json({error:'Could not read that confirmation file.'},{status:502});}
  const result=await response.json() as {output_text?:string;output?:Array<{content?:Array<{type?:string;text?:string}>}>};
  const text=result.output_text??result.output?.flatMap(item=>item.content??[]).filter(item=>item.type==='output_text').map(item=>item.text??'').join('\n')??'';
  if(!text.trim())return NextResponse.json({error:'No readable confirmation details were found.'},{status:422});
  return NextResponse.json({text:text.trim(),fileName:file.name});
 }catch(error){console.error('Confirmation extraction failed.',error);return NextResponse.json({error:'Unable to extract this confirmation right now.'},{status:500});}
}

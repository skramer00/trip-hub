import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {editorPassword,tokenForPassword,validToken} from '@/lib/auth';
export async function GET(){const token=(await cookies()).get('trip_auth')?.value;return NextResponse.json({editor:validToken(token),legacyRecovery:true});}
export async function POST(req:Request){const {password}=await req.json();const expected=editorPassword();if(!expected||password!==expected)return NextResponse.json({error:'Incorrect legacy owner PIN'},{status:401});const res=NextResponse.json({ok:true,editor:true,legacyRecovery:true});res.cookies.set('trip_auth',tokenForPassword(password),{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:60*60,path:'/'});return res}
export async function DELETE(){const res=NextResponse.json({ok:true});res.cookies.set('trip_auth','',{maxAge:0,path:'/'});return res}

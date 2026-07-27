import {NextResponse} from 'next/server';
import {tokenForPassword} from '@/lib/auth';
export async function POST(req:Request){const {password}=await req.json();if(password!==(process.env.TRIP_PASSWORD||'trip'))return NextResponse.json({error:'Incorrect password'},{status:401});const res=NextResponse.json({ok:true});res.cookies.set('trip_auth',tokenForPassword(password),{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:60*60*24*90,path:'/'});return res}
export async function DELETE(){const res=NextResponse.json({ok:true});res.cookies.set('trip_auth','',{maxAge:0,path:'/'});return res}

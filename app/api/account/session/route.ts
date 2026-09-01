import {NextResponse} from 'next/server';
import {accountCookieName,accountToken,claimPendingInvites,currentAccount,membershipsForUser,verifySupabaseAccessToken} from '@/lib/account-auth';

export async function GET(){const account=await currentAccount();if(!account)return NextResponse.json({account:null,memberships:[]});try{return NextResponse.json({account:{id:account.id,email:account.email,name:account.name},memberships:await membershipsForUser(account.id)});}catch{return NextResponse.json({account:{id:account.id,email:account.email,name:account.name},memberships:[]});}}
export async function POST(req:Request){
 const {accessToken}=await req.json() as {accessToken?:string};if(!accessToken)return NextResponse.json({error:'Access token required.'},{status:400});
 const identity=await verifySupabaseAccessToken(accessToken);if(!identity)return NextResponse.json({error:'Supabase session is invalid.'},{status:401});
 await claimPendingInvites(identity);
 const res=NextResponse.json({ok:true,account:identity});
 res.cookies.set(accountCookieName,accountToken(identity),{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:60*60*24*30,path:'/'});
 return res;
}
export async function DELETE(){const res=NextResponse.json({ok:true});res.cookies.set(accountCookieName,'',{maxAge:0,path:'/'});return res;}

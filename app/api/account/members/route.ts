import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {validToken} from '@/lib/auth';
import {accountIsOwner,accountRoleForTrip,accountStorageTripId,currentAccount,ensureTripAccessRow} from '@/lib/account-auth';
import {db} from '@/lib/db';
import {normalizeTripId} from '@/lib/trips';

export async function GET(req:Request){
 const tripId=normalizeTripId(new URL(req.url).searchParams.get('tripId')??'');const account=await currentAccount();if(!account)return NextResponse.json({account:null,role:null,members:[],invitations:[]});
 const role=await accountRoleForTrip(account.id,tripId);const owner=role==='owner';if(!role)return NextResponse.json({account:{id:account.id,email:account.email,name:account.name},role:null,members:[],invitations:[]});
 const stored=accountStorageTripId(tripId);const client=db();const {data:rows}=await client.from('trip_members').select('user_id,role,created_at').eq('trip_id',stored).order('created_at');
 const members=await Promise.all((rows??[]).map(async row=>{const {data}=await client.auth.admin.getUserById(row.user_id);const user=data.user;return {userId:row.user_id,email:user?.email??'',name:(user?.user_metadata?.full_name??user?.user_metadata?.name??'') as string,role:row.role};}));
 let invitations:any[]=[];if(owner){const {data}=await client.from('trip_invitations').select('id,email,role,expires_at,accepted_at,created_at').eq('trip_id',stored).order('created_at',{ascending:false}).limit(20);invitations=data??[];}
 return NextResponse.json({account:{id:account.id,email:account.email,name:account.name},role,members,invitations});
}

export async function POST(req:Request){
 const body=await req.json() as {tripId?:string;action?:string;userId?:string;role?:'owner'|'editor'|'viewer'};const tripId=normalizeTripId(body.tripId??'');const account=await currentAccount();if(!account)return NextResponse.json({error:'Sign in first.'},{status:401});
 if(body.action==='claim_owner'){
  const master=validToken((await cookies()).get('trip_auth')?.value);if(!master)return NextResponse.json({error:'Unlock with the owner PIN before claiming ownership.'},{status:403});
  const stored=await ensureTripAccessRow(tripId);const {error}=await db().from('trip_members').upsert({trip_id:stored,user_id:account.id,role:'owner'},{onConflict:'trip_id,user_id'});if(error)throw error;return NextResponse.json({ok:true,role:'owner'});
 }
 if(!(await accountIsOwner(tripId)))return NextResponse.json({error:'Trip owner access required.'},{status:403});
 if(body.action==='set_role'&&body.userId&&body.role){const stored=accountStorageTripId(tripId);if(body.userId===account.id&&body.role!=='owner')return NextResponse.json({error:'Transfer ownership before changing your own owner role.'},{status:400});const {error}=await db().from('trip_members').update({role:body.role}).eq('trip_id',stored).eq('user_id',body.userId);if(error)throw error;return NextResponse.json({ok:true});}
 return NextResponse.json({error:'Unsupported membership action.'},{status:400});
}

export async function DELETE(req:Request){const url=new URL(req.url);const tripId=normalizeTripId(url.searchParams.get('tripId')??'');const userId=url.searchParams.get('userId');const account=await currentAccount();if(!account||!(await accountIsOwner(tripId)))return NextResponse.json({error:'Trip owner access required.'},{status:403});if(!userId)return NextResponse.json({error:'Member required.'},{status:400});if(userId===account.id)return NextResponse.json({error:'The active owner cannot remove themselves.'},{status:400});const {error}=await db().from('trip_members').delete().eq('trip_id',accountStorageTripId(tripId)).eq('user_id',userId);if(error)throw error;return NextResponse.json({ok:true});}

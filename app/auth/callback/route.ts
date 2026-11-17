import { NextResponse } from 'next/server';
import { baseUrl,demoMode,validToken } from '@/lib/server/config';
import { nextPath } from '@/lib/server/http';
import { linkAccount } from '@/lib/server/live';
import { sessionClient } from '@/lib/server/supabase';
export async function GET(req:Request){
  const url=new URL(req.url), origin=baseUrl(req);const invite=url.searchParams.get('invite')||undefined;
  if(demoMode())return NextResponse.redirect(new URL('/',origin));
  const c=await sessionClient();
  try{
    const code=url.searchParams.get('code'), hash=url.searchParams.get('token_hash');
    if(invite&&!validToken(invite))throw new Error('Convite inválido');
    if(code){const res=await c.auth.exchangeCodeForSession(code);if(res.error)throw res.error;}
    else if(hash&&url.searchParams.get('type')==='email'){const res=await c.auth.verifyOtp({type:'email',token_hash:hash});if(res.error)throw res.error;}
    else throw new Error('Link inválido');
    await linkAccount(c,invite);return NextResponse.redirect(new URL(nextPath(url.searchParams.get('next')),origin));
  }catch{
    await c.auth.signOut({scope:'local'}).catch(()=>{});
    const failure=new URL('/entrar',origin);failure.searchParams.set('erro',invite?'convite':'acesso');return NextResponse.redirect(failure);
  }
}

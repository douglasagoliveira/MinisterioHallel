import { after } from 'next/server';
import { response } from '@/lib/validation';
import { AppError,demoMode,sameOrigin } from '@/lib/server/config';
import { demoGuest,demoGuestRespond } from '@/lib/server/demo';
import { body,errorResponse,json } from '@/lib/server/http';
import { drainMail,liveGuest } from '@/lib/server/live';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(_req:Request,{params}:{params:Promise<{token:string}>}){try{
  const {token}=await params;return json(await (demoMode()?demoGuest(token):liveGuest(token)));
}catch(e){return errorResponse(e);}}
export async function POST(req:Request,{params}:{params:Promise<{token:string}>}){try{
  sameOrigin(req);const parsed=response.safeParse(await body(req,10000));if(!parsed.success)throw new AppError('Confira sua resposta e tente novamente.');
  const {token}=await params;const p=parsed.data;const demo=demoMode();const guest=await (demo?demoGuestRespond(token,p):liveGuest(token,p));
  if(!demo&&p.status==='declined')after(async()=>{try{await drainMail(10);}catch{console.error('Hallel: recusa na fila de e-mail.');}});
  return json(guest);
}catch(e){return errorResponse(e);}}

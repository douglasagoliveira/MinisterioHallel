import { z } from 'zod';
import { AppError,demoMode } from '@/lib/server/config';
import { demoPdfRead } from '@/lib/server/demo';
import { errorResponse,modeFrom } from '@/lib/server/http';
import { livePdfUrl } from '@/lib/server/live';
export const dynamic='force-dynamic';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{
  const {id}=await params;if(!z.uuid().safeParse(id).success)throw new AppError('Arquivo não encontrado.',404);
  if(demoMode())return new Response(new Uint8Array(await demoPdfRead(modeFrom(req),id)),{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="musica-hallel.pdf"','Cache-Control':'private, no-store','Content-Security-Policy':"sandbox; default-src 'none'"}});
  return new Response(null,{status:302,headers:{location:await livePdfUrl(id),'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
}catch(e){return errorResponse(e);}}

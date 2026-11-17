import { AppError,demoMode,needed,secureEqual } from '@/lib/server/config';
import { errorResponse,json } from '@/lib/server/http';
import { drainMail,liveQueueReminders } from '@/lib/server/live';
export const maxDuration=60;
export async function POST(req:Request){try{
  if(demoMode())throw new AppError('Tarefa indisponível na demonstração.',404);
  if(!secureEqual(req.headers.get('authorization')||'',`Bearer ${needed('HALLEL_CRON_SECRET')}`))throw new AppError('Não autorizado.',401);
  const queued=new URL(req.url).searchParams.get('task')==='mail'?0:await liveQueueReminders();const delivery=await drainMail(14);
  return json({queued,...delivery},delivery.configuration?200:503);
}catch(e){return errorResponse(e);}}

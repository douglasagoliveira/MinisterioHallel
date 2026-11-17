import { after } from 'next/server';
import { parseCommand, type Command } from '@/lib/validation';
import { AppError,baseUrl,demoMode,sameOrigin } from '@/lib/server/config';
import { demoCommand,demoPdfRemove } from '@/lib/server/demo';
import { body,errorResponse,json,modeFrom } from '@/lib/server/http';
import { drainMail,liveCommand } from '@/lib/server/live';
export const maxDuration=60;
export async function POST(req:Request){try{
  sameOrigin(req);const raw=await body(req);let c:Command;
  try{c=parseCommand(raw);}catch(e){throw new AppError((e as Error).message);}
  const demo=demoMode();const origin=baseUrl(req);
  const result=demo?await demoCommand(modeFrom(req),c,origin):await liveCommand(c,origin);
  if(demo&&c.action==='songFileDelete')await demoPdfRemove(c.p.id);
  if(!demo&&['scheduleSave','schedulePublish','scheduleReplace','scheduleRespond','profilesImport','noticePublish','inviteCreate'].includes(c.action))after(async()=>{try{await drainMail(14);}catch{console.error('Hallel: a fila de e-mail será retomada pelo cron.');}});
  return json(result);
}catch(e){return errorResponse(e);}}

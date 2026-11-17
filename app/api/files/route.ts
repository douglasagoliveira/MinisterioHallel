import { z } from 'zod';
import { AppError,demoMode,sameOrigin } from '@/lib/server/config';
import { demoPdfSave } from '@/lib/server/demo';
import { errorResponse,json,modeFrom } from '@/lib/server/http';
import { livePdfSave } from '@/lib/server/live';
const limit=4*1024*1024;
export async function POST(req:Request){try{
  sameOrigin(req);if(Number(req.headers.get('content-length'))>limit+16384)throw new AppError('O PDF deve ter até 4 MB.',413);
  if(!req.headers.get('content-type')?.startsWith('multipart/form-data'))throw new AppError('Selecione um arquivo PDF.');
  const data=await req.formData().catch(()=>null);const f=data?.get('file');const song=z.uuid().safeParse(data?.get('song_id'));const label=String(data?.get('label')||'Cifra em PDF').trim().slice(0,100)||'Cifra em PDF';
  if(!(f instanceof File)||f.type!=='application/pdf'||!song.success)throw new AppError('Selecione um PDF válido para a música.');
  if(f.size>limit)throw new AppError('O PDF deve ter até 4 MB.',413);
  const bytes=Buffer.from(await f.arrayBuffer());if(bytes.subarray(0,5).toString()!=='%PDF-'||!bytes.subarray(-1024).includes(Buffer.from('%%EOF')))throw new AppError('O arquivo não parece ser um PDF válido.');
  return json(await (demoMode()?demoPdfSave(modeFrom(req),song.data,label,bytes):livePdfSave(song.data,label,bytes)),201);
}catch(e){return errorResponse(e);}}

import { AppError } from './config';
export const modeFrom=(req:Request)=>new URL(req.url).searchParams.get('view');
export const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export function errorResponse(e:unknown){if(e instanceof AppError)return json({error:e.message},e.status);console.error('Hallel: falha interna',e instanceof Error?e.name:'erro');return json({error:'Não foi possível concluir. Tente novamente.'},500);}
export async function body(req:Request,limit=600000){
  if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new AppError('Envie os dados como JSON.',415);
  if(Number(req.headers.get('content-length'))>limit)throw new AppError('O pedido é muito grande.',413);
  const reader=req.body?.getReader();if(!reader)throw new AppError('Preencha os dados.');const decoder=new TextDecoder();let raw='',bytes=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>limit){await reader.cancel();throw new AppError('O pedido é muito grande.',413);}raw+=decoder.decode(value,{stream:true});}return JSON.parse(raw+decoder.decode());}catch(e){if(e instanceof AppError)throw e;throw new AppError('Os dados enviados não são válidos.');}
}
export function nextPath(value:unknown){return typeof value==='string'&&/^\/(?:$|escalas(?:\/[0-9a-f-]{36})?$|(?:musicas|avisos|minhas-escalas|disponibilidade|membros|administradores|configuracoes)$)/.test(value)?value:'/';}

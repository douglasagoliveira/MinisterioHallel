import { demoMode } from '@/lib/server/config';
import { demoView } from '@/lib/server/demo';
import { errorResponse,json,modeFrom } from '@/lib/server/http';
import { liveView } from '@/lib/server/live';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{return json(await (demoMode()?demoView(modeFrom(req)):liveView()));}catch(e){return errorResponse(e);}}

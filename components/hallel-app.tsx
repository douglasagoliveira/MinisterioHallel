'use client';
import { useEffect,useState } from 'react';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { usePathname,useRouter,useSearchParams } from 'next/navigation';
import { CalendarDays, CircleAlert, LoaderCircle } from 'lucide-react';
import { ApiError,OpsContext,post,request,type Ops } from '@/lib/client';
import { manageBand,type Outcome,type View } from '@/lib/model';
import type { Action,Input } from '@/lib/validation';
import { useToast } from './providers';
import { Shell } from './shell';
import { Brand,Button,Empty } from './ui/primitives';
import { Dashboard } from './dashboard';
import { ScheduleDetail,ScheduleEditor,Schedules } from './schedules';
import { People } from './people';
import { Library } from './library';
import { Notices } from './notices';
import { Admin,Settings } from './settings';
import { Availability,MemberHome } from './member';

export function HallelApp({area}:{area:string}){
 const search=useSearchParams(),router=useRouter(),pathname=usePathname(),qc=useQueryClient(),toast=useToast();
 const reqMode=search.get('view')==='member'?'member':search.get('view')==='leader'?'leader':'';
 const qs=reqMode?`?view=${reqMode}`:'';const key=['hallel-state',reqMode];
 const query=useQuery({queryKey:key,queryFn:()=>request<View>(`/api/state${qs}`)});
 const [band,updateBand]=useState('');const [busy,setBusy]=useState(false);
 const v=query.data;
 useEffect(()=>{if(query.error instanceof ApiError&&query.error.status===401)router.replace(`/entrar?next=${encodeURIComponent(pathname)}`);},[query.error,router,pathname]);
 const viewMode=(v?.demo?reqMode:'');const href=(url:string)=>viewMode?`${url}${url.includes('?')?'&':'?'}view=${viewMode}`:url;
 const go=(url:string)=>router.push(href(url));
 const refetch=async()=>{await qc.invalidateQueries({queryKey:['hallel-state']});};
 async function run<K extends Action>(action:K,payload:Input<K>,success?:string){
  setBusy(true);try{const result=await post<Outcome>(`/api/actions${qs}`,{action,payload});if(action!=='scheduleLinks')await refetch();if(success)toast(success);return result;}
  catch(e){toast(e instanceof Error?e.message:'Não foi possível salvar.','error');return undefined;}finally{setBusy(false);}
 }
 useEffect(()=>{updateBand('');},[reqMode]);
 if(!v){if(query.error&&!(query.error instanceof ApiError&&query.error.status===401))return <div className="loading-screen"><Brand/><Empty icon={CircleAlert} title="Não foi possível abrir o Hallel" description={query.error.message} action={<Button onClick={()=>query.refetch()}>Tentar novamente</Button>}/></div>;
 return <div className="loading-screen" role="status"><Brand/><p><LoaderCircle className="spin" size={17}/> Carregando o Hallel…</p></div>;}
 const ops:Ops={v,band:v.bands.some(b=>b.id===band&&manageBand(v,b.id))?band:'',setBand:updateBand,viewMode,href,go,run,busy,refetch,toast};
 const parts=area.split('/'),base=parts[0],id=parts[1],section=parts[2];const member=v.viewer.role==='member';
 let page;
 switch(base){
  case '':page=member?<MemberHome/>:<Dashboard/>;break;
  case 'minhas-escalas':page=<MemberHome/>;break;
  case 'escalas':
   page=id==='nova'&&!member?<ScheduleEditor/>:id&&section==='editar'&&!member?<ScheduleEditor id={id}/>:id?<ScheduleDetail id={id}/>:member?<MemberHome/>:<Schedules key={`${search.get('status')||''}/${search.get('periodo')||''}`}/>;break;
  case 'membros':page=member?null:<People key={search.get('perfil')||'lista'}/>;break;
  case 'musicas':page=<Library id={id}/>;break;
  case 'avisos':page=<Notices id={id}/>;break;
  case 'administradores':page=v.viewer.role==='admin'?<Admin/>:null;break;
  case 'configuracoes':page=<Settings/>;break;
  case 'disponibilidade':page=<Availability/>;break;
 }
 return <OpsContext.Provider value={ops}><Shell area={area}>{page||<Empty icon={CalendarDays} title="Esta área não está disponível" description="Volte ao início para continuar." action={<Button onClick={()=>go('/')}>Voltar ao início</Button>}/>}</Shell></OpsContext.Provider>;
}

import { randomUUID } from 'node:crypto';
import { dateAndTime } from '../dates';
import type { Audit, Band, BandMember, Guest, Invite, Organization, OrgRole, OrgMember, Outcome, Profile, Schedule, ScheduleMember, ScheduleSong, Song, SongFile, Unavailable, Announcement, View } from '../model';
import { parseResponseNote, type Command, type Parsed } from '../validation';
import { AppError, needed, orgSlug, sha, tokenFor, validToken } from './config';
import { fail, serviceClient, sessionClient, type Client } from './supabase';

type Actor={client:Client,org:Organization,viewer:View['viewer']};
export async function liveActor():Promise<Actor>{
  const client=await sessionClient();
  const {data:{user}}=await client.auth.getUser();if(!user)throw new AppError('Entre para continuar.',401);
  const {data:org,error}=await client.from('organizations').select('id,name,slug,default_confirm_hours').eq('slug',orgSlug()).maybeSingle();fail(error);
  if(!org)throw new AppError('Seu perfil ainda não tem acesso ao Hallel.',401);
  const who=await client.rpc('h_viewer',{o:org.id});fail(who.error); if(!who.data)throw new AppError('Seu acesso não está ativo.',401);
  const me=await client.from('profiles').select('id,full_name').eq('id',who.data).single(); fail(me.error);
  const rr=await client.from('org_members').select('org_role').eq('organization_id',org.id).eq('profile_id',who.data).single();fail(rr.error);
  const role=rr.data?.org_role as OrgRole; if(!me.data||!role)throw new AppError('Seu acesso não está ativo.',401);
  return {client,org:{...org,email_sender:null},viewer:{id:me.data.id,name:me.data.full_name,role}};
}
async function rows<T>(c:Client,o:string,t:string,columns:string):Promise<T[]>{
  const result:T[]=[]; const n=500;
  for(let i=0;;i+=n){const {data,error}=await c.from(t).select(columns).eq('organization_id',o).order('id').range(i,i+n-1);fail(error); const pile=(data||[]) as unknown as T[];result.push(...pile);if(pile.length<n)break;}
  return result;
}
async function rpc<T>(c:Client,name:string,params?:Record<string,unknown>):Promise<T>{const {data,error}=await c.rpc(name,params);fail(error);return data as T;}
const mapById=<T extends {id:string}>(xs:T[])=>new Map(xs.map(x=>[x.id,x]));
export async function liveView():Promise<View>{
  const {client:c,org,viewer}=await liveActor();const o=org.id;const admin=viewer.role==='admin';
  const [bands,profiles,orgMembers,bandMembers,schedules,scheduleMembers,songs,songFiles,scheduleSongs,unavailable,announcements,invites,audit,contacts,replies,reasons,sender]=await Promise.all([
    rows<Band>(c,o,'bands','id,name,description'),rows<Profile>(c,o,'profiles','id,full_name,status'),rows<OrgMember>(c,o,'org_members','id,profile_id,org_role'),rows<BandMember>(c,o,'band_members','id,band_id,profile_id,instrument_role,band_role'),
    rows<Schedule>(c,o,'schedules','id,band_id,title,event_date,starts_at,location,notes,status,confirm_deadline,duplicated_from,published_at,reminder_sent_at,created_by'),
    rows<ScheduleMember>(c,o,'schedule_members','id,schedule_id,profile_id,instrument_role,status,responded_at,replaced_by'),rows<Song>(c,o,'songs','id,title,key,bpm,author,category,notes'),rows<SongFile>(c,o,'song_files','id,song_id,kind,label,url'),rows<ScheduleSong>(c,o,'schedule_songs','id,schedule_id,song_id,position,notes'),
    rows<Unavailable>(c,o,'unavailability','id,profile_id,date'),rows<Announcement>(c,o,'announcements','id,band_id,title,body,status,send_email,published_at,expires_at,created_by,created_at'),
    admin?rows<Invite>(c,o,'admin_invites','id,email,org_role,expires_at,accepted_at,revoked_at'):[],admin?rows<Audit>(c,o,'audit_log','id,actor_profile_id,action,entity,entity_id,created_at'):[],
    rpc<(Partial<Profile>&{id:string})[]>(c,'hallel_contacts',{o}),rpc<Pick<ScheduleMember,'id'|'decline_note'|'responded_by'>[]>(c,'hallel_private_responses',{o}),rpc<Pick<Unavailable,'id'|'reason'>[]>(c,'hallel_reasons',{o}),admin?rpc<string|null>(c,'hallel_sender',{o}):null,
  ]);
  const cm=mapById(contacts as (Partial<Profile>&{id:string})[]), rm=mapById(replies), um=mapById(reasons);
  return {demo:false,org:{...org,email_sender:sender},viewer,bands,profiles:profiles.map(p=>({...p,...cm.get(p.id)})),orgMembers,bandMembers,schedules,scheduleMembers:scheduleMembers.map(r=>({...r,decline_note:null,responded_by:null,...rm.get(r.id)})),songs,songFiles,scheduleSongs,unavailable:unavailable.map(e=>({...e,reason:null,...um.get(e.id)})),announcements,invites,audit};
}
type LinkRow = {id:string;full_name:string;link_version:number;title:string;starts_at:string;confirm_deadline:string};
const scheduleToken=(id:string,version:number)=>tokenFor('schedule',`${id}:${version}`);
async function issue(c:Client,o:string,id:string,origin:string,flags:{pending:boolean;member?:string}){
  const rows=await rpc<LinkRow[]>(c,'hallel_links',{o,sid:id,mid:flags.member||null,pending_only:flags.pending});
  if(!rows.length)return [];
  const safe=await rpc<string[]>(serviceClient(),'hallel_store_links',{rows:rows.map(r=>({id:r.id,version:r.link_version,hash:sha(scheduleToken(r.id,r.link_version))}))});
  const valid=new Set(safe);
  return rows.filter(r=>valid.has(r.id)).map(r=>{const url=`${origin}/s/${scheduleToken(r.id,r.link_version)}`;return {id:r.id,name:r.full_name,url,message:`Shalom, ${r.full_name.split(' ')[0]}! Você está na escala “${r.title}”, ${dateAndTime(r.starts_at)}. Responda até ${dateAndTime(r.confirm_deadline)}: ${url}`};});
}
export async function liveCommand(cmd:Command,origin:string):Promise<Outcome>{
  const {client:c,org,viewer}=await liveActor();const o=org.id;
  const {action:a,p}=cmd;
  if(a==='scheduleLinks')return {links:await issue(c,o,p.id,origin,{pending:!p.member_id,member:p.member_id})};
  if(a==='inviteCreate'){
    const id=randomUUID();const tok=tokenFor('invite',id);
    await rpc<string>(c,'hallel_invite_create',{o,i:id,email_address:p.email,role_name:p.org_role,hash_value:sha(tok)});
    return {id,url:`${origin}/convite/${tok}`};
  }
  let oldPdf:string|null=null;
  if(a==='songFileDelete'&&viewer.role!=='member'){
    const f=await c.from('song_files').select('storage_path').eq('id',p.id).eq('organization_id',o).maybeSingle();fail(f.error);oldPdf=f.data?.storage_path??null;
  }
  const result=await rpc<Outcome>(c,'hallel_command',{o,a,p});
  // Link creation is recoverable through “Copiar para WhatsApp”; the queue also issues links prior to sending.
  if((a==='schedulePublish'||a==='scheduleSave'||a==='scheduleReplace')&&result.id) {
    try{await issue(c,o,result.id,origin,{pending:false});}catch {console.error('Hallel: emissão de link precisará ser repetida.');}
  }
  if(oldPdf){const cleanup=await serviceClient().storage.from('song-pdfs').remove([oldPdf]);if(cleanup.error)console.error('Hallel: PDF arquivado pendente de limpeza.');}
  return result;
}
export async function liveGuest(token:string,p?:Omit<Parsed<'scheduleRespond'>,'id'|'manager'>){
  if(!validToken(token))throw new AppError('Este link não é válido.',404);
  const result=await rpc<Guest|null>(serviceClient(),'hallel_guest',{token:sha(token),reply:p?.status??null,note:p?parseResponseNote(p):null});
  if(!result)throw new AppError('Este link expirou ou não está disponível. Peça ajuda ao líder da sua banda.',410);
  return result;
}
export async function liveInvite(token:string){return validToken(token)&&await rpc<boolean>(serviceClient(),'hallel_invite_check',{org_slug:orgSlug(),invite_hash:sha(token)});}
export async function checkEmail(email:string,token?:string){return rpc<boolean>(serviceClient(),'hallel_preflight',{org_slug:orgSlug(),email_address:email,invite_hash:token?sha(token):null});}
export async function linkAccount(c:Client,token?:string){return rpc<string>(c,'hallel_link_account',{org_slug:orgSlug(),invite_hash:token?sha(token):null});}
export async function livePdfSave(song_id:string,label:string,bytes:Buffer){
  const {client,org,viewer}=await liveActor();if(viewer.role==='member')throw new AppError('Você não pode editar a biblioteca.',403);
  const {data:song,error}=await client.from('songs').select('id').eq('id',song_id).eq('organization_id',org.id).maybeSingle();fail(error);
  if(!song)throw new AppError('Música não encontrada.',404);
  const id=randomUUID(), path=`${org.id}/${song_id}/${id}.pdf`;const svc=serviceClient();
  const upload=await svc.storage.from('song-pdfs').upload(path,bytes,{contentType:'application/pdf',upsert:false,cacheControl:'60'});
  if(upload.error)throw new AppError('Não foi possível guardar o PDF. Confira o Storage.',503);
  const row=await svc.from('song_files').insert({organization_id:org.id,id,song_id,kind:'pdf',label,storage_path:path});
  if(row.error){await svc.storage.from('song-pdfs').remove([path]);fail(row.error);}
  return {id};
}
export async function livePdfUrl(id:string){
  const {client,org}=await liveActor(); const {data:f,error}=await client.from('song_files').select('storage_path').eq('id',id).eq('kind','pdf').eq('organization_id',org.id).maybeSingle();fail(error);
  if(!f?.storage_path)throw new AppError('Arquivo não encontrado.',404);
  const signed=await client.storage.from('song-pdfs').createSignedUrl(f.storage_path,120,{download:'musica-hallel.pdf'});
  if(signed.error||!signed.data)throw new AppError('Não foi possível abrir este arquivo.',404);
  return signed.data.signedUrl;
}

type Mail = { id:string;organization_id:string;type:string;recipient:string|null;recipient_name:string|null;sender:string|null;org_name:string;schedule_id:string|null;assignment_id:string|null;invite_id:string|null;link_version:number|null;title:string|null;starts_at:string|null;deadline:string|null;schedule_status:string|null;assignment_status:string|null;is_minor:boolean;notice_body:string|null;attempts:number };
export async function liveQueueReminders(){return rpc<number>(serviceClient(),'hallel_queue_reminders');}
export async function drainMail(amount=14){
  const mailKey=process.env.RESEND_API_KEY, fallback=process.env.RESEND_FROM;
  if(!mailKey||!fallback)return {sent:0,configuration:false};
  const origin=new URL(needed('HALLEL_BASE_URL')).origin;const svc=serviceClient();
  const rows=await rpc<Mail[]>(svc,'hallel_claim_mail',{amount});let sentCount=0;
  // Sequential delivery respects a standard Resend rate limit; the cron claims multiple batches if needed.
  for(const m of rows){
    let sent=false;const cancel=!m.recipient;
    try{
      if(!cancel){
        const first=m.recipient_name?.split(' ')[0];const hello=first?`Shalom, ${first}!`:'Shalom!';
        const when=m.starts_at?dateAndTime(m.starts_at):'';const until=m.deadline?dateAndTime(m.deadline):'';
        let url=m.schedule_id?`${origin}/escalas/${m.schedule_id}`:origin;
        if(m.assignment_id&&m.link_version&&!m.is_minor&&m.assignment_status!=='replaced'&&m.schedule_status==='published'&&m.deadline&&Date.parse(m.deadline)>Date.now()&&m.type!=='declined'){
          const tok=scheduleToken(m.assignment_id,m.link_version);
          const ids=await rpc<string[]>(svc,'hallel_store_links',{rows:[{id:m.assignment_id,version:m.link_version,hash:sha(tok)}]});
          if(ids.includes(m.assignment_id))url=`${origin}/s/${tok}`;
        }
        let subject:string;let body:string;
        switch(m.type){
          case 'admin_invite':subject='Seu convite para o Hallel';body=`Você recebeu um convite para acessar o Hallel. Ele vale por 7 dias e só pode ser usado pelo e-mail convidado.\n\n${origin}/convite/${tokenFor('invite',m.invite_id!)}`;break;
          case 'member_invite':subject='Boas-vindas ao Hallel';body=`Seu perfil foi cadastrado. Entre com este e-mail para consultar as escalas e o repertório.\n\n${origin}/entrar`;break;
          case 'announcement':subject=`Aviso: ${m.title}`;body=`${m.notice_body||''}\n\n${origin}/avisos`;break;
          case 'declined':subject=`Uma participação foi recusada: ${m.title}`;body=`Confira a escala do dia ${when} e organize uma substituição se for preciso.\n\n${url}`;break;
          case 'reminder':subject=`Lembrete de confirmação: ${m.title}`;body=`Ainda falta uma resposta para a escala de ${when}. Responda até ${until}.\n\n${url}`;break;
          case 'schedule_changed':subject=`Escala atualizada: ${m.title}`;body=m.assignment_status==='replaced'?`Sua participação na escala de ${when} foi substituída ou removida. Consulte a liderança em caso de dúvida.\n\n${url}`:`A escala de ${when} foi atualizada. Confira as mudanças no Hallel.\n\n${url}`;break;
          default:subject=`Nova escala: ${m.title}`;body=`A escala de ${when} foi publicada. Responda até ${until}.\n\n${url}`;
        }
        const req=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${mailKey}`,'Content-Type':'application/json','Idempotency-Key':`hallel/${m.id}`},body:JSON.stringify({from:m.sender||fallback,to:[m.recipient],subject:subject.replace(/[\r\n]/g,' '),text:`${hello}\n\n${body}\n\nHallel · ${m.org_name}`}),signal:AbortSignal.timeout(2200)});
        sent=req.ok;if(sent)sentCount++;
        if(req.status===429)await new Promise(resolve=>setTimeout(resolve,650));
        else await new Promise(resolve=>setTimeout(resolve,525));
      }
    }catch { /* Clean queue data never includes a raw token or email error body. */ }
    await rpc(svc,'hallel_finish_mail',{i:m.id,attempt_no:m.attempts,sent,cancelled:cancel});
  }
  return {sent:sentCount,configuration:true,claimed:rows.length};
}

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { addDays, dateAndTime, defaultDeadline, isMinor, localTimestamp, today } from '../dates';
import { belongsBand, manageBand, mine, personName, roster, type Audit, type Guest, type Outcome, type Profile, type Schedule, type ScheduleMember, type View } from '../model';
import { parseResponseNote, type Command, type Parsed } from '../validation';
import { AppError, demoPath, secureEqual, tokenFor, validToken } from './config';
import { DEMO_ADMIN,DEMO_LEADER,DEMO_MEMBER,seedDemo } from './seed-demo';

const storePath=()=>demoPath('dados-v1.json');
const globalQueue=globalThis as typeof globalThis & {hallelTransaction?:Promise<unknown>};
async function read():Promise<View> {
  try{return JSON.parse(await readFile(storePath(),'utf8'));} catch(e){ if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e; return seedDemo(); }
}
async function transaction<T>(fn:(v:View)=>T|Promise<T>):Promise<T> {
  const op=(globalQueue.hallelTransaction||Promise.resolve()).then(async()=>{
    const v=await read(); const result=await fn(v); const file=storePath(); const temp=file+'.'+randomUUID();
    await mkdir(dirname(file),{recursive:true}); await writeFile(temp,JSON.stringify(v),{mode:0o600}); await rename(temp,file); return result;
  });
  globalQueue.hallelTransaction=op.catch(()=>undefined); return op;
}
const actor=(v:View,mode:string|null)=>{
  const id=mode==='member'?DEMO_MEMBER:mode==='leader'?DEMO_LEADER:DEMO_ADMIN;
  const p=v.profiles.find(x=>x.id===id);const mem=v.orgMembers.find(x=>x.profile_id===id);
  if(!p||p.status!=='active'||!mem)throw new AppError('Este perfil está sem acesso.',403);
  return {id,name:p.full_name,role:mem.org_role};
};
function assert(ok:unknown,message='Você não tem permissão para esta ação.',status=403):asserts ok {if(!ok)throw new AppError(message,status);}
const activeBands=(v:View,id:string)=>v.bandMembers.filter(b=>b.profile_id===id).map(b=>b.band_id);
const canSee=(v:View,s:Schedule)=>manageBand(v,s.band_id)||(s.status!=='draft'&&belongsBand(v,s.band_id));
const canEditProfile=(v:View,p:Profile)=>v.viewer.role==='admin'||(v.viewer.role==='leader'&&activeBands(v,p.id).some(b=>manageBand(v,b))&&v.orgMembers.find(m=>m.profile_id===p.id)?.org_role!=='admin');
const canSeeContact=(v:View,p:Profile)=>canEditProfile(v,p)||mine(v,p.id);
export async function demoView(mode:string|null):Promise<View>{
  const v=await read();v.viewer=actor(v,mode);
  const bandIds=v.bands.filter(x=>manageBand(v,x.id)||belongsBand(v,x.id)).map(b=>b.id);
  const schedules=v.schedules.filter(x=>canSee(v,x));
  const scheduleMembers=v.scheduleMembers.filter(r=>{
    const s=schedules.find(s=>s.id===r.schedule_id);return s&&(manageBand(v,s.band_id)||mine(v,r.profile_id)||v.scheduleMembers.some(m=>m.schedule_id===s.id&&mine(v,m.profile_id)&&m.status!=='replaced'));
  }).map(r=>managesResponse(v,r)?r:{...r,decline_note:null,responded_by:null});
  const canSeeProfile=(p:Profile)=>v.viewer.role==='admin'||mine(v,p.id)||activeBands(v,p.id).some(b=>bandIds.includes(b))||scheduleMembers.some(sm=>sm.profile_id===p.id);
  const profiles=v.profiles.filter(canSeeProfile).map(p=>canSeeContact(v,p)?p:{id:p.id,full_name:p.full_name,status:p.status});
  const announcements=v.announcements.filter(x=>v.viewer.role==='admin'||(x.band_id&&manageBand(v,x.band_id))||(x.status==='published'&&(!x.band_id||belongsBand(v,x.band_id))&&(!x.expires_at||Date.parse(x.expires_at)>Date.now())));
  // Only admins see administration history or sender configuration.
  return {...v,org:v.viewer.role==='admin'?v.org:{...v.org,email_sender:null},bands:v.bands.filter(b=>bandIds.includes(b.id)),profiles,orgMembers:v.viewer.role==='admin'?v.orgMembers:v.orgMembers.filter(x=>x.profile_id===v.viewer.id),bandMembers:v.bandMembers.filter(x=>bandIds.includes(x.band_id)&&profiles.some(p=>p.id===x.profile_id)),schedules,scheduleMembers,scheduleSongs:v.scheduleSongs.filter(x=>schedules.some(s=>s.id===x.schedule_id)&&v.songs.some(s=>s.id===x.song_id)),unavailable:v.unavailable.filter(x=>v.viewer.role==='admin'||mine(v,x.profile_id)||activeBands(v,x.profile_id).some(b=>manageBand(v,b))).map(x=>v.viewer.role==='admin'||mine(v,x.profile_id)?x:{...x,reason:null}),announcements,invites:v.viewer.role==='admin'?v.invites:[],audit:v.viewer.role==='admin'?v.audit:[]};
}
function audit(v:View,action:string,entity:string,entity_id:string){v.audit.unshift({id:randomUUID(),actor_profile_id:v.viewer.id,action,entity,entity_id,created_at:new Date().toISOString()} as Audit);}
function manager(v:View){assert(v.viewer.role!=='member');}
function admin(v:View){assert(v.viewer.role==='admin');}
function schedule(v:View,id:string){const s=v.schedules.find(x=>x.id===id);assert(s,'Escala não encontrada.',404);return s;}
function managesResponse(v:View,r:ScheduleMember){return mine(v,r.profile_id)||v.schedules.some(s=>s.id===r.schedule_id&&manageBand(v,s.band_id));}
function assign(v:View,s:Schedule,profile_id:string,instrument_role:string){
  assert(v.profiles.some(p=>p.id===profile_id&&p.status==='active')&&v.bandMembers.some(b=>b.profile_id===profile_id&&b.band_id===s.band_id),'Selecione um membro ativo desta banda.',400);
  const row:ScheduleMember={id:randomUUID(),schedule_id:s.id,profile_id,instrument_role,status:'pending',responded_at:null,responded_by:null,decline_note:null,replaced_by:null};
  v.scheduleMembers.push(row);return row;
}
function setReply(r:ScheduleMember,p:Parsed<'scheduleRespond'>,who:string|null){assert(r.status!=='replaced','Esta participação já foi substituída.',409);r.status=p.status;r.responded_at=new Date().toISOString();r.responded_by=who;r.decline_note=parseResponseNote(p);}
function protectLastAdmin(v:View,id:string){
  if(v.orgMembers.some(m=>m.profile_id===id&&m.org_role==='admin')&&v.profiles.some(p=>p.id===id&&p.status==='active'))
    assert(v.orgMembers.some(m=>m.profile_id!==id&&m.org_role==='admin'&&v.profiles.some(p=>p.id===m.profile_id&&p.status==='active'&&(!v.profiles.find(a=>a.id===id)?.user_id||!!p.user_id))),'Não é possível remover, desativar ou rebaixar o último administrador.',409);
}
function saveProfile(v:View,p:Parsed<'profileSave'>){
  manager(v);const current=p.id?v.profiles.find(x=>x.id===p.id):undefined;
  if(p.id)assert(current&&canEditProfile(v,current),'Você não pode editar este perfil.',403);
  if(p.band_id)assert(v.bands.some(b=>b.id===p.band_id)&&manageBand(v,p.band_id)&&p.instrument_role,'Escolha uma banda que você gerencia e informe a função.',400);
  if(!current&&v.viewer.role==='leader')assert(p.band_id,'Escolha uma das suas bandas para cadastrar o membro.',400);
  if(v.viewer.role==='leader'&&current){assert(current.status===p.status&&current.email===p.email&&current.guardian_id===p.guardian_id&&current.birth_date===p.birth_date,'Somente a administração pode alterar estes dados.',403);}
  const strictMinor=isMinor(p.birth_date);
  if(strictMinor){assert(p.guardian_id,'Vincule um responsável ao menor de 13 anos.',400);assert(!p.email&&!p.phone&&!p.whatsapp&&!p.notes&&!current?.user_id,'Não guarde contatos pessoais ou login de menores de 13 anos.',400);}
  if(p.guardian_id){assert(v.profiles.some(g=>g.id===p.guardian_id&&g.id!==p.id&&!isMinor(g.birth_date)&&!g.guardian_id&&g.status==='active'),'Selecione um responsável adulto ativo.',400);assert(!v.profiles.some(d=>d.guardian_id===p.id),'Um responsável não pode ser vinculado como dependente.',400);}
  if(current?.user_id)assert(current.email===p.email,'O e-mail de um perfil com login só pode ser alterado junto à conta de acesso.',409);
  if(p.email)assert(!v.profiles.some(x=>x.email===p.email&&x.id!==p.id),'Este e-mail já está cadastrado.',409);
  if(current&&p.status==='inactive'){protectLastAdmin(v,current.id);assert(!v.profiles.some(d=>d.guardian_id===p.id&&d.status==='active'),'Vincule os dependentes a outro responsável antes de desativar.',409);}
  const id=current?.id||randomUUID();
  const row={id,full_name:p.full_name,email:p.email,phone:p.phone,whatsapp:p.whatsapp,birth_date:p.birth_date,guardian_id:p.guardian_id,notes:p.notes,status:p.status,user_id:current?.user_id||null};
  if(current){if(current.status!==p.status)audit(v,'profile_status','profiles',id);Object.assign(current,row);}else{v.profiles.push(row);v.orgMembers.push({id:randomUUID(),profile_id:id,org_role:'member'});}
  if(p.band_id&&p.instrument_role&&!v.bandMembers.some(x=>x.band_id===p.band_id&&x.profile_id===id&&x.instrument_role.toLowerCase()===p.instrument_role!.toLowerCase()))v.bandMembers.push({id:randomUUID(),band_id:p.band_id,profile_id:id,instrument_role:p.instrument_role,band_role:'member'});
  return id;
}
const linkable=(v:View,x:ScheduleMember,s:Schedule)=>v.profiles.some(p=>p.id===x.profile_id&&!isMinor(p.birth_date)&&p.status==='active'&&v.orgMembers.some(m=>m.profile_id===p.id))&&x.status!=='replaced'&&s.status==='published'&&Date.parse(s.confirm_deadline)>Date.now();
function resultLinks(v:View,s:Schedule,id:string|undefined,origin:string){
  return v.scheduleMembers.filter(x=>x.schedule_id===s.id&&(id?x.id===id:x.status==='pending')&&linkable(v,x,s)).map(x=>{
    const name=personName(v,x.profile_id);const url=`${origin}/s/${tokenFor('schedule',x.id)}`;
    return {id:x.id,name,url,message:`Shalom, ${name.split(' ')[0]}! Você está na escala “${s.title}”, ${dateAndTime(s.starts_at)}. Confirme sua presença até ${dateAndTime(s.confirm_deadline)}: ${url}`};
  });
}
export async function demoCommand(mode:string|null,cmd:Command,origin:string):Promise<Outcome>{
  return transaction(v=>{
    v.viewer=actor(v,mode);const utc=new Date().toISOString();
    const {action:a,p}=cmd;
    switch(a){
      case 'scheduleSave': {
        assert(manageBand(v,p.band_id)&&v.bands.some(b=>b.id===p.band_id));let s=p.id?schedule(v,p.id):null;
        if(s){assert(manageBand(v,s.band_id));assert(s.status!=='closed','Uma escala fechada não pode ser editada.',409);assert(s.status==='draft'||s.band_id===p.band_id,'A banda não pode mudar depois da publicação.',409);}
        const start=localTimestamp(p.event_date,p.time);const deadline=p.confirm_deadline||defaultDeadline(p.event_date,p.time,v.org.default_confirm_hours);
        assert(Date.parse(deadline)<=Date.parse(start),'O prazo não pode ser depois do encontro.',400);
        if(s?.status==='published')assert(p.assignments.length>0,'Mantenha pelo menos um participante na escala.',400);
        const fields={title:p.title,band_id:p.band_id,event_date:p.event_date,starts_at:start,location:p.location,notes:p.notes,confirm_deadline:deadline};
        if(!s){s={...fields,id:randomUUID(),status:'draft',published_at:null,duplicated_from:null,reminder_sent_at:null,created_by:v.viewer.id};v.schedules.push(s);}else{if(s.status==='published')audit(v,'schedule_changed','schedules',s.id);Object.assign(s,fields);}
        const keep=new Set(p.assignments.map(x=>`${x.profile_id}:${x.instrument_role.toLowerCase()}`));
        for(const r of roster(v,s.id))if(!keep.has(`${r.profile_id}:${r.instrument_role.toLowerCase()}`)){if(s.status==='draft')v.scheduleMembers=v.scheduleMembers.filter(m=>m.id!==r.id);else r.status='replaced';}
        for(const r of p.assignments){assert(v.profiles.some(x=>x.id===r.profile_id&&x.status==='active')&&v.bandMembers.some(x=>x.band_id===p.band_id&&x.profile_id===r.profile_id),'Selecione apenas pessoas ativas na banda.',400);if(!roster(v,s.id).some(x=>x.profile_id===r.profile_id&&x.instrument_role.toLowerCase()===r.instrument_role.toLowerCase()))assign(v,s,r.profile_id,r.instrument_role);}
        v.scheduleSongs=v.scheduleSongs.filter(x=>x.schedule_id!==s.id);
        p.repertoire.forEach((r,i)=>{assert(v.songs.some(x=>x.id===r.song_id),'Música não encontrada.',400);v.scheduleSongs.push({...r,id:randomUUID(),schedule_id:s.id,position:i+1});});return {id:s.id};
      }
      case 'scheduleDuplicate':{
        const old=schedule(v,p.id);assert(manageBand(v,old.band_id));
        const s={...old,id:randomUUID(),title:p.title,event_date:p.event_date,starts_at:localTimestamp(p.event_date,p.time),confirm_deadline:defaultDeadline(p.event_date,p.time,v.org.default_confirm_hours),status:'draft' as const,duplicated_from:old.id,published_at:null,reminder_sent_at:null,created_by:v.viewer.id};v.schedules.push(s);
        for(const r of roster(v,old.id)) if(v.profiles.some(x=>x.id===r.profile_id&&x.status==='active')&&v.bandMembers.some(b=>b.band_id===s.band_id&&b.profile_id===r.profile_id)) assign(v,s,r.profile_id,r.instrument_role);
        for(const r of v.scheduleSongs.filter(x=>x.schedule_id===old.id&&v.songs.some(s=>s.id===x.song_id)))v.scheduleSongs.push({...r,id:randomUUID(),schedule_id:s.id}); return {id:s.id};
      }
      case 'schedulePublish':case 'scheduleClose':case 'scheduleDelete':case 'scheduleLinks':{
        const s=schedule(v,p.id);assert(manageBand(v,s.band_id));
        if(a==='schedulePublish'){assert(s.status==='draft','A escala já foi publicada.',409);assert(roster(v,s.id).some(x=>x.status==='pending'),'Escolha pelo menos um membro.',400);assert(roster(v,s.id).every(x=>v.profiles.some(y=>y.id===x.profile_id&&y.status==='active')&&v.bandMembers.some(y=>y.band_id===s.band_id&&y.profile_id===x.profile_id)),'Atualize os participantes inativos ou que saíram da banda antes de publicar.',409);assert(Date.parse(s.confirm_deadline)>Date.now(),'O prazo já passou. Abra a edição e escolha um novo prazo.',400);s.status='published';s.published_at=utc;audit(v,'schedule_published','schedules',s.id);}
        if(a==='scheduleClose'){assert(s.status==='published','A escala precisa estar publicada.',409);s.status='closed';audit(v,'schedule_closed','schedules',s.id);}
        if(a==='scheduleDelete'){assert(s.status==='draft','Apenas rascunhos podem ser excluídos.',409);v.schedules=v.schedules.filter(x=>x.id!==s.id);v.scheduleMembers=v.scheduleMembers.filter(x=>x.schedule_id!==s.id);v.scheduleSongs=v.scheduleSongs.filter(x=>x.schedule_id!==s.id);v.schedules.filter(x=>x.duplicated_from===s.id).forEach(x=>x.duplicated_from=null);}
        if(a==='scheduleLinks')return {links:resultLinks(v,s,cmd.p.member_id,origin)};
        return {id:s.id};
      }
      case 'scheduleReplace':case 'scheduleRespond':{
        const r=v.scheduleMembers.find(x=>x.id===p.id);assert(r,'Participante não encontrado.',404); const s=schedule(v,r.schedule_id);
        if(a==='scheduleReplace'){
          assert(manageBand(v,s.band_id));assert(s.status==='published'&&r.status!=='replaced','Substitua apenas participantes ativos de uma escala publicada.',409);
          assert(!roster(v,s.id).some(x=>x.profile_id===p.profile_id&&x.instrument_role.toLowerCase()===r.instrument_role.toLowerCase()),'O substituto já está escalado nesta função.',409);
          r.status='replaced';r.replaced_by=p.profile_id;assign(v,s,p.profile_id,r.instrument_role);audit(v,'member_replaced','schedule_members',r.id);
        }else{
          if(p.manager)assert(manageBand(v,s.band_id)&&s.status!=='draft');
          else assert(mine(v,r.profile_id)&&s.status==='published'&&Date.parse(s.confirm_deadline)>Date.now(),'Você não pode responder a esta escala ou o prazo já passou.',403);
          assert(v.profiles.some(x=>x.id===r.profile_id&&x.status==='active'),'Este perfil está inativo.',409);setReply(r,p,v.viewer.id);
        }return {id:s.id};
      }
      case 'profileContact':{const x=v.profiles.find(x=>x.id===p.id);assert(x&&mine(v,p.id)&&!isMinor(x.birth_date),'Você não pode alterar estes contatos.',403);x.phone=p.phone;x.whatsapp=p.whatsapp;return {id:p.id};}
      case 'profileSave':return {id:saveProfile(v,p)};
      case 'profilesImport':admin(v);for(const x of p.rows)saveProfile(v,x);return {};
      case 'profileDelete':{
        admin(v);const target=v.profiles.find(x=>x.id===p.id);assert(target,'Perfil não encontrado.',404);protectLastAdmin(v,p.id);
        assert(!v.scheduleMembers.some(r=>r.profile_id===p.id&&r.status!=='replaced'&&v.schedules.some(s=>s.id===r.schedule_id&&s.status==='published'&&Date.parse(s.starts_at)>Date.now())),'Há uma escala futura publicada para este membro. Desative-o por enquanto.',409);
        assert(!v.profiles.some(x=>x.guardian_id===p.id),'Vincule os dependentes a outro responsável primeiro.',409);
        target.status='inactive'; target.email=null;target.user_id=null;target.phone=null;target.whatsapp=null;target.notes=null;v.orgMembers=v.orgMembers.filter(x=>x.profile_id!==p.id);v.bandMembers=v.bandMembers.filter(x=>x.profile_id!==p.id);audit(v,'profile_status','profiles',p.id);return {id:p.id};
      }
      case 'bandSave':{
        admin(v);assert(!v.bands.some(x=>x.id!==p.id&&x.name.toLowerCase()===p.name.toLowerCase()),'Essa banda já existe.',409);
        const item=v.bands.find(x=>x.id===p.id);if(p.id)assert(item,'Banda não encontrada.',404);if(item)Object.assign(item,p);else v.bands.push({id:randomUUID(),name:p.name,description:p.description});return {};
      }
      case 'bandDelete':{
        admin(v);assert(!v.schedules.some(s=>s.band_id===p.id&&s.status==='published'),'Feche as escalas publicadas antes de arquivar a banda.',409);v.bands=v.bands.filter(x=>x.id!==p.id);v.bandMembers=v.bandMembers.filter(x=>x.band_id!==p.id);return {};
      }
      case 'bandLink':{
        assert(manageBand(v,p.band_id)&&v.bands.some(x=>x.id===p.band_id)); assert(v.viewer.role==='admin'||activeBands(v,p.profile_id).some(b=>manageBand(v,b))); const link=v.bandMembers.find(x=>x.id===p.id);
        if(p.id)assert(link&&link.band_id===p.band_id&&link.profile_id===p.profile_id,'Vínculo não encontrado.',404);
        assert(v.viewer.role==='admin'||(p.band_role==='member'&&link?.band_role!=='leader'));
        if(p.band_role==='leader')assert(v.orgMembers.some(x=>x.profile_id===p.profile_id&&x.org_role!=='member'),'Conceda o papel de líder em Administradores primeiro.',400);
        assert(v.profiles.some(x=>x.id===p.profile_id&&x.status==='active'),'Selecione um membro ativo.',400);
        assert(!v.bandMembers.some(x=>x.id!==p.id&&x.band_id===p.band_id&&x.profile_id===p.profile_id&&x.instrument_role.toLowerCase()===p.instrument_role.toLowerCase()),'Este vínculo já existe.',409);
        if(link)Object.assign(link,p);else v.bandMembers.push({...p,id:randomUUID()});return {};
      }
      case 'bandUnlink':{const link=v.bandMembers.find(x=>x.id===p.id);assert(link,'Vínculo não encontrado.',404);assert(manageBand(v,link.band_id)&&(v.viewer.role==='admin'||link.band_role!=='leader'));v.bandMembers=v.bandMembers.filter(x=>x.id!==p.id);return {};}
      case 'songSave':{manager(v);const item=v.songs.find(x=>x.id===p.id);if(p.id)assert(item,'Música não encontrada.',404);const id=p.id||randomUUID();if(item)Object.assign(item,p);else v.songs.push({...p,id});return {id};}
      case 'songDelete':{manager(v);v.songs=v.songs.filter(x=>x.id!==p.id);audit(v,'song_deleted','songs',p.id);return {id:p.id};}
      case 'songLink':{manager(v);assert(v.songs.some(s=>s.id===p.song_id),'Música não encontrada.',404);const id=randomUUID();v.songFiles.push({...p,id,kind:'link'});return {id};}
      case 'songFileDelete':{manager(v);v.songFiles=v.songFiles.filter(x=>x.id!==p.id);return {};}
      case 'availabilitySet':{
        assert((v.viewer.role==='admin'||mine(v,p.profile_id))&&v.profiles.some(x=>x.id===p.profile_id&&x.status==='active'));v.unavailable=v.unavailable.filter(x=>x.profile_id!==p.profile_id||x.date!==p.date);
        if(p.blocked)v.unavailable.push({id:randomUUID(),profile_id:p.profile_id,date:p.date,reason:p.reason});return {};
      }
      case 'noticeSave':{
        assert(p.band_id?manageBand(v,p.band_id)&&v.bands.some(x=>x.id===p.band_id):v.viewer.role==='admin');const prev=p.id?v.announcements.find(x=>x.id===p.id):null;
        if(p.id){assert(prev,'Aviso não encontrado.',404);assert(prev.band_id?manageBand(v,prev.band_id):v.viewer.role==='admin');assert(prev.status==='draft'||prev.band_id===p.band_id,'O público não pode mudar depois de publicar.',409);}
        const id=p.id||randomUUID();if(prev)Object.assign(prev,p);else v.announcements.push({...p,id,status:'draft',published_at:null,created_by:v.viewer.id,created_at:utc});return {id};
      }
      case 'noticePublish':case 'noticeExpire':case 'noticeDelete':{
        const n=v.announcements.find(x=>x.id===p.id);assert(n,'Aviso não encontrado.',404);assert(n.band_id?manageBand(v,n.band_id):v.viewer.role==='admin');
        if(a==='noticePublish'){assert(n.status==='draft','O aviso já foi publicado.',409);assert(!n.expires_at||Date.parse(n.expires_at)>Date.now(),'A data de expiração precisa estar no futuro.',400);n.status='published';n.published_at=utc;}
        if(a==='noticeExpire'){assert(n.status==='published','Publique o aviso antes de expirar.',400);n.expires_at=utc;}
        if(a==='noticeDelete')v.announcements=v.announcements.filter(x=>x.id!==p.id);return {id:n.id};
      }
      case 'inviteCreate':{admin(v); const id=randomUUID();v.invites.filter(i=>i.email===p.email&&!i.accepted_at&&!i.revoked_at).forEach(i=>i.revoked_at=utc);v.invites.push({id,...p,expires_at:new Date(Date.now()+7*864e5).toISOString(),accepted_at:null,revoked_at:null});audit(v,'invite_created','admin_invites',id);return {id,url:`${origin}/convite/${tokenFor('invite',id)}`};}
      case 'inviteRevoke':{admin(v);const i=v.invites.find(x=>x.id===p.id);if(i&&!i.accepted_at)i.revoked_at=utc;return {};}
      case 'orgRole':case 'orgRemove':{
        admin(v);const m=v.orgMembers.find(x=>x.id===p.id);assert(m,'Acesso não encontrado.',404);
        if(a==='orgRemove'||p.org_role!=='admin')protectLastAdmin(v,m.profile_id);
        if(a==='orgRole'){assert(p.org_role==='member'||!isMinor(v.profiles.find(x=>x.id===m.profile_id)?.birth_date),'Menores de 13 anos não podem receber este papel.',400);m.org_role=p.org_role;audit(v,'role_changed','org_members',m.id);}else{v.orgMembers=v.orgMembers.filter(x=>x.id!==m.id);audit(v,'admin_removed','org_members',m.id);}return {};
      }
      case 'orgSave':admin(v);Object.assign(v.org,p);return {};
    }
  });
}
function findGuest(v:View,token:string){
  assert(validToken(token),'Este link não é válido.',404);
  const row=v.scheduleMembers.find(r=>secureEqual(token,tokenFor('schedule',r.id))); assert(row,'Este link não é válido.',404);
  const s=schedule(v,row.schedule_id);assert(linkable(v,row,s),'Este link expirou. Peça ajuda ao líder da sua banda.',410);
  const guest:Guest={title:s.title,starts_at:s.starts_at,location:s.location,confirm_deadline:s.confirm_deadline,instrument_role:row.instrument_role,first_name:personName(v,row.profile_id).split(' ')[0],status:row.status};return {row,guest};
}
export async function demoGuest(token:string){return findGuest(await read(),token).guest;}
export async function demoGuestRespond(token:string,p:Omit<Parsed<'scheduleRespond'>,'id'|'manager'>){return transaction(v=>{const {row,guest}=findGuest(v,token);setReply(row,{...p,id:row.id,manager:false},null);return {...guest,status:row.status};});}
export async function demoInvite(token:string){const v=await read();return v.invites.some(i=>!i.revoked_at&&!i.accepted_at&&Date.parse(i.expires_at)>Date.now()&&validToken(token)&&secureEqual(token,tokenFor('invite',i.id)));}
export async function demoPdfSave(mode:string|null,song_id:string,label:string,bytes:Buffer){
  return transaction(async v=>{v.viewer=actor(v,mode);manager(v);assert(v.songs.some(s=>s.id===song_id),'Música não encontrada.',404);const id=randomUUID();const file=demoPath(`pdf/${id}.pdf`);await mkdir(dirname(file),{recursive:true});await writeFile(file,bytes,{mode:0o600});v.songFiles.push({id,song_id,label,kind:'pdf',url:null});return {id};});
}
export async function demoPdfRead(mode:string|null,id:string){const v=await demoView(mode);assert(v.songFiles.some(f=>f.id===id&&f.kind==='pdf'&&v.songs.some(s=>s.id===f.song_id)),'Arquivo não encontrado.',404);return readFile(demoPath(`pdf/${id}.pdf`));}
export async function demoPdfRemove(id:string){await unlink(demoPath(`pdf/${id}.pdf`)).catch(()=>{});}

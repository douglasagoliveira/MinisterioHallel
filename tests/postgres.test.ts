import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { addDays, today } from '../lib/dates';
const uid=(n:number)=>`d1000000-0000-4000-8000-${n.toString(16).padStart(12,'0')}`;
const [org,other,admin,lead,guardian,child,peer,guest,band,band2,foreignBand,adminProfile,leaderProfile,guardianProfile,childProfile,peerProfile,guestProfile,track,adminRole,newUser,unknownUser,foreignAdmin]=Array.from({length:22},(_,i)=>uid(i+1));
const draftInput=(b=band)=>({band_id:b,title:'Serviço de teste',event_date:addDays(today(),8),time:'10:00',confirm_deadline:new Date(Date.now()+3600000*6).toISOString(),location:'Har Tzion',notes:null,assignments:[{profile_id:guardianProfile,instrument_role:'Vocal'},{profile_id:childProfile,instrument_role:'Vocal'},{profile_id:guestProfile,instrument_role:'Piano'},{profile_id:peerProfile,instrument_role:'Bateria'}],repertoire:[{song_id:track,notes:'Intro'}]});

test('Migrações PostgreSQL: isolamento, fluxos e fila de e-mail',async t=>{
 const db=new PGlite();await db.waitReady;
 const as=async(role:'authenticated'|'service_role'|'anon'|'owner',u?:string)=>{await db.exec('reset role');if(role!=='owner')await db.exec(`set role ${role}`);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[u||'']);};
 const command=async(a:string,p:unknown,o=org)=>{const r=await db.query<{r:{id:string}}>('select public.hallel_command($1,$2,$3::jsonb) r',[o,a,JSON.stringify(p)]);return r.rows[0].r;};
 const count=async(sql:string,params:unknown[]=[])=>Number((await db.query<{n:number}>(sql,params)).rows[0].n);
 try{
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;create schema storage;
  create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create table storage.buckets(id text primary key,name text,public bool,file_size_limit int,allowed_mime_types text[]);
  create table storage.objects(id uuid primary key, bucket_id text, name text);alter table storage.objects enable row level security;
  grant usage on schema auth,storage to anon,authenticated,service_role; grant select on storage.objects to authenticated;`);
  for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync(`supabase/migrations/${f}`,'utf8'));
  await db.exec(`
   insert into public.organizations(id,name,slug) values('${org}','Tzion','har-tzion'),('${other}','Outro núcleo','outra');
   insert into auth.users values('${admin}','admin@example.com',now()),('${lead}','lider@example.com',now()),('${guardian}','responsavel@example.com',now()),('${peer}','outro@example.com',now()),('${newUser}','convidado@example.com',now()),('${unknownUser}','semacesso@example.com',now());
   insert into public.profiles(id,organization_id,user_id,full_name,email) values
   ('${adminProfile}','${org}','${admin}','Admin Hallel','admin@example.com'),('${leaderProfile}','${org}','${lead}','Líder Banda','lider@example.com'),('${guardianProfile}','${org}','${guardian}','Responsável Banda','responsavel@example.com'),('${peerProfile}','${org}','${peer}','Outro Membro','outro@example.com'),('${guestProfile}','${org}',null,'Convidado sem Email',null),('${foreignAdmin}','${other}',null,'Nome outra organização','privado@example.com');
   insert into public.profiles(id,organization_id,full_name,guardian_id,birth_date) values('${childProfile}','${org}','Dependente Teste','${guardianProfile}',(now()-interval '10 years')::date);
   insert into public.org_members(id,organization_id,profile_id,org_role) values('${adminRole}','${org}','${adminProfile}','admin');
   insert into public.org_members(organization_id,profile_id,org_role) values('${org}','${leaderProfile}','leader'),('${org}','${guardianProfile}','member'),('${org}','${childProfile}','member'),('${org}','${peerProfile}','member'),('${org}','${guestProfile}','member'),('${other}','${foreignAdmin}','admin');
   insert into public.bands(id,organization_id,name) values('${band}','${org}','Ahuvi'),('${band2}','${org}','Hineni'),('${foreignBand}','${other}','Banda fora do piloto');
   insert into public.band_members(organization_id,band_id,profile_id,instrument_role,band_role) values('${org}','${band}','${leaderProfile}','Violão','leader'),('${org}','${band}','${guardianProfile}','Vocal','member'),('${org}','${band}','${childProfile}','Vocal','member'),('${org}','${band}','${guestProfile}','Piano','member'),('${org}','${band}','${peerProfile}','Bateria','member');
   insert into public.songs(id,organization_id,title,key) values('${track}','${org}','Shalom','Dm');
  `);
  let sid='',childRow='',peerRow='',guestRow='';const hash='1'.repeat(64),another='2'.repeat(64);
  await t.test('RLS isola igrejas, restringe a liderança e bloqueia escrita direta',async()=>{
   await as('authenticated',admin);assert.equal(await count('select count(*) n from public.organizations'),1);
   assert.equal(await count('select count(*) n from public.bands'),2);
   await assert.rejects(command('bandSave',{name:'Invasão'},other),/Entre para continuar/);
   await as('authenticated',lead);assert.equal(await count('select count(*) n from public.bands'),1);
   await assert.rejects(command('scheduleSave',draftInput(band2)),/não gerencia/);
   await assert.rejects(db.exec("insert into public.bands(name) values('Não permitido')"),/permission denied/);
   await as('anon');await assert.rejects(db.query('select id from public.schedules'),/permission denied/);
  });
  await t.test('Rascunhos, publicação, presença por responsável e filas',async()=>{
   await as('authenticated',lead);sid=(await command('scheduleSave',draftInput())).id;
   await as('authenticated',guardian);assert.equal(await count('select count(*) n from public.schedules'),0);
   assert.equal(await count('select count(*) n from public.hallel_contacts($1)',[org]),2);
   await assert.rejects(db.query('select access_token_hash from public.schedule_members'),/permission denied/);
   await as('authenticated',lead);await command('schedulePublish',{id:sid});
   assert.equal(await count("select count(*) n from public.notification_log where type='schedule_published'"),3);
   const roster=(await db.query<{id:string;profile_id:string}>('select id,profile_id from public.schedule_members')).rows;
   childRow=roster.find(x=>x.profile_id===childProfile)!.id;peerRow=roster.find(x=>x.profile_id===peerProfile)!.id;guestRow=roster.find(x=>x.profile_id===guestProfile)!.id;
   const linkRows=(await db.query<{id:string}>('select id from public.hallel_links($1,$2,null,false)',[org,sid])).rows;
   assert.ok(!linkRows.some(x=>x.id===childRow));assert.equal(linkRows.length,3);
   await as('authenticated',guardian);
   assert.equal(await count('select count(*) n from public.schedules'),1);
   await assert.rejects(command('scheduleRespond',{id:peerRow,status:'confirmed'}),/não pode responder/);
   await command('scheduleRespond',{id:childRow,status:'confirmed'});
   assert.equal(await count("select count(*) n from public.hallel_private_responses($1) where id=$2 and responded_by=$3",[org,childRow,guardianProfile]),1);
   await command('availabilitySet',{profile_id:childProfile,date:addDays(today(),8),blocked:true,reason:'Família'});
   await as('authenticated',lead);assert.equal(await count('select count(*) n from public.unavailability'),1);
   assert.equal(await count('select count(*) n from public.hallel_reasons($1)',[org]),0);
  });
  await t.test('Link público guarda só hash, permite uma linha, e é invalidado ao fechar',async()=>{
   await as('authenticated',lead);await assert.rejects(db.query('select public.hallel_store_links($1)',[JSON.stringify([])]),/permission denied/);
   await as('service_role');const set=await db.query<{ids:string[]}>('select public.hallel_store_links($1::jsonb) ids',[JSON.stringify([{id:guestRow,version:1,hash},{id:childRow,version:1,hash:another}])]);assert.deepEqual(set.rows[0].ids,[guestRow]);
   const g=await db.query<{v:Record<string,unknown>}>('select public.hallel_guest($1,$2,$3) v',[hash,'declined','Um recado']);assert.equal(g.rows[0].v.first_name,'Convidado');assert.equal(g.rows[0].v.status,'declined'); assert.ok(!('profile_id' in g.rows[0].v));
   assert.equal(await count("select count(*) n from public.notification_log where type='declined'"),1);
   assert.ok((await count('select public.hallel_queue_reminders() n'))>=1);assert.equal(await count('select public.hallel_queue_reminders() n'),0);
   assert.ok((await count('select count(*) n from public.hallel_claim_mail(7)'))>=1);
   await as('authenticated',admin);await command('scheduleClose',{id:sid});
   await as('service_role');const expired=(await db.query<{v:null}>('select public.hallel_guest($1) v',[hash])).rows[0];assert.equal(expired.v,null);
  });
  await t.test('Duplicação, avisos, música privada e último administrador',async()=>{
   await as('authenticated',lead);
   const dup=(await command('scheduleDuplicate',{id:sid,title:'Cópia',event_date:addDays(today(),15),time:'10:00'})).id;
   assert.equal(await count("select count(*) n from public.schedule_members where schedule_id=$1 and status='pending'",[dup]),4);
   assert.equal(await count('select count(*) n from public.schedule_songs where schedule_id=$1',[dup]),1);
   const updated={...draftInput(),id:dup,title:'Editado'};await command('scheduleSave',updated);
   assert.equal(await count("select count(*) n from public.schedules where title='Editado'"),1);
   await assert.rejects(command('noticeSave',{title:'Todos',body:'Prioridade geral',band_id:null}),/não pode publicar/);
   const nid=(await command('noticeSave',{title:'Banda',body:'Ensaio sábado',band_id:band,send_email:true})).id;
   await as('authenticated',guardian);assert.equal(await count('select count(*) n from public.announcements'),0);
   await as('authenticated',lead);await command('noticePublish',{id:nid});
   await as('authenticated',guardian); assert.equal(await count('select count(*) n from public.announcements'),1);
   await as('owner'); const path=`${org}/${track}/${uid(90)}.pdf`;
   await db.query("insert into public.song_files(organization_id,song_id,kind,storage_path) values($1,$2,'pdf',$3)",[org,track,path]);
   await db.query("insert into storage.objects values($1,'song-pdfs',$2)",[uid(91),path]);
   await as('authenticated',guardian);assert.equal(await count('select count(*) n from storage.objects'),1);
   await as('authenticated',unknownUser);assert.equal(await count('select count(*) n from storage.objects'),0);
   await as('authenticated',admin);
   await assert.rejects(command('orgRole',{id:adminRole,org_role:'member'}),/último administrador/);
   await assert.rejects(command('profileSave',{id:adminProfile,full_name:'Admin Hallel',status:'inactive',email:'admin@example.com'}),/último administrador/);
   await assert.rejects(command('profileSave',{full_name:'Menor sem vínculo',birth_date:`${Number(today().slice(0,4))-8}-01-01`}),/precisam de responsável/);
  });
  await t.test('Substituição e edição publicada notificam somente os afetados',async()=>{
   await as('authenticated',lead);
   const input=draftInput();const id=(await command('scheduleSave',input)).id;
   await command('schedulePublish',{id});
   const old=(await db.query<{id:string}>('select id from public.schedule_members where schedule_id=$1 and profile_id=$2',[id,peerProfile])).rows[0].id;
   await command('scheduleReplace',{id:old,profile_id:guardianProfile});
   assert.equal(await count("select count(*) n from public.schedule_members where id=$1 and status='replaced' and replaced_by=$2",[old,guardianProfile]),1);
   assert.equal(await count("select count(*) n from public.notification_log where schedule_id=$1 and type='schedule_changed'",[id]),1);
   const updated={...input,id,assignments:input.assignments.map(x=>x.profile_id===peerProfile?{...x,profile_id:guardianProfile}:x)};
   await command('scheduleSave',updated);
   assert.equal(await count("select count(*) n from public.notification_log where schedule_id=$1 and type='schedule_changed'",[id]),1);
   await command('scheduleSave',{...updated,location:'Outro local'});
   assert.ok((await count("select count(*) n from public.notification_log where schedule_id=$1 and type='schedule_changed'",[id]))>1);
  });
  await t.test('Convite por e-mail verificado, isolado e de uso único',async()=>{
   await as('authenticated',admin);const iid=uid(97);
   await db.query('select public.hallel_invite_create($1,$2,$3,$4,$5)',[org,iid,'convidado@example.com','leader',another]);
   await as('authenticated',unknownUser);await assert.rejects(db.query('select public.hallel_link_account($1,$2)',['har-tzion',another]),/outro e-mail/);
   await as('authenticated',newUser);await db.query('select public.hallel_link_account($1,$2)',['har-tzion',another]);assert.equal(await count("select count(*) n from public.org_members where org_role='leader'"),1);
   await assert.rejects(db.query('select public.hallel_link_account($1,$2)',['har-tzion',another]),/já foi usado/);
  });
 } finally {await db.close();}
});

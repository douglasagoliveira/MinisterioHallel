-- Transactional write API. Authenticated RPCs re-check permissions and validate inputs.
alter table public.schedule_members add column link_version int not null default 1;
create function public.h_assert(ok boolean,m text, code text default '22023') returns void language plpgsql set search_path='' as $$begin if ok is distinct from true then raise exception using errcode=code,message=m;end if;end$$;
create function public.h_audit(o uuid,who uuid,a text,e text,i uuid) returns void language sql set search_path='' as $$insert into public.audit_log(organization_id,actor_profile_id,action,entity,entity_id) values(o,who,a,e,i)$$;
create function public.h_email_valid(v text) returns boolean language sql immutable set search_path='' as $$select v is not null and char_length(v)<=254 and v ~ '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$'$$;
create function public.h_role_value(v text) returns boolean language sql immutable set search_path='' as $$select coalesce(v in ('admin','leader','member'),false)$$;
create function public.h_recipient(p uuid) returns uuid language sql stable set search_path='' as $$
 select r.id from public.profiles x join public.profiles r on r.id=case when x.birth_date>((now() at time zone 'America/Sao_Paulo')::date-interval '13 years')::date then x.guardian_id else x.id end
 where x.id=p and exists(select 1 from public.org_members m where m.profile_id=x.id) and exists(select 1 from public.org_members m where m.profile_id=r.id) and x.status='active' and x.deleted_at is null and r.status='active' and r.deleted_at is null and r.email is not null
$$;
create function public.h_queue_assignment(r uuid,kind text,allow_removed boolean default false) returns void language sql set search_path='' as $$
 insert into public.notification_log(organization_id,schedule_id,profile_id,assignment_id,type)
 select m.organization_id,m.schedule_id,public.h_recipient(m.profile_id),m.id,kind from public.schedule_members m
 where m.id=r and (allow_removed or m.status<>'replaced') and public.h_recipient(m.profile_id) is not null on conflict do nothing
$$;
create function public.h_queue_decline(o uuid,s uuid,r uuid) returns void language sql set search_path='' as $$
 insert into public.notification_log(organization_id,schedule_id,profile_id,assignment_id,type)
 select o,s,p.id,r,'declined' from public.profiles p where p.id in (
  select bm.profile_id from public.band_members bm join public.schedules sc on sc.band_id=bm.band_id join public.org_members om on om.organization_id=o and om.profile_id=bm.profile_id
    where sc.id=s and bm.band_role='leader' and om.org_role in ('admin','leader')
  union select created_by from public.schedules where id=s
 ) and p.status='active' and p.deleted_at is null and p.email is not null
$$;
create function public.h_active_slot(o uuid,b uuid,who uuid) returns boolean language sql stable set search_path='' as $$select exists(select 1 from public.profiles p join public.band_members m on m.profile_id=p.id join public.org_members om on om.profile_id=p.id where m.band_id=b and m.organization_id=o and p.id=who and p.status='active' and p.deleted_at is null)$$;

create function public.h_save_profile(o uuid,who uuid, role_name text,p jsonb) returns uuid language plpgsql set search_path='' as $$
declare k uuid:=(p->>'id')::uuid; b uuid:=(p->>'band_id')::uuid; current_row public.profiles%rowtype; em text:=lower(nullif(btrim(p->>'email'),'')); fn text:=btrim(p->>'full_name'); st text:=coalesce(p->>'status','active'); g uuid:=(p->>'guardian_id')::uuid; born date:=(p->>'birth_date')::date; inst text:=nullif(btrim(p->>'instrument_role'),'');
begin
 perform public.h_assert(role_name in ('admin','leader'),'Sem permissão para gerenciar membros.','42501');
 perform public.h_assert(char_length(fn) between 1 and 120 and st in ('active','inactive') and (em is null or public.h_email_valid(em)), 'Confira nome, e-mail e situação do membro.');
 if b is not null then
  perform public.h_assert(public.h_manage_band(o,b) and exists(select 1 from public.bands where id=b and organization_id=o and deleted_at is null),'Escolha uma banda que você gerencia.','42501');
  perform public.h_assert(char_length(inst) between 1 and 75,'Informe a função na banda.');
 end if;
 if k is null then
  perform public.h_assert(role_name='admin' or b is not null,'Escolha uma das suas bandas para cadastrar o membro.');
  if role_name='leader' then perform public.h_assert(st='active','Um líder cadastra apenas perfis ativos.');end if;
  insert into public.profiles(organization_id,full_name,email,phone,whatsapp,birth_date,guardian_id,notes,status) values(o,fn,em, left(nullif(p->>'phone',''),32),left(nullif(p->>'whatsapp',''),32),born,g,left(nullif(p->>'notes',''),1200),st) returning id into k;
  insert into public.org_members(organization_id,profile_id) values(o,k);
 else
  select * into current_row from public.profiles x where x.organization_id=o and x.id=k and x.deleted_at is null for update;
  perform public.h_assert(current_row.id is not null,'Membro não encontrado.','P0002');
  perform public.h_assert(role_name='admin' or (public.h_manage_profile(o,k) and not exists(select 1 from public.org_members m where m.organization_id=o and m.profile_id=k and m.org_role='admin')),'Você não pode editar este perfil.','42501');
  if current_row.user_id is not null then perform public.h_assert(current_row.email is not distinct from em,'O e-mail de um perfil com login só pode ser alterado junto à conta de acesso.');end if;
  if role_name='leader' then perform public.h_assert((current_row.status,current_row.email,current_row.guardian_id,current_row.birth_date) is not distinct from (st,em,g,born),'Somente a administração pode alterar estes dados.','42501');end if;
  update public.profiles set full_name=fn,email=em,phone=left(nullif(p->>'phone',''),32),whatsapp=left(nullif(p->>'whatsapp',''),32),birth_date=born,guardian_id=g,notes=left(nullif(p->>'notes',''),1200),status=st where id=k;
  if st<>current_row.status then perform public.h_audit(o,who,'profile_status','profiles',k);end if;
 end if;
 if b is not null then insert into public.band_members(organization_id,band_id,profile_id,instrument_role) values(o,b,k,inst) on conflict do nothing;end if;
 return k;
end$$;

create function public.hallel_command(o uuid,a text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare
 who uuid:=public.h_viewer(o); rr text:=public.h_org_role(o); k uuid:=(p->>'id')::uuid; b uuid:=(p->>'band_id')::uuid; pid uuid:=(p->>'profile_id')::uuid; sid uuid;
 s public.schedules%rowtype; r public.schedule_members%rowtype; n public.announcements%rowtype; bm public.band_members%rowtype; mem public.org_members%rowtype;
 song public.songs%rowtype; f public.song_files%rowtype; rowval jsonb; oid uuid; dt date; starts timestamptz; deadline timestamptz; exp timestamptz;
 title text:=nullif(btrim(p->>'title'),''); fn text; email text; role_name text; note text; status_value text; changed boolean; repertoire_change boolean; ids uuid[]:=array[]::uuid[]; touched uuid[]:=array[]::uuid[]; pos int:=0;
begin
 perform public.h_assert(who is not null,'Entre para continuar.','42501');
 perform public.h_assert(o is not null and p is not null and jsonb_typeof(p)='object' and pg_column_size(p)<=600000,'Pedido inválido.');
 if a in ('orgSave','orgRole','orgRemove','bandSave','bandDelete','profileDelete','profilesImport','inviteRevoke') then perform public.h_assert(rr='admin','Apenas administradores podem fazer isso.','42501');end if;
 if a='orgSave' then
  fn:=btrim(p->>'name'); email:=nullif(lower(btrim(p->>'email_sender')),'');
  perform public.h_assert(char_length(fn) between 1 and 100 and (email is null or public.h_email_valid(email)),'Confira o nome e o e-mail da organização.');
  update public.organizations set name=fn,email_sender=email,default_confirm_hours=(p->>'default_confirm_hours')::int where id=o;
 elsif a in ('orgRole','orgRemove') then
  select * into mem from public.org_members where id=k and organization_id=o for update;
  perform public.h_assert(mem.id is not null,'Acesso não encontrado.','P0002');
  if a='orgRemove' then
   delete from public.org_members where id=k;
   perform public.h_audit(o,who,'admin_removed','org_members',k);
  else
   role_name:=p->>'org_role';perform public.h_assert(public.h_role_value(role_name),'Papel inválido.');
   update public.org_members set org_role=role_name where id=k;
   if role_name<>mem.org_role then perform public.h_audit(o,who,'role_changed','org_members',k);end if;
  end if;
 elsif a='profileContact' then
  perform public.h_assert(public.manages_profile(k) and exists(select 1 from public.profiles where id=k and organization_id=o and status='active' and deleted_at is null and (birth_date is null or birth_date<=((now() at time zone 'America/Sao_Paulo')::date-interval '13 years')::date)), 'Você não pode alterar estes contatos.','42501');
  update public.profiles set phone=left(nullif(p->>'phone',''),32),whatsapp=left(nullif(p->>'whatsapp',''),32) where id=k;
 elsif a='profileSave' then
  k:=public.h_save_profile(o,who,rr,p);
 elsif a='profilesImport' then
  perform public.h_assert(jsonb_array_length(p->'rows') between 1 and 250,'Importe de 1 a 250 linhas por vez.');
  for rowval in select value from jsonb_array_elements(p->'rows') loop
   k:=public.h_save_profile(o,who,rr,rowval-'id');
   if (p->>'send_invites')::boolean and public.h_recipient(k)=k then insert into public.notification_log(organization_id,profile_id,type) values(o,k,'member_invite');end if;
  end loop;
 elsif a='profileDelete' then
  perform public.h_assert(exists(select 1 from public.profiles where id=k and organization_id=o and deleted_at is null),'Membro não encontrado.','P0002');
  perform public.h_assert(not exists(select 1 from public.schedule_members m join public.schedules sc on sc.id=m.schedule_id where m.profile_id=k and m.status<>'replaced' and sc.status='published' and sc.starts_at>now()),'Há uma escala futura publicada para este membro. Desative-o por enquanto.');
  delete from public.org_members where profile_id=k;
  update public.profiles set deleted_at=now(),status='inactive',user_id=null,email=null,phone=null,whatsapp=null,notes=null,photo_path=null,guardian_id=null,birth_date=null where id=k;
  delete from public.band_members where profile_id=k;
  perform public.h_audit(o,who,'profile_status','profiles',k);
 elsif a='bandSave' then
  fn:=btrim(p->>'name');perform public.h_assert(char_length(fn) between 1 and 75,'Informe um nome para a banda.');
  if k is null then insert into public.bands(organization_id,name,description) values(o,fn,left(nullif(p->>'description',''),600)) returning id into k;
  else update public.bands set name=fn,description=left(nullif(p->>'description',''),600) where id=k and organization_id=o and deleted_at is null; perform public.h_assert(found,'Banda não encontrada.','P0002');end if;
 elsif a='bandDelete' then
  perform public.h_assert(not exists(select 1 from public.schedules where organization_id=o and band_id=k and status='published'),'Feche as escalas publicadas antes de arquivar a banda.');
  update public.bands set deleted_at=now() where id=k and organization_id=o and deleted_at is null;perform public.h_assert(found,'Banda não encontrada.','P0002');
 elsif a in ('bandLink','bandUnlink') then
  if k is not null then
   select * into bm from public.band_members where id=k and organization_id=o;
   perform public.h_assert(bm.id is not null,'Vínculo não encontrado.','P0002');
   perform public.h_assert(public.h_manage_band(o,bm.band_id) and (rr='admin' or bm.band_role<>'leader'),'Você não pode alterar este vínculo.','42501');
  end if;
  if a='bandUnlink' then delete from public.band_members where id=k;
  else
   fn:=btrim(p->>'instrument_role');role_name:=p->>'band_role';
   perform public.h_assert(char_length(fn) between 1 and 75 and role_name in ('leader','member'),'Informe a função na banda.');
   perform public.h_assert(public.h_manage_band(o,b) and exists(select 1 from public.bands where id=b and organization_id=o and deleted_at is null) and (rr='admin' or role_name='member'),'Você não pode alterar este vínculo.','42501');
   perform public.h_assert(exists(select 1 from public.profiles where id=pid and organization_id=o and status='active' and deleted_at is null),'Selecione um membro ativo.');
   perform public.h_assert(rr='admin' or public.h_manage_profile(o,pid),'Escolha um integrante que você já gerencia.','42501');
   if role_name='leader' then perform public.h_assert(exists(select 1 from public.org_members where profile_id=pid and organization_id=o and org_role in ('leader','admin')),'Conceda o papel de líder em Administradores antes de promover na banda.');end if;
   if k is null then insert into public.band_members(organization_id,band_id,profile_id,instrument_role,band_role) values(o,b,pid,fn,role_name) returning id into k;
   else perform public.h_assert((bm.band_id,bm.profile_id)=(b,pid),'Não é possível transferir este vínculo.'); update public.band_members set instrument_role=fn,band_role=role_name where id=k;end if;
  end if;
 elsif a in ('scheduleSave','scheduleDuplicate','schedulePublish','scheduleClose','scheduleDelete') then
  if k is not null then
   select * into s from public.schedules where id=k and organization_id=o for update;
   perform public.h_assert(s.id is not null,'Escala não encontrada.','P0002');
   perform public.h_assert(public.h_manage_band(o,s.band_id),'Você não gerencia esta banda.','42501');
  else perform public.h_assert(a='scheduleSave','Informe a escala.');end if;
  if a in ('scheduleSave','scheduleDuplicate') then
   if a='scheduleDuplicate' then b:=s.band_id;end if;
   perform public.h_assert(public.h_manage_band(o,b) and exists(select 1 from public.bands where id=b and organization_id=o and deleted_at is null),'Você não gerencia uma banda ativa com este nome.','42501');
   perform public.h_assert(char_length(title) between 1 and 140 and (p->>'time') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$','Confira o título e o horário.');
   dt:=(p->>'event_date')::date;starts:=(dt+(p->>'time')::time) at time zone 'America/Sao_Paulo';
   deadline:=coalesce((p->>'confirm_deadline')::timestamptz,starts-make_interval(hours=>(select default_confirm_hours from public.organizations where id=o)));
   perform public.h_assert(deadline<=starts,'O prazo não pode ser depois do encontro.');
   if a='scheduleDuplicate' then
    insert into public.schedules(organization_id,band_id,title,event_date,starts_at,location,notes,confirm_deadline,duplicated_from,created_by) values(o,b,title,dt,starts,s.location,s.notes,deadline,s.id,who) returning id into k;
    insert into public.schedule_members(organization_id,schedule_id,profile_id,instrument_role) select o,k,m.profile_id,m.instrument_role from public.schedule_members m where m.schedule_id=s.id and m.status<>'replaced' and public.h_active_slot(o,b,m.profile_id);
    insert into public.schedule_songs(organization_id,schedule_id,song_id,position,notes) select o,k,ss.song_id,row_number() over(order by ss.position),ss.notes from public.schedule_songs ss join public.songs x on x.id=ss.song_id where ss.schedule_id=s.id and x.deleted_at is null;
   else
    perform public.h_assert(jsonb_typeof(p->'assignments')='array' and jsonb_array_length(p->'assignments')<=120 and jsonb_typeof(p->'repertoire')='array' and jsonb_array_length(p->'repertoire')<=100,'Limite de participantes ou músicas excedido.');
    perform public.h_assert(s.status is distinct from 'closed','Uma escala fechada não pode ser editada.');
    if s.status='published' then
     perform public.h_assert(s.band_id=b and jsonb_array_length(p->'assignments')>0,'Mantenha a banda e pelo menos um participante na escala publicada.');
     changed:=(s.title,s.starts_at,s.location,s.notes,s.confirm_deadline) is distinct from (title,starts,left(nullif(p->>'location',''),180),left(nullif(p->>'notes',''),1800),deadline);
     select coalesce(jsonb_agg(jsonb_build_object('song_id',ss.song_id,'notes',ss.notes) order by ss.position),'[]') is distinct from p->'repertoire' into repertoire_change from public.schedule_songs ss where ss.schedule_id=k;
    end if;
    if k is null then insert into public.schedules(organization_id,band_id,title,event_date,starts_at,location,notes,confirm_deadline,created_by) values(o,b,title,dt,starts,left(nullif(p->>'location',''),180),left(nullif(p->>'notes',''),1800),deadline,who) returning id into k;
    else update public.schedules set band_id=b,title=title,event_date=dt,starts_at=starts,location=left(nullif(p->>'location',''),180),notes=left(nullif(p->>'notes',''),1800),confirm_deadline=deadline where id=k;end if;
    for rowval in select value from jsonb_array_elements(p->'assignments') loop
     pid:=(rowval->>'profile_id')::uuid;fn:=btrim(rowval->>'instrument_role');
     perform public.h_assert(public.h_active_slot(o,b,pid) and char_length(fn) between 1 and 75,'Selecione um membro ativo desta banda com uma função.');
     select m.id into oid from public.schedule_members m where m.schedule_id=k and m.profile_id=pid and lower(m.instrument_role)=lower(fn) and m.status<>'replaced';
     if oid is null then
      insert into public.schedule_members(organization_id,schedule_id,profile_id,instrument_role) values(o,k,pid,fn) returning id into oid;
      touched:=array_append(touched,oid);
     end if;
     perform public.h_assert(not (oid=any(ids)),'Remova as funções repetidas.'); ids:=array_append(ids,oid);
    end loop;
    if s.status='published' then
     for r in select * from public.schedule_members m where m.schedule_id=k and m.status<>'replaced' and not (m.id=any(ids)) loop
      update public.schedule_members set status='replaced',access_token_hash=null,token_expires_at=null where id=r.id;
      perform public.h_queue_assignment(r.id,'schedule_changed',true);touched:=array_append(touched,r.id);
     end loop;
     if s.confirm_deadline is distinct from deadline then update public.schedule_members set access_token_hash=null,token_expires_at=null,link_version=link_version+1 where schedule_id=k and status<>'replaced';end if;
     for r in select * from public.schedule_members m where m.schedule_id=k and m.status<>'replaced' and (changed or repertoire_change or m.id=any(touched)) loop
      perform public.h_queue_assignment(r.id,'schedule_changed');
     end loop;
     if changed or repertoire_change or cardinality(touched)>0 then perform public.h_audit(o,who,'schedule_changed','schedules',k);end if;
    else
     delete from public.schedule_members m where m.schedule_id=k and not (m.id=any(ids));
    end if;
    delete from public.schedule_songs where schedule_id=k;
    for rowval in select value from jsonb_array_elements(p->'repertoire') loop
     oid:=(rowval->>'song_id')::uuid;
     perform public.h_assert(exists(select 1 from public.songs where id=oid and organization_id=o and deleted_at is null),'Música indisponível ou arquivada.');
     pos:=pos+1;insert into public.schedule_songs(organization_id,schedule_id,song_id,position,notes) values(o,k,oid,pos,left(nullif(rowval->>'notes',''),400));
    end loop;
   end if;
  elsif a='schedulePublish' then
   perform public.h_assert(s.status='draft' and s.confirm_deadline>now(),'A escala precisa ser rascunho e ter prazo de confirmação no futuro.');
   perform public.h_assert(exists(select 1 from public.bands where id=s.band_id and deleted_at is null),'A banda está arquivada.');
   perform public.h_assert(exists(select 1 from public.schedule_members where schedule_id=k) and not exists(select 1 from public.schedule_members m where m.schedule_id=k and not public.h_active_slot(o,s.band_id,m.profile_id)),'Escolha pelo menos um membro e atualize os que saíram da banda ou estão inativos.');
   update public.schedules set status='published',published_at=now() where id=k;
   for r in select * from public.schedule_members where schedule_id=k loop perform public.h_queue_assignment(r.id,'schedule_published');end loop;
   perform public.h_audit(o,who,'schedule_published','schedules',k);
  elsif a='scheduleClose' then
   perform public.h_assert(s.status='published','A escala precisa estar publicada.');
   update public.schedules set status='closed' where id=k;
   update public.schedule_members set access_token_hash=null,token_expires_at=null where schedule_id=k;
   perform public.h_audit(o,who,'schedule_closed','schedules',k);
  elsif a='scheduleDelete' then
   perform public.h_assert(s.status='draft','Apenas rascunhos podem ser excluídos.');delete from public.schedules where id=k;
  end if;
 elsif a in ('scheduleReplace','scheduleRespond') then
  select sc.* into s from public.schedules sc join public.schedule_members sm on sm.schedule_id=sc.id where sm.id=k and sc.organization_id=o for update of sc;
  select * into r from public.schedule_members where id=k and organization_id=o for update;
  perform public.h_assert(r.id is not null and r.status<>'replaced','Esta participação já foi substituída ou não existe.','P0002');
  if a='scheduleReplace' then
   perform public.h_assert(public.h_manage_band(o,s.band_id),'Você não gerencia esta banda.','42501');
   perform public.h_assert(s.status='published' and pid<>r.profile_id and public.h_active_slot(o,s.band_id,pid),'Escolha outro membro ativo da banda em uma escala publicada.');
   perform public.h_assert(not exists(select 1 from public.schedule_members sm where sm.schedule_id=s.id and sm.profile_id=pid and lower(sm.instrument_role)=lower(r.instrument_role) and sm.status<>'replaced'),'O substituto já está escalado nesta função.');
   update public.schedule_members set status='replaced',replaced_by=pid,access_token_hash=null,token_expires_at=null where id=k;
   insert into public.schedule_members(organization_id,schedule_id,profile_id,instrument_role) values(o,s.id,pid,r.instrument_role) returning id into oid;
   perform public.h_queue_assignment(oid,'schedule_changed');perform public.h_audit(o,who,'member_replaced','schedule_members',k);
  else
   if (p->>'manager')::boolean then perform public.h_assert(public.h_manage_band(o,s.band_id) and s.status<>'draft','Sem permissão para responder pela liderança.','42501');
   else perform public.h_assert(s.status='published' and s.confirm_deadline>now() and public.manages_profile(r.profile_id),'Você não pode responder a esta escala ou o prazo já passou.','42501');end if;
   perform public.h_assert(exists(select 1 from public.profiles where id=r.profile_id and status='active' and deleted_at is null),'Este perfil está inativo.');
   status_value:=p->>'status';perform public.h_assert(status_value in ('confirmed','declined'),'Resposta inválida.');
   note:=case when status_value='declined' then left(nullif(concat_ws(E'\n',nullif(p->>'reason',''),case when nullif(p->>'substitute','') is not null then 'Sugestão de substituto: '||(p->>'substitute') end),''),1000) end;
   update public.schedule_members set status=status_value,responded_at=now(),responded_by=who,decline_note=note where id=k;
   if status_value='declined' and r.status<>'declined' then perform public.h_queue_decline(o,s.id,k);end if;
  end if;
  k:=s.id;
 elsif a in ('songSave','songDelete','songLink','songFileDelete') then
  perform public.h_assert(public.h_can_music(o),'Você não pode editar a biblioteca.','42501');
  if a='songSave' then
   perform public.h_assert(char_length(title) between 1 and 150,'Informe o título da música.');
   if k is null then insert into public.songs(organization_id,title,key,bpm,author,category,notes) values(o,title,left(nullif(p->>'key',''),16),(p->>'bpm')::int,left(nullif(p->>'author',''),120),nullif(p->>'category',''),left(nullif(p->>'notes',''),1800)) returning id into k;
   else update public.songs set title=title,key=left(nullif(p->>'key',''),16),bpm=(p->>'bpm')::int,author=left(nullif(p->>'author',''),120),category=nullif(p->>'category',''),notes=left(nullif(p->>'notes',''),1800) where id=k and organization_id=o and deleted_at is null;perform public.h_assert(found,'Música não encontrada.','P0002');end if;
  elsif a='songDelete' then
   update public.songs set deleted_at=now() where id=k and organization_id=o and deleted_at is null;perform public.h_assert(found,'Música não encontrada.','P0002');perform public.h_audit(o,who,'song_deleted','songs',k);
  elsif a='songLink' then
   sid:=(p->>'song_id')::uuid;perform public.h_assert(exists(select 1 from public.songs where id=sid and organization_id=o and deleted_at is null),'Música não encontrada.','P0002');
   perform public.h_assert(char_length(p->>'url') between 1 and 2048,'Informe um link válido.');
   insert into public.song_files(organization_id,song_id,kind,label,url) values(o,sid,'link',left(nullif(p->>'label',''),100),p->>'url') returning id into k;
  else
   delete from public.song_files where id=k and organization_id=o returning * into f;perform public.h_assert(found,'Arquivo não encontrado.','P0002');
  end if;
 elsif a='availabilitySet' then
  perform public.h_assert(exists(select 1 from public.profiles where id=pid and organization_id=o and status='active' and deleted_at is null) and (rr='admin' or public.manages_profile(pid)),'Você não pode marcar datas para este perfil.','42501');
  dt:=(p->>'date')::date;
  if (p->>'blocked')::boolean then insert into public.unavailability(organization_id,profile_id,date,reason) values(o,pid,dt,left(nullif(p->>'reason',''),300)) on conflict(profile_id,date) do update set reason=excluded.reason;
  else delete from public.unavailability u where u.profile_id=pid and u.date=dt;end if;
 elsif a in ('noticeSave','noticePublish','noticeDelete','noticeExpire') then
  if k is not null then
   select * into n from public.announcements where id=k and organization_id=o and deleted_at is null for update;
   perform public.h_assert(n.id is not null,'Aviso não encontrado.','P0002');perform public.h_assert(rr='admin' or (n.band_id is not null and public.is_band_leader(n.band_id)),'Você não gerencia este aviso.','42501');
  else perform public.h_assert(a='noticeSave','Informe o aviso.');end if;
  if a='noticeSave' then
   perform public.h_assert((b is null and rr='admin') or (b is not null and public.h_manage_band(o,b) and exists(select 1 from public.bands where id=b and organization_id=o and deleted_at is null)),'Você não pode publicar para este público.','42501');
   note:=btrim(p->>'body');exp:=(p->>'expires_at')::timestamptz;
   perform public.h_assert(char_length(title) between 1 and 140 and char_length(note) between 1 and 3000,'Informe o título e a mensagem.');
   perform public.h_assert(n.status is distinct from 'published' or n.band_id is not distinct from b,'O público não pode mudar depois de publicar.');
   if k is null then insert into public.announcements(organization_id,band_id,title,body,expires_at,send_email,created_by) values(o,b,title,note,exp,coalesce((p->>'send_email')::boolean,false),who) returning id into k;
   else update public.announcements set band_id=b,title=title,body=note,expires_at=exp,send_email=coalesce((p->>'send_email')::boolean,false) where id=k;end if;
  elsif a='noticePublish' then
   perform public.h_assert(n.status='draft' and (n.expires_at is null or n.expires_at>now()),'O aviso não é rascunho ou a expiração já passou.');
   update public.announcements set status='published',published_at=now() where id=k;
   if n.send_email then
    insert into public.notification_log(organization_id,announcement_id,profile_id,type)
    select distinct o,k,public.h_recipient(pr.id),'announcement' from public.profiles pr join public.org_members om on om.profile_id=pr.id
    where pr.organization_id=o and (n.band_id is null or exists(select 1 from public.band_members m where m.band_id=n.band_id and m.profile_id=pr.id)) and public.h_recipient(pr.id) is not null;
   end if;
  elsif a='noticeExpire' then perform public.h_assert(n.status='published','Publique o aviso antes de expirar.');update public.announcements set expires_at=now() where id=k;
  else update public.announcements set deleted_at=now() where id=k;end if;
 elsif a='inviteRevoke' then
  update public.admin_invites set revoked_at=now() where id=k and organization_id=o and accepted_at is null and revoked_at is null;
  perform public.h_assert(found,'Convite não encontrado ou já utilizado.','P0002');
 else raise exception using errcode='22023',message='Ação indisponível.';end if;
 return jsonb_build_object('id',k);
end$$;

revoke all on function public.h_assert(boolean,text,text),public.h_audit(uuid,uuid,text,text,uuid),public.h_email_valid(text),public.h_role_value(text),public.h_recipient(uuid),public.h_queue_assignment(uuid,text,boolean),public.h_queue_decline(uuid,uuid,uuid),public.h_active_slot(uuid,uuid,uuid),public.h_save_profile(uuid,uuid,text,jsonb),public.hallel_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.hallel_command(uuid,text,jsonb) to authenticated;

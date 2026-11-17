-- Opaque links, verified account binding and restricted notification queue.
create function public.hallel_links(o uuid,sid uuid,mid uuid, pending_only boolean) returns table(id uuid,full_name text,link_version int,title text,starts_at timestamptz,confirm_deadline timestamptz) language plpgsql security definer set search_path='' as $$
begin
 perform public.h_assert(exists(select 1 from public.schedules x where x.organization_id=o and x.id=sid and public.h_manage_band(o,x.band_id)),'Você não gerencia esta escala.','42501');
 return query select m.id,p.full_name,m.link_version,s.title,s.starts_at,s.confirm_deadline
 from public.schedule_members m join public.schedules s on s.id=m.schedule_id join public.profiles p on p.id=m.profile_id
 where m.schedule_id=sid and m.organization_id=o and (mid is null or m.id=mid) and (not pending_only or m.status='pending') and m.status<>'replaced' and s.status='published' and s.confirm_deadline>now() and p.status='active' and p.deleted_at is null and exists(select 1 from public.org_members om where om.profile_id=p.id) and (p.birth_date is null or p.birth_date<=((now() at time zone 'America/Sao_Paulo')::date-interval '13 years')::date);
end$$;
create function public.hallel_store_links(rows jsonb) returns uuid[] language plpgsql security definer set search_path='' as $$
declare saved uuid[];
begin
 with u as (
   update public.schedule_members r set access_token_hash=(j.item->>'hash'),token_expires_at=s.confirm_deadline
   from public.schedules s,public.profiles p,jsonb_array_elements(rows) j(item)
   where r.id=(j.item->>'id')::uuid and r.link_version=(j.item->>'version')::int and r.schedule_id=s.id and r.profile_id=p.id and r.status<>'replaced' and s.status='published' and s.confirm_deadline>now() and p.status='active' and p.deleted_at is null and exists(select 1 from public.org_members om where om.profile_id=p.id) and (p.birth_date is null or p.birth_date<=((now() at time zone 'America/Sao_Paulo')::date-interval '13 years')::date) returning r.id
 ) select coalesce(array_agg(u.id),array[]::uuid[]) into saved from u;
 return saved;
end$$;
create function public.hallel_guest(token text, reply text default null, note text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.schedules%rowtype;r public.schedule_members%rowtype; p public.profiles%rowtype;
begin
 if reply is not null then
  select sc.* into s from public.schedules sc join public.schedule_members m on m.schedule_id=sc.id where m.access_token_hash=token for update of sc;
  select * into r from public.schedule_members m where m.access_token_hash=token for update;
 else
  select * into r from public.schedule_members m where m.access_token_hash=token;
  select * into s from public.schedules where id=r.schedule_id;
 end if;
 select * into p from public.profiles where id=r.profile_id;
 if r.id is null or r.status='replaced' or r.token_expires_at<=now() or s.status<>'published' or s.confirm_deadline<=now() or p.status<>'active' or p.deleted_at is not null or not exists(select 1 from public.org_members om where om.profile_id=p.id) or p.birth_date>((now() at time zone 'America/Sao_Paulo')::date-interval '13 years')::date then return null;end if;
 if reply is not null then
  perform public.h_assert(reply in ('confirmed','declined'),'Resposta inválida.');
  update public.schedule_members set status=reply,responded_at=now(),responded_by=null,decline_note=case when reply='declined' then left(note,1000) end where id=r.id;
  if reply='declined' and r.status<>'declined' then perform public.h_queue_decline(s.organization_id,s.id,r.id);end if;
  r.status:=reply;
 end if;
 return jsonb_build_object('title',s.title,'starts_at',s.starts_at,'location',s.location,'confirm_deadline',s.confirm_deadline,'instrument_role',r.instrument_role,'first_name',split_part(p.full_name,' ',1),'status',r.status);
end$$;

create function public.hallel_invite_create(o uuid,i uuid,email_address text,role_name text,hash_value text) returns uuid language plpgsql security definer set search_path='' as $$
declare who uuid:=public.h_viewer(o); em text:=lower(btrim(email_address));
begin
 perform public.h_assert(public.is_org_admin(o),'Apenas administradores podem convidar.','42501');
 perform public.h_assert(public.h_email_valid(em) and public.h_role_value(role_name) and hash_value~'^[0-9a-f]{64}$','E-mail, papel ou token inválido.');
 perform 1 from public.organizations where id=o for update;
 perform public.h_assert(not exists(select 1 from public.profiles p join public.org_members m on m.profile_id=p.id where p.organization_id=o and lower(p.email)=em and p.user_id is not null and p.status='active' and p.deleted_at is null),'Este membro já tem acesso. Altere o papel na lista.');
 update public.admin_invites set revoked_at=now() where organization_id=o and email=em and accepted_at is null and revoked_at is null;
 insert into public.admin_invites(id,organization_id,email,org_role,token_hash,invited_by) values(i,o,em,role_name,hash_value,who);
 insert into public.notification_log(organization_id,invite_id,type) values(o,i,'admin_invite');
 perform public.h_audit(o,who,'invite_created','admin_invites',i);
 return i;
end$$;
create function public.hallel_preflight(org_slug text,email_address text,invite_hash text default null) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.organizations o where o.slug=org_slug and (
  (invite_hash is not null and exists(select 1 from public.admin_invites i where i.organization_id=o.id and i.token_hash=invite_hash and i.email=lower(email_address) and i.accepted_at is null and i.revoked_at is null and i.expires_at>now()))
  or (invite_hash is null and exists(select 1 from public.profiles p join public.org_members m on m.profile_id=p.id where p.organization_id=o.id and lower(p.email)=lower(email_address) and p.status='active' and p.deleted_at is null and (p.birth_date is null or p.birth_date<=((now() at time zone 'America/Sao_Paulo')::date-interval '13 years')::date)))
 ))$$;
create function public.hallel_invite_check(org_slug text,invite_hash text) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.admin_invites i join public.organizations o on o.id=i.organization_id where o.slug=org_slug and i.token_hash=invite_hash and i.accepted_at is null and i.revoked_at is null and i.expires_at>now())$$;
create function public.hallel_link_account(org_slug text,invite_hash text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=(select auth.uid()); o uuid; em text; p public.profiles%rowtype; i public.admin_invites%rowtype; pid uuid; existing_role text;
begin
 select lower(email) into em from auth.users where id=u and email_confirmed_at is not null;
 select id into o from public.organizations where slug=org_slug;
 perform public.h_assert(u is not null and em is not null and o is not null,'Use uma conta com e-mail verificado.','42501');
 if invite_hash is not null then
  select * into i from public.admin_invites where token_hash=invite_hash and organization_id=o for update;
  perform public.h_assert(i.id is not null and i.accepted_at is null and i.revoked_at is null and i.expires_at>now() and i.email=em,'O convite expirou, já foi usado ou pertence a outro e-mail.','42501');
 end if;
 select * into p from public.profiles where organization_id=o and lower(email)=em and deleted_at is null for update;
 if p.id is null then
  perform public.h_assert(i.id is not null,'Seu e-mail ainda não está cadastrado no ministério.','42501');
  insert into public.profiles(organization_id,user_id,full_name,email) values(o,u,left(split_part(em,'@',1),120),em) returning id into pid;
  insert into public.org_members(organization_id,profile_id,org_role) values(o,pid,i.org_role);
  perform public.h_audit(o,i.invited_by,'role_changed','profiles',pid);
 else
  pid:=p.id;
  perform public.h_assert(p.status='active' and (p.user_id is null or p.user_id=u) and (p.birth_date is null or p.birth_date<=((now() at time zone 'America/Sao_Paulo')::date-interval '13 years')::date),'Este perfil não pode acessar o sistema.','42501');
  select org_role into existing_role from public.org_members where organization_id=o and profile_id=pid;
  perform public.h_assert(i.id is not null or existing_role is not null,'Seu acesso foi removido.','42501');
  update public.profiles set user_id=u where id=pid and user_id is null;
  if i.id is not null then
   insert into public.org_members(organization_id,profile_id,org_role) values(o,pid,i.org_role) on conflict(organization_id,profile_id) do update set org_role=excluded.org_role;
   if existing_role is distinct from i.org_role then perform public.h_audit(o,i.invited_by,'role_changed','profiles',pid);end if;
  end if;
 end if;
 if i.id is not null then update public.admin_invites set accepted_at=now() where id=i.id;end if;
 return pid;
end$$;

create function public.hallel_queue_reminders() returns integer language plpgsql security definer set search_path='' as $$
declare amount int;
begin
 insert into public.notification_log(organization_id,schedule_id,profile_id,assignment_id,type)
 select distinct on (s.id,public.h_recipient(m.profile_id)) s.organization_id,s.id,public.h_recipient(m.profile_id),m.id,'reminder'
 from public.schedules s join public.schedule_members m on m.schedule_id=s.id
 where s.status='published' and s.confirm_deadline>now() and s.confirm_deadline<=now()+interval '24 hours' and m.status='pending' and public.h_recipient(m.profile_id) is not null
 order by s.id,public.h_recipient(m.profile_id),m.id on conflict do nothing;
 get diagnostics amount=row_count;
 return amount;
end$$;
create function public.hallel_claim_mail(amount integer) returns table (id uuid,organization_id uuid,type text,recipient text,recipient_name text,sender text,org_name text,schedule_id uuid,assignment_id uuid,invite_id uuid,link_version int,title text,starts_at timestamptz,deadline timestamptz,schedule_status text,assignment_status text,is_minor boolean,notice_body text,attempts int)
 language sql security definer set search_path='' as $$
 with todo as (
  select q.id from public.notification_log q where q.attempts<4 and ((q.status in ('queued','failed') and q.retry_at<=now()) or (q.status='sending' and q.claimed_at<now()-interval '5 minutes')) order by q.created_at for update skip locked limit greatest(1,least(amount,50))
 ), claimed as (
  update public.notification_log q set status='sending',attempts=q.attempts+1,claimed_at=now() where q.id in(select t.id from todo t) returning q.*
 )
 select q.id,q.organization_id,q.type,
  case when q.invite_id is not null then case when i.accepted_at is null and i.revoked_at is null and i.expires_at>now() then i.email end
  when p.status='active' and p.deleted_at is null and (q.type not in ('schedule_published','schedule_changed','reminder') or (target.status='active' and target.deleted_at is null)) and (q.type<>'reminder' or (m.status='pending' and s.confirm_deadline>now() and s.status='published'))
    and (q.type<>'schedule_published' or (m.status<>'replaced' and s.status='published'))
    and (q.type<>'schedule_changed' or s.status='published')
    and (q.type<>'announcement' or (n.status='published' and n.deleted_at is null and (n.expires_at is null or n.expires_at>now()))) then p.email end,
  p.full_name,o.email_sender,o.name,q.schedule_id,q.assignment_id,q.invite_id,m.link_version,coalesce(s.title,n.title),s.starts_at,s.confirm_deadline,s.status,m.status,
  coalesce(target.birth_date>((now() at time zone 'America/Sao_Paulo')::date-interval '13 years')::date,false),n.body,q.attempts
 from claimed q join public.organizations o on o.id=q.organization_id left join public.profiles p on p.id=q.profile_id left join public.schedules s on s.id=q.schedule_id left join public.schedule_members m on m.id=q.assignment_id left join public.profiles target on target.id=m.profile_id left join public.announcements n on n.id=q.announcement_id left join public.admin_invites i on i.id=q.invite_id
$$;
create function public.hallel_finish_mail(i uuid, attempt_no int, sent boolean, cancelled boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare q public.notification_log%rowtype;begin
 update public.notification_log set status=case when sent then 'sent' else 'failed' end,sent_at=case when sent then now() else null end,
 retry_at=now()+interval '15 minutes',attempts=case when cancelled then 4 else attempts end where id=i and status='sending' and attempts=attempt_no returning * into q;
 if sent and q.type='reminder' then update public.schedules set reminder_sent_at=coalesce(reminder_sent_at,now()) where id=q.schedule_id;end if;
end$$;

revoke all on function public.hallel_links(uuid,uuid,uuid,boolean),public.hallel_store_links(jsonb),public.hallel_guest(text,text,text),public.hallel_invite_create(uuid,uuid,text,text,text),public.hallel_preflight(text,text,text),public.hallel_invite_check(text,text),public.hallel_link_account(text,text),public.hallel_queue_reminders(),public.hallel_claim_mail(int),public.hallel_finish_mail(uuid,int,boolean,boolean) from public,anon,authenticated;
grant execute on function public.hallel_links(uuid,uuid,uuid,boolean),public.hallel_invite_create(uuid,uuid,text,text,text),public.hallel_link_account(text,text) to authenticated;
grant execute on function public.hallel_store_links(jsonb),public.hallel_guest(text,text,text),public.hallel_preflight(text,text,text),public.hallel_invite_check(text,text),public.hallel_queue_reminders(),public.hallel_claim_mail(int),public.hallel_finish_mail(uuid,int,boolean,boolean) to service_role;

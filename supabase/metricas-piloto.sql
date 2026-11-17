-- Execute no SQL Editor como manutenção, para o período do piloto.
-- Ajuste slug e datas no CTE antes de usar os resultados.
select count(*) as membros_cadastrados
from public.profiles p join public.organizations o on o.id=p.organization_id
join public.org_members om on om.profile_id=p.id
where o.slug='har-tzion' and p.status='active' and p.deleted_at is null and p.user_id is not null
and exists(select 1 from public.band_members bm join public.bands b on b.id=bm.band_id where bm.profile_id=p.id and b.deleted_at is null);

with janela as (
 select 'har-tzion'::text as slug, current_date-28 as inicio, current_date+1 as fim
), respostas as (
 select s.id, count(*) filter(where m.status in ('confirmed','declined','replaced'))::numeric/nullif(count(*),0) as taxa
 from public.schedules s join public.organizations o on o.id=s.organization_id join janela j on j.slug=o.slug
 join public.schedule_members m on m.schedule_id=s.id
 where s.status in ('published','closed') and s.event_date>=j.inicio and s.event_date<j.fim
 group by s.id
)
select count(*) as escalas, count(*) filter(where taxa>=0.8) as com_pelo_menos_80_porc_respostas,
round(100.0*count(*) filter(where taxa>=0.8)/nullif(count(*),0),1) as percentual_do_periodo from respostas;

-- Substitua o nome e o e-mail antes de executar no SQL Editor do seu projeto.
-- Execute uma vez, depois das migrações. O primeiro login vincula o perfil cadastrado.
begin;
do $$
declare o uuid; p uuid; first_admin_email text:='ALTERAR@example.com'; first_admin_name text:='Alterar Nome'; b text;
begin
 if lower(first_admin_email)='alterar@example.com' then raise exception 'Defina o e-mail real do primeiro administrador.';end if;
 insert into public.organizations(name,slug) values('Congregação Har Tzion','har-tzion') returning id into o;
 insert into public.profiles(organization_id,full_name,email) values(o,first_admin_name,lower(first_admin_email)) returning id into p;
 insert into public.org_members(organization_id,profile_id,org_role) values(o,p,'admin');
 foreach b in array array['Ahuvi','Hineni','Simchá','Shoresh','Hallel Delas'] loop insert into public.bands(organization_id,name) values(o,b);end loop;
end$$;
commit;

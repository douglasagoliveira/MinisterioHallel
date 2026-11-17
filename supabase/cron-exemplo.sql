-- Crie os segredos no Vault do seu projeto (por exemplo, pelo painel do Supabase):
-- hallel_cron_secret: o mesmo valor de HALLEL_CRON_SECRET no Next.js e na Edge Function
-- hallel_cron_endpoint: https://<projeto>.supabase.co/functions/v1/reminders
-- Ative pg_cron e pg_net no painel antes de executar. A função precisa estar publicada.
select cron.schedule('hallel-reminders-hourly','0 * * * *', $$
 select net.http_post(
   url := (select decrypted_secret from vault.decrypted_secrets where name='hallel_cron_endpoint'),
   headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='hallel_cron_secret')),
   body := '{}'::jsonb,
   timeout_milliseconds := 55000
 );
$$);

select cron.schedule('hallel-mail-drain','5,20,35,50 * * * *', $$
 select net.http_post(
   url := (select decrypted_secret from vault.decrypted_secrets where name='hallel_cron_endpoint'),
   headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='hallel_cron_secret')),
   body := '{"task":"mail"}'::jsonb,
   timeout_milliseconds := 55000
 );
$$);

// Deploy with JWT verification off: the function accepts only the separate cron secret.
Deno.serve(async (req) => {
  const secret = Deno.env.get('HALLEL_CRON_SECRET');
  const site = Deno.env.get('HALLEL_BASE_URL');
  if (req.method !== 'POST' || !secret || !site) return new Response(null, { status: 404 });
  const expected = new TextEncoder().encode(`Bearer ${secret}`);
  const supplied = new TextEncoder().encode(req.headers.get('authorization') ?? '');
  let diff = expected.length ^ supplied.length;
  for(let i=0;i<expected.length;i++) diff |= expected[i] ^ (supplied[i] ?? 0);
  if(diff !== 0) return new Response(null, { status: 401 });
  try {
    const url = new URL('/api/cron/reminders',site);
    const input = await req.json().catch(()=>null);
    if(input?.task==='mail')url.searchParams.set('task','mail');
    const res = await fetch(url, {method:'POST', headers:{authorization:`Bearer ${secret}`}, signal:AbortSignal.timeout(55000)});
    return new Response(await res.text(),{status:res.status, headers:{'Content-Type':'application/json'}});
  } catch { return Response.json({error:'Não foi possível executar a tarefa.'},{status:502}); }
});

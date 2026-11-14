// Keeps the free Supabase project from pausing after a week without activity (.github/workflows/supabase-keepalive.yml).
// One read through the project's REST API with the public key the site already ships: no secret, and it changes nothing.
// The tables grant the public role nothing, so an answer of 401 or 403 is the expected one: it still reaches the database.
// Alive is any answer below 500. A network failure or a 5xx (a paused project answers with one) fails the run, which
// makes GitHub send an email.
import {fileURLToPath} from 'node:url';

export async function ping({url, key, fetcher = fetch}) {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || !key) throw Error('services-config.js has no Supabase project');
  const response = await fetcher(`${url}/rest/v1/portfolio_feedback?select=id&limit=1`, {
    headers: {apikey: key, Authorization: `Bearer ${key}`}, signal: AbortSignal.timeout(20000),
  });
  if (response.status >= 500) throw Error(`Supabase answered ${response.status}: the project may be paused or down`);
  return response.status;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const {services} = await import('../ocean-refined/services-config.js');
  try { console.log(`Supabase answered ${await ping({url: services.supabaseURL, key: services.supabaseKey})}: the project is awake.`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

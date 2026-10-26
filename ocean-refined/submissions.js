import {services} from './services-config.js';

async function submit(kind, body, headers = {}) {
  const response = await fetch(`${services.supabaseURL}/functions/v1/portfolio-intake/${kind}`, {
    method:'POST', headers:{apikey:services.supabaseKey, ...headers}, body,
    signal:AbortSignal.timeout(20000),
  });
  const result = await response.json().catch(()=>({}));
  if (!response.ok || result.saved !== true) throw Error(result.error || 'Could not save your submission. Please try again.');
  return result;
}
export function sendFeedback(record) {
  return submit('feedback', JSON.stringify(record), {'Content-Type':'application/json'});
}
export function sendPhoto(blob) {
  return submit('photo', blob, {'Content-Type':'image/jpeg', 'x-request-id':crypto.randomUUID()});
}

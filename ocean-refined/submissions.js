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
// A shared reef photo may carry a short note (up to NOTE_WORDS words), sent URI-encoded in a header beside the JPEG.
export const NOTE_WORDS = 40;
export const wordCount = text => (String(text).match(/\S+/g) || []).length;
export function sendPhoto(blob, note = '', id = crypto.randomUUID()) {
  const text = String(note).trim(), headers = {'Content-Type':'image/jpeg', 'x-request-id':id};
  if (text) headers['x-photo-note'] = encodeURIComponent(text);
  return submit('photo', blob, headers);
}

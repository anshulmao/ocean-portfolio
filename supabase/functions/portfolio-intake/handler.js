const MAX_PHOTO = 1024 * 1024;
const NOTE_WORDS = 40, NOTE_CHARS = 400;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const DEFAULT_ORIGINS = ['https://anshul-portfolio-rho.vercel.app', 'http://127.0.0.1:4190', 'http://localhost:4190'];

export function validateFeedback(input) {
  if (!input || !UUID.test(input.id) || !Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw Error('Choose a rating from 1 to 5.');
  if (typeof input.feedback !== 'string' || input.feedback.length > 2000) throw Error('Your note must be 2000 characters or fewer.');
  if (typeof input.depthMeters !== 'number' || !Number.isFinite(input.depthMeters) || input.depthMeters < 0 || input.depthMeters > 40) throw Error('Invalid dive depth.');
  const consent = input.contact?.consent === true;
  const name = consent ? input.contact.name : null, email = consent ? input.contact.email : null;
  if (consent && (typeof name !== 'string' || name.length > 100 || typeof email !== 'string' || email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))) throw Error('Please check your contact details.');
  return {id: input.id, rating: input.rating, feedback: input.feedback.trim(), depth_meters: input.depthMeters,
    contact_consent: consent, contact_name: consent ? name.trim() || null : null, contact_email: consent ? email.trim() || null : null};
}

// A shared photo's optional note arrives URI-encoded in x-photo-note: up to NOTE_WORDS words and NOTE_CHARS characters.
export function readPhotoNote(header) {
  if (header == null || header === '') return null;
  let text;
  try { text = decodeURIComponent(header); } catch { throw Error('Invalid note.'); }
  text = text.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  if (!text) return null;
  if (text.length > NOTE_CHARS || (text.match(/\S+/g) || []).length > NOTE_WORDS) throw Error(`Keep your note to ${NOTE_WORDS} words.`);
  return text;
}

async function readLimited(request, limit) {
  if (Number(request.headers.get('content-length')) > limit) throw Error('too-large');
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw Error('too-large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

// Dependencies are injected so the same handler can be verified without a live database.
export function createIntakeHandler({url, secret, publicKey, origins = DEFAULT_ORIGINS, fetcher = fetch}) {
  const serverHeaders = {apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json'};
  async function rest(route, body, extra = {}) {
    return fetcher(`${url}/rest/v1/${route}`, {method: 'POST', headers: {...serverHeaders, ...extra}, body: JSON.stringify(body), signal: AbortSignal.timeout(10000)});
  }
  async function quota(key, limit, seconds) {
    const response = await rest('rpc/portfolio_take_quota', {p_key: key, p_limit: limit, p_seconds: seconds});
    if (!response.ok) throw Error('storage');
    return await response.json() === true;
  }
  return async request => {
    const origin = request.headers.get('origin');
    const headers = {'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin'};
    if (origins.includes(origin)) Object.assign(headers, {'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type, apikey, x-request-id, x-photo-note'});
    const respond = (status, body) => new Response(JSON.stringify(body), {status, headers});
    if (!origins.includes(origin)) return respond(403, {error: 'This site is not allowed to submit.'});
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers});
    if (request.method !== 'POST') return respond(405, {error: 'Use POST.'});
    // A publishable key identifies this application; quotas, validation and private tables
    // provide the protection. It is not a visitor identity or a privileged credential.
    if (!publicKey || request.headers.get('apikey') !== publicKey) return respond(401, {error: 'Invalid application key.'});
    const kind = new URL(request.url).pathname.split('/').pop();
    if (!['feedback', 'photo'].includes(kind)) return respond(404, {error: 'Unknown submission type.'});
    try {
      const bytes = await readLimited(request, kind === 'photo' ? MAX_PHOTO : 16000);
      let record;
      if (kind === 'feedback') {
        if (!request.headers.get('content-type')?.startsWith('application/json')) return respond(415, {error: 'Send JSON.'});
        let input;
        try { input = JSON.parse(new TextDecoder().decode(bytes)); record = validateFeedback(input); }
        catch (error) { return respond(400, {error: error instanceof SyntaxError ? 'Invalid feedback.' : error.message}); }
      } else {
        const id = request.headers.get('x-request-id');
        if (!UUID.test(id || '') || request.headers.get('content-type') !== 'image/jpeg' || bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) return respond(400, {error: 'Share a JPEG reef photo, up to 1 MB.'});
        let note;
        try { note = readPhotoNote(request.headers.get('x-photo-note')); } catch (error) { return respond(400, {error: error.message}); }
        record = {id, storage_path: `${id}.jpg`, bytes: bytes.length, ...(note ? {note} : {})};
      }
      // The daily global ceiling bounds abuse even if forwarded IP headers are spoofed.
      // Only an HMAC is persisted, never a raw address.
      const ip = (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim().slice(0,100);
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
      const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip)));
      const fingerprint = [...digest].map(v=>v.toString(16).padStart(2,'0')).join('');
      if (!await quota(`${kind}:global`, kind === 'photo' ? 20 : 500, 86400) || !await quota(`${kind}:${fingerprint}`, kind === 'photo' ? 3 : 5, 3600)) return respond(429, {error: 'Submission limit reached. Please try again later.'});
      if (kind === 'feedback') {
        const saved = await rest('portfolio_feedback?on_conflict=id', record, {Prefer: 'resolution=ignore-duplicates,return=minimal'});
        if (!saved.ok) throw Error('storage');
      } else {
        const objectURL = `${url}/storage/v1/object/reef-photos/${record.storage_path}`;
        const uploaded = await fetcher(objectURL, {method:'POST', headers:{apikey:secret, Authorization:`Bearer ${secret}`, 'Content-Type':'image/jpeg', 'x-upsert':'false'}, body:bytes, signal:AbortSignal.timeout(15000)});
        if (!uploaded.ok) throw Error('storage');
        const saved = await rest('portfolio_photos', record);
        if (!saved.ok) {
          await fetcher(`${url}/storage/v1/object/reef-photos`, {method:'DELETE', headers:serverHeaders, body:JSON.stringify({prefixes:[record.storage_path]}), signal:AbortSignal.timeout(10000)});
          throw Error('storage');
        }
      }
      return respond(201, {id:record.id, saved:true});
    } catch (error) {
      if (error.message === 'too-large') return respond(413, {error:'This submission is too large.'});
      return respond(503, {error:'Could not save your submission. Please try again.'});
    }
  };
}

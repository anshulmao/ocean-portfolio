export const EVENT_PROPERTIES = {
  '$pageview':['project_id','experience'], '$pageleave':[],
  portfolio_section_opened:['section','project_id'], project_opened:['project_id','experience'],
  project_link_clicked:['destination'], resume_clicked:['action'], contact_clicked:['channel'],
  dive_started:[], dive_completed:[], feedback_started:[], feedback_saved:['rating'],
  reef_photo_downloaded:[], reef_photo_shared:[], artifact_collected:['artifact_id'],
};
export function eventProperties(event, properties = {}) {
  if (!Object.hasOwn(EVENT_PROPERTIES,event)) return null;
  return Object.fromEntries(EVENT_PROPERTIES[event].filter(key=>Object.hasOwn(properties,key))
    .map(key=>[key,properties[key]]).filter(([,value])=>typeof value==='number' ? Number.isFinite(value) : typeof value==='string' && /^[a-z0-9_-]{1,60}$/i.test(value)));
}
export function safeURL(value) {
  try { const url = new URL(value); return ['https:','http:'].includes(url.protocol) ? url.origin + url.pathname : ''; }
  catch { return ''; }
}
export function sanitizeEvent(event) {
  if (!event) return null;
  // Keep SDK measurement fields, remove all URL queries, fragments, person updates,
  // campaign strings and initial attribution values which can contain personal data.
  const properties = {...event.properties};
  for (const key of Object.keys(properties)) {
    if (key === '$set' || key === '$set_once' || /initial_|utm_|gclid|fbclid|msclkid/i.test(key)) delete properties[key];
    else if (/url|referrer/i.test(key) && typeof properties[key] === 'string') properties[key] = safeURL(properties[key]);
  }
  return {...event, properties};
}

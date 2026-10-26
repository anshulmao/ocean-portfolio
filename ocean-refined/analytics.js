import {services} from './services-config.js';
import {eventProperties, sanitizeEvent} from './analytics-privacy.js';

const CONSENT_KEY = 'ocean-analytics-consent-v1';
let enabled = false, client = null, loading = null;
try { enabled = localStorage.getItem(CONSENT_KEY) === 'yes'; } catch {}
if (navigator.globalPrivacyControl === true || navigator.doNotTrack === '1') enabled = false;
const configured = /^phc_/.test(services.posthogToken) && /^https:\/\//.test(services.posthogHost);
export function track(event, properties = {}) {
  if (!enabled || !client) return;
  const clean = eventProperties(event,properties);
  if (clean) try { client.capture(event,clean); } catch { /* Analytics never interrupts the portfolio. */ }
}
function pageview() {
  const project = location.pathname.match(/\/projects\/([a-z0-9-]+)\//)?.[1];
  track('$pageview',{experience:document.body.classList.contains('reading-page')?'reading':'ocean',...(project?{project_id:project}:{})});
  if (project) track('project_opened',{project_id:project,experience:'reading'});
}
async function start() {
  if (!configured || !enabled) return;
  if (client) { client.opt_in_capturing({captureEventName:false}); pageview(); return; }
  if (loading) return loading;
  loading = (async()=> {
    const {default:posthog} = await import(new URL('./vendor/posthog.js',import.meta.url).href);
    if (!enabled) return;
    posthog.init(services.posthogToken, {
      api_host:services.posthogHost, autocapture:false, capture_pageview:false, capture_pageleave:true,
      disable_session_recording:true, disable_surveys:true, disable_external_dependency_loading:true,
      advanced_disable_flags:true, capture_performance:false, capture_exceptions:false, enable_heatmaps:false,
      person_profiles:'never', persistence:'localStorage', cross_subdomain_cookie:false, ip:false,
      before_send:event=>enabled?sanitizeEvent(event):null,
      loaded:sdk=> { client=sdk; if (enabled) { sdk.opt_in_capturing({captureEventName:false}); pageview(); } else sdk.opt_out_capturing(); },
    });
  })().catch(()=>{}).finally(()=>{loading=null;});
  return loading;
}
function paint() {
  document.querySelectorAll('[data-analytics-toggle]').forEach(button=> {
    button.hidden = !configured;
    button.textContent = enabled ? 'Analytics on · turn off' : 'Analytics off · enable';
    button.setAttribute('aria-pressed',String(enabled && configured));
    button.disabled = !configured || navigator.globalPrivacyControl === true || navigator.doNotTrack === '1';
  });
}
document.addEventListener('click',event=> {
  const toggle=event.target.closest?.('[data-analytics-toggle]');
  if (toggle) {
    if (toggle.disabled) return;
    enabled=!enabled;try { localStorage.setItem(CONSENT_KEY,enabled?'yes':'no'); } catch {}
    if (enabled) void start(); else client?.opt_out_capturing();
    paint();return;
  }
  const anchor=event.target.closest?.('a[href]');if (!anchor) return;
  const url=new URL(anchor.href,location.href);
  if (/\.pdf$/i.test(url.pathname)) track('resume_clicked',{action:anchor.hasAttribute('download')?'download':'open'});
  else if (url.protocol==='mailto:') track('contact_clicked',{channel:'email'});
  else if (/^(www\.)?linkedin\.com$/.test(url.hostname)) track('contact_clicked',{channel:'linkedin'});
  else if (url.origin!==location.origin && ['https:','http:'].includes(url.protocol)) track('project_link_clicked',{destination:url.hostname.replaceAll('.','_')});
});
let submerged = document.body.dataset.submerged === 'true';
new MutationObserver(()=> {
  const next = document.body.dataset.submerged === 'true';
  if (next !== submerged) { track(next?'dive_started':'dive_completed'); submerged=next; }
}).observe(document.body,{attributes:true,attributeFilter:['data-submerged']});
paint();void start();

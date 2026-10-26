import assert from 'node:assert/strict';
import {services} from '../ocean-refined/services-config.js';
const id=crypto.randomUUID(),origin='https://anshul-portfolio-rho.vercel.app';
const endpoint=`${services.supabaseURL}/functions/v1/portfolio-intake`;
const headers={origin,apikey:services.supabaseKey,'Content-Type':'application/json'};
const payload={id,rating:5,feedback:'Integration QA — synthetic submission; safe to delete.',depthMeters:4,contact:null};
const response=await fetch(`${endpoint}/feedback`,{method:'POST',headers,body:JSON.stringify(payload)});
const body=await response.json();assert.equal(response.status,201,JSON.stringify(body));assert.equal(body.saved,true);
const retry=await fetch(`${endpoint}/feedback`,{method:'POST',headers,body:JSON.stringify(payload)});assert.equal(retry.status,201);
for(const table of ['portfolio_feedback','portfolio_photos','portfolio_intake_limits']){
  const read=await fetch(`${services.supabaseURL}/rest/v1/${table}?select=*`,{headers:{apikey:services.supabaseKey}});
  assert.ok([401,403].includes(read.status),`${table}: public read unexpectedly returned ${read.status}`);
}
const wrongOrigin=await fetch(`${endpoint}/feedback`,{method:'POST',headers:{...headers,origin:'https://attacker.invalid'},body:JSON.stringify(payload)});assert.equal(wrongOrigin.status,403);
console.log(JSON.stringify({feedbackId:id,saved:true,retrySucceeded:true,publicReadsBlocked:true,wrongOriginBlocked:true}));

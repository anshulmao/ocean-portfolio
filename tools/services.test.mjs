import test from 'node:test';
import assert from 'node:assert/strict';
import {createIntakeHandler,validateFeedback} from '../supabase/functions/portfolio-intake/handler.js';
import {eventProperties,sanitizeEvent} from '../ocean-refined/analytics-privacy.js';

const id='46b62688-719d-4e86-8342-c07159268e6e';
const note={id,rating:5,feedback:'A quiet reef.',depthMeters:4,contact:{name:'Ignored',email:'private@example.com',consent:false}};
function request(kind='feedback',body=JSON.stringify(note),headers={}) {
  return new Request(`https://edge.invalid/portfolio-intake/${kind}`,{method:'POST',headers:{origin:'https://anshul-portfolio-rho.vercel.app',apikey:'public','content-type':'application/json',...headers},body});
}
function fixture({savedStatus=201,quota=true,uploadStatus=200}={}) {
  const calls=[];
  const handler=createIntakeHandler({url:'https://db.invalid',secret:'test-secret',publicKey:'public',fetcher:async(url,init)=>{
    calls.push({url,init});
    if(url.includes('/rpc/'))return Response.json(quota);
    if(url.includes('/storage/'))return new Response(null,{status:uploadStatus});
    return new Response(null,{status:savedStatus});
  }});
  return {handler,calls};
}
test('contact details are omitted unless explicitly consented',()=>{
  const result=validateFeedback(note);assert.equal(result.contact_name,null);assert.equal(result.contact_email,null);
  assert.equal(validateFeedback({...note,contact:{name:' A ',email:'a@example.com',consent:true}}).contact_name,'A');
  assert.throws(()=>validateFeedback({...note,rating:6}));
  assert.throws(()=>validateFeedback({...note,feedback:'x'.repeat(2001)}));
  assert.throws(()=>validateFeedback({...note,depthMeters:Infinity}));
});
test('rejects origins and missing application keys before touching storage',async()=>{
  const {handler,calls}=fixture();
  assert.equal((await handler(request('feedback',JSON.stringify(note),{origin:'https://attacker.invalid'}))).status,403);
  assert.equal((await handler(request('feedback',JSON.stringify(note),{apikey:''}))).status,401);
  assert.equal(calls.length,0);
});
test('handles preflight and rejects malformed and oversized input',async()=>{
  const {handler,calls}=fixture();
  const preflight=new Request('https://edge.invalid/portfolio-intake/feedback',{method:'OPTIONS',headers:{origin:'https://anshul-portfolio-rho.vercel.app'}});
  assert.equal((await handler(preflight)).status,204);
  assert.equal((await handler(request('feedback','{'))).status,400);
  assert.equal((await handler(request('feedback','x'.repeat(16001)))).status,413);
  assert.equal(calls.length,0);
});
test('only reports success after database acknowledgement; retries use the same id',async()=>{
  const {handler,calls}=fixture();const response=await handler(request());
  assert.equal(response.status,201);assert.deepEqual(await response.json(),{id,saved:true});
  const write=calls.at(-1);assert.equal(JSON.parse(write.init.body).contact_email,null);
  assert.match(write.url,/on_conflict=id/);assert.match(write.init.headers.Prefer,/ignore-duplicates/);
  const failing=fixture({savedStatus:500});assert.equal((await failing.handler(request())).status,503);
});
test('quota rejection prevents writes',async()=>{
  const {handler,calls}=fixture({quota:false});assert.equal((await handler(request())).status,429);
  assert.equal(calls.length,1);assert.match(calls[0].url,/rpc/);
});
test('validates private JPEG uploads and removes objects when metadata save fails',async()=>{
  const photo=new Uint8Array([255,216,1,2,255,217]);
  const headers={'content-type':'image/jpeg','x-request-id':id};
  const ok=fixture();assert.equal((await ok.handler(request('photo',photo,headers))).status,201);
  assert.match(ok.calls.find(call=>call.url.includes('/storage/')).url,/reef-photos/);
  assert.equal((await ok.handler(request('photo','bad',headers))).status,400);
  const fail=fixture({savedStatus:500});assert.equal((await fail.handler(request('photo',photo,headers))).status,503);
  assert.equal(fail.calls.at(-1).init.method,'DELETE');
});
test('analytics keeps only declared properties and strips URL/private attribution',()=>{
  assert.deepEqual(eventProperties('feedback_saved',{rating:5,feedback:'private',email:'a@example.com'}),{rating:5});
  assert.equal(eventProperties('invented_event',{}),null);
  const result=sanitizeEvent({event:'$pageview',properties:{$current_url:'https://site.invalid/profile.html?email=a#private',$referrer:'https://source.invalid/?token=secret','$set':{email:'a@example.com'},'$initial_current_url':'secret',utm_campaign:'private',distinct_id:'anonymous'}});
  assert.equal(result.properties.$current_url,'https://site.invalid/profile.html');
  assert.equal(result.properties.$referrer,'https://source.invalid/');
  assert.equal(result.properties.$set,undefined);assert.equal(result.properties.utm_campaign,undefined);
  assert.equal(result.properties.distinct_id,'anonymous');
});

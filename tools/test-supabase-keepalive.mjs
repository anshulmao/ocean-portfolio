import test from 'node:test';
import assert from 'node:assert/strict';
import {ping} from './supabase-keepalive.mjs';

const project = {url: 'https://abcdefgh.supabase.co', key: 'sb_publishable_test'};
const answers = status => ({fetcher: async () => ({status})});

test('any answer below 500 means the project is awake', async () => {
  for (const status of [200, 401, 403, 404]) assert.equal(await ping({...project, ...answers(status)}), status);
});
test('a 5xx or a network failure fails the run', async () => {
  await assert.rejects(ping({...project, ...answers(503)}), /503/);
  await assert.rejects(ping({...project, fetcher: async () => { throw Error('fetch failed'); }}), /fetch failed/);
});
test('it reads one row with the public key and writes nothing', async () => {
  let seen;
  await ping({...project, fetcher: async (url, options) => { seen = {url, options}; return {status: 401}; }});
  assert.match(seen.url, /\/rest\/v1\/portfolio_feedback\?select=id&limit=1$/);
  assert.equal(seen.options.method, undefined, 'a GET');
  assert.equal(seen.options.headers.apikey, project.key);
});
test('it refuses a config that is not a Supabase project', async () => {
  await assert.rejects(ping({url: 'https://example.com', key: 'k', ...answers(200)}), /no Supabase project/);
});

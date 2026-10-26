import {createIntakeHandler} from './handler.js';

const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
Deno.serve(createIntakeHandler({
  url: Deno.env.get('SUPABASE_URL')!,
  secret: secretKeys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  publicKey: 'sb_publishable__HsS51w5wTaUlIBkI8LqTw_6lRqz9Ks',
}));

// Phones are sent from the 3D ocean to the readable portfolio (profile.html); everything else gets the ocean. One place
// for the rule: tools/build.mjs writes it into vercel.json, tools/prepare-output.mjs into the prebuilt output, and
// tools/test-phone-redirect.mjs checks it against real browser strings.
//
// It is decided on the server from the User-Agent, so a phone never starts the ocean's downloads. A phone that asks for the
// desktop site, a tablet and a desktop browser all get the ocean. The links into the ocean on the reading pages carry
// ?world=1, which skips the redirect: "Take a dive" still works on a phone.
export const PHONE_AGENT = '.*(iPhone|iPod|Android.*Mobile|Windows Phone|IEMobile|BlackBerry|Opera Mini).*';
export const SKIP_KEY = 'world';
const has = [{type: 'header', key: 'user-agent', value: PHONE_AGENT}], missing = [{type: 'query', key: SKIP_KEY}];
// vercel.json `redirects`
export const redirects = ['/', '/index.html'].map(source => ({source, has, missing, destination: '/profile.html', permanent: false}));
// Build Output API routes (the direct-upload path)
export const routes = ['/', '/index.html'].map(src => ({src, has, missing, status: 307, headers: {Location: '/profile.html'}}));
// The same decision in code, for the test: would this request be redirected?
export const sendsToReading = (userAgent, search = '') => new RegExp(`^(?:${PHONE_AGENT})$`).test(userAgent) && !new URLSearchParams(search).has(SKIP_KEY);

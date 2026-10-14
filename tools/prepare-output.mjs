import fs from 'node:fs/promises';
const config=JSON.parse(await fs.readFile('vercel.json'));
await fs.mkdir('.vercel/output/static',{recursive:true});await fs.cp('dist','.vercel/output/static',{recursive:true});
const routes=config.headers.map(rule=>({src:rule.source.replaceAll('(.*)','(.*)'),headers:Object.fromEntries(rule.headers.map(h=>[h.key,h.value])),continue:true}));routes.push({handle:'filesystem'},{src:'/(.*)',status:404,dest:'/404.html'});
await fs.writeFile('.vercel/output/config.json',JSON.stringify({version:3,routes},null,2));console.log('Prepared static deployment output');

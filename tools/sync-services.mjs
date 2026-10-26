import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function copyAnalyticsSDK(destination) {
  await fs.mkdir(path.join(destination,'vendor'),{recursive:true});
  await fs.copyFile(path.join(root,'node_modules/posthog-js/dist/module.no-external.js'),path.join(destination,'vendor/posthog.js'));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await copyAnalyticsSDK(path.join(root,'ocean-refined'));

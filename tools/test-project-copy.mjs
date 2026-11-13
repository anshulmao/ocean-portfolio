// Content contracts requested for the professional and independent project pages.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const professional = ['What it is', 'My role', 'Examples of my work', 'Outcomes', 'Links'];
const independent = ['What it is', 'Why I built it', 'My involvement', 'What’s next', 'Links'];
for (const [id, expected] of [['rae', professional], ['reengage', professional], ['wattmana', independent], ['sage', independent]]) {
  const html = await fs.readFile(path.join(root, 'dist/projects', id, 'index.html'), 'utf8');
  const headings = [...html.matchAll(/<h2 id="(?:heading-[^"]+|project-links-title)">([\s\S]*?)<\/h2>/g)]
    .map(([, text]) => text.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<span aria-hidden="true">\d+<\/span>/g, '').replace(/<[^>]+>/g, '').trim());
  assert.deepEqual(headings, expected, `${id}: project sections must stay concise and in order`);
  assert.doesNotMatch(html, /The takeaway|What came out of it|The decision|Source &amp; scope/);
  if (id === 'wattmana') {
    const screens = [...html.matchAll(/<img[^>]+src="([^"]*wattmana[^"]*)"/g)].map(([, src]) => src);
    assert.equal(screens.length, 4, 'WattMana must show only the four current screens');
    assert.equal(new Set(screens).size, 4, 'WattMana screens must not repeat');
    assert.doesNotMatch(html, /\/wattmana\.png/);
    await assert.rejects(fs.access(path.join(root, 'dist/assets/portfolio/wattmana.png')));
  }
}
console.log('Project copy passed: requested sections, concise stories, and only four current WattMana screens.');

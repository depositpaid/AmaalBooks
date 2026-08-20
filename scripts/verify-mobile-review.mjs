import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/salaat-pages-41-104.production.in-review.json', import.meta.url), 'utf8'));
const pages = fixture.pages;
const query = 'prayer';
const match = pages.flatMap((page) => page.blocks.map((block) => ({ page, block })))
  .find(({ block }) => block.textContent.toLocaleLowerCase().includes(query));

assert(match, `Expected known Salaat word "${query}" in structured content`);
assert.equal(match.page.bookPartId, '59d7f112-fb58-4726-9c35-11485c6155e7');
assert.match(match.page.pageId, /^[0-9a-f-]{36}$/i);
assert.match(match.block.id, /^[0-9a-f-]{36}$/i);
assert(match.page.printedPageLabel);

const reader = readFileSync(new URL('../app/reader/[id].tsx', import.meta.url), 'utf8');
assert(reader.includes("printedPageNumber === 5"), 'Contents must target printed page 5');
assert(reader.includes("router.replace('/')"), 'Reader Back must return to the library');
assert(reader.includes('447890197837'), 'WhatsApp number must be corrected');
assert(reader.includes('useState(0.5)'), 'Audio/scroll defaults must include 0.5x');
assert(reader.includes('block_id: selectedBlock.block.id'), 'Saved items must retain block UUID');
assert(reader.includes('KeyboardAvoidingView'), 'Issue comments modal must remain keyboard-safe');

console.log(`mobile review checks passed: "${query}" -> page ${match.page.printedPageLabel}, block ${match.block.id}`);

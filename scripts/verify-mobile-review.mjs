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
const database = readFileSync(new URL('../lib/database.ts', import.meta.url), 'utf8');
const tts = readFileSync(new URL('../lib/tts.ts', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../components/StructuredSalaatAdminEditor.tsx', import.meta.url), 'utf8');
const saved = readFileSync(new URL('../app/(tabs)/bookmarks.tsx', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
const serviceWorker = readFileSync(new URL('../public/service-worker.js', import.meta.url), 'utf8');
const pwaExport = readFileSync(new URL('./finalize-pwa-export.mjs', import.meta.url), 'utf8');
const rootLayout = readFileSync(new URL('../app/_layout.tsx', import.meta.url), 'utf8');
const pwaInstall = readFileSync(new URL('../hooks/usePwaInstall.ts', import.meta.url), 'utf8');
assert(reader.includes("printedPageNumber === 5"), 'Contents must target printed page 5');
assert(reader.includes("router.replace('/')"), 'Reader Back must return to the library');
assert(reader.includes('447890197837'), 'WhatsApp number must be corrected');
assert(reader.includes('useState(0.5)'), 'Audio/scroll defaults must include 0.5x');
assert(database.includes('block_id: input.blockId'), 'Saved items must retain block UUID');
assert(reader.includes('KeyboardAvoidingView'), 'Issue comments modal must remain keyboard-safe');
assert(reader.includes("textAlign: isArabic ? 'right' : isHeading ? 'center' : 'justify'"), 'English structured body must be justified without changing Arabic/headings');
assert(database.includes(".insert({") && database.includes(".select('*')") && database.includes('readBack'), 'Saved item path must insert and read back');
assert(database.includes(".eq('page_id', input.pageId)") && database.includes(".eq('block_id', input.blockId)"), 'Saved read-back must verify exact page/block identity');
assert(saved.includes('useFocusEffect'), 'Saved screen must refresh immediately when focused');
assert(saved.includes("...(blockId ? { blockId } : {})"), 'Saved navigation must retain exact block UUID');
assert(admin.includes("SALAAT_ADMIN_PART_ID = '59d7f112-fb58-4726-9c35-11485c6155e7'"), 'Admin must be permanently scoped to Salaat');
assert(admin.includes('fetchReaderPages(part.book_id, SALAAT_ADMIN_PART_ID)'), 'Admin must use Reader structured pages');
assert(admin.includes(".from('content_blocks')") && admin.includes('exact structured content-block UUID'), 'Admin save must preflight exact block identity');
assert(tts.includes('this.queueCurrentSentence()') && tts.includes('this.lifecycleToken++'), 'TTS restart must queue a fresh utterance after cancellation');
assert(tts.includes('scoreEnglishVoice') && tts.includes("lang.startsWith('en-gb')"), 'TTS must rank English voices with en-GB preference');
assert.equal(manifest.name, 'AmaalBooks');
assert.equal(manifest.short_name, 'AmaalBooks');
assert.equal(manifest.start_url, '/');
assert.equal(manifest.display, 'standalone');
assert(manifest.icons.some((icon) => icon.sizes === '192x192'), 'PWA manifest must include a 192px icon');
assert(manifest.icons.some((icon) => icon.sizes === '512x512'), 'PWA manifest must include a 512px icon');
assert(manifest.icons.some((icon) => icon.purpose?.includes('maskable')), 'PWA manifest must include a maskable icon');
assert(serviceWorker.includes('url.origin !== self.location.origin'), 'Service worker must not cache cross-origin Supabase responses');
assert(serviceWorker.includes("request.mode === 'navigate'"), 'Service worker must handle app navigation network-first');
assert(pwaExport.includes('manifest.webmanifest') && pwaExport.includes('apple-touch-icon'), 'Exported HTML must expose manifest and Apple touch icon');
assert(rootLayout.includes("navigator.serviceWorker.register('/service-worker.js')"), 'App must register the service worker');
assert(rootLayout.includes("document.readyState === 'complete'"), 'Service worker registration must also work after the load event');
assert(pwaInstall.includes('beforeinstallprompt') && pwaInstall.includes('promptInstall'), 'Settings install action must use the browser install prompt');

console.log(`mobile review checks passed: "${query}" -> page ${match.page.printedPageLabel}, block ${match.block.id}`);

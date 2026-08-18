import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [handoffDir, outputJson, outputHtml] = process.argv.slice(2);
if (!handoffDir || !outputJson || !outputHtml) {
  throw new Error('Usage: node scripts/build-salaat-locked-handoff.mjs HANDOFF_DIR OUTPUT_JSON OUTPUT_HTML');
}

const manifest = JSON.parse(fs.readFileSync(path.join(handoffDir, 'MANIFEST.json'), 'utf8'));
const expectedRanges = ['41-45', '46-50', '51-55', '56-60', '61-65_base', '65_override', '66-70', '71-75', '76-80', '81-85', '86-90', '91-95', '96-100', '101-104'];
for (const range of expectedRanges) {
  const meta = manifest.artifacts[range];
  if (!meta) throw new Error(`Manifest entry missing: ${range}`);
  const bytes = fs.readFileSync(path.join(handoffDir, meta.filename));
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  if (bytes.length !== meta.bytes || hash !== meta.sha256) throw new Error(`Manifest mismatch: ${meta.filename}`);
}

const decode = (value) => value
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&nbsp;/g, '\u00a0')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'");

function extractPages(filename) {
  const html = fs.readFileSync(path.join(handoffDir, filename), 'utf8');
  return [...html.matchAll(/<section\s+class="page"[^>]*>\s*<h1>Printed page (\d+)<\/h1>([\s\S]*?)<\/section>/gi)].map((match) => {
    const pageNumber = Number(match[1]);
    const body = match[2].replace(/<div\s+class="source"[^>]*>[\s\S]*?<\/div>/gi, '');
    const elements = [];
    const elementPattern = /<(h2|p|div)(?:\s+class="([^"]*)")?[^>]*>([\s\S]*?)<\/\1>/gi;
    let element;
    while ((element = elementPattern.exec(body))) {
      const [, tag, classes = '', inner] = element;
      const text = decode(inner);
      if (!text.trim()) continue;
      const classSet = new Set(classes.split(/\s+/).filter(Boolean));
      let kind = tag.toLowerCase() === 'h2' ? 'heading' : 'english';
      if (classSet.has('ar')) kind = 'arabic';
      if (classSet.has('translation')) kind = 'translation';
      elements.push({ kind, text });
    }
    const isRunningHeader = (text) => text === 'Virtues of Salaat' || /^Part\s+[IVX]+\s*\(/.test(text);
    for (let index = 1; index < elements.length; index += 1) {
      if (elements[index - 1].kind !== 'arabic') continue;
      let translationIndex = index;
      while (translationIndex < elements.length && elements[translationIndex].kind === 'english' && isRunningHeader(elements[translationIndex].text)) {
        translationIndex += 1;
      }
      if (elements[translationIndex]?.kind === 'english') elements[translationIndex].kind = 'translation';
    }
    return { pageNumber, elements };
  });
}

const orderedFiles = ['41-45', '46-50', '51-55', '56-60', '61-65_base', '66-70', '71-75', '76-80', '81-85', '86-90', '91-95', '96-100', '101-104'];
const extracted = orderedFiles.flatMap((range) => extractPages(manifest.artifacts[range].filename));
const override65 = extractPages(manifest.artifacts['65_override'].filename)[0];
const pageMap = new Map(extracted.map((page) => [page.pageNumber, page]));
pageMap.set(65, override65);
const pageNumbers = [...pageMap.keys()].sort((a, b) => a - b);
if (pageNumbers.length !== 64 || pageNumbers.some((page, index) => page !== index + 41)) throw new Error('Handoff pages are not exactly 41-104');

const pad = (number) => String(number).padStart(3, '0');
const pages = pageNumbers.map((printedPageNumber) => {
  const source = pageMap.get(printedPageNumber);
  const pagePrefix = pad(printedPageNumber);
  const pageId = `e${pagePrefix}0000-0000-4000-8000-000000000001`;
  const structuralNodes = [];
  const blocks = [];
  let activeNodeId = null;
  for (const [index, element] of source.elements.entries()) {
    if (element.kind === 'heading') {
      const nodeIndex = structuralNodes.length + 1;
      activeNodeId = `b${pagePrefix}${String(nodeIndex).padStart(2, '0')}00-0000-4000-8000-000000000001`;
      const identifierMatch = element.text.match(/(?:Hadith\s*[—-]?\s*)([IVXLCDM]+)\b/i);
      structuralNodes.push({
        id: activeNodeId,
        parentId: null,
        nodeType: /hadith/i.test(element.text) ? 'hadith' : 'section',
        sourceLabel: element.text,
        sourceIdentifier: identifierMatch ? identifierMatch[1] : null,
        title: null,
        sequenceIndex: structuralNodes.length,
        startPageId: null,
        endPageId: null,
      });
    }
    const blockType = element.kind;
    blocks.push({
      id: `f${pagePrefix}${String(index).padStart(2, '0')}00-0000-4000-8000-000000000001`,
      structuralNodeId: activeNodeId,
      sequenceIndex: index,
      blockType,
      languageCode: blockType === 'arabic' ? 'ar' : 'en',
      direction: blockType === 'arabic' ? 'rtl' : 'ltr',
      textContent: element.text,
      rawOcrText: null,
      ttsEligible: blockType !== 'heading',
      verificationStatus: 'in_review',
      provenanceNotes: `Locked human-reviewed handoff: printed page ${printedPageNumber}`,
    });
  }
  const hasArabic = blocks.some((block) => block.blockType === 'arabic');
  return {
    pageId,
    bookPartId: '59d7f112-fb58-4726-9c35-11485c6155e7',
    pageNumber: printedPageNumber,
    sourceShowsPrintedPageLabel: true,
    printedPageLabel: String(printedPageNumber),
    printedPageNumber,
    pdfPageNumber: printedPageNumber + 383,
    sequenceIndex: printedPageNumber - 10,
    verificationStatus: 'in_review',
    scanLanguages: hasArabic ? ['en', 'ar'] : ['en'],
    reviewEvidence: {
      englishTranscriptionComplete: true,
      arabicTranscriptionComplete: hasArabic,
      blockOrderChecked: true,
      identifiersChecked: true,
      scanCompared: true,
    },
    structuralNodes,
    blocks,
  };
});

const payload = {
  schemaVersion: 1,
  datasetKind: 'production',
  pageWriteMode: 'insert',
  bookId: '3cbdc749-e9c9-44f3-8330-ecc1e3b38cc8',
  bookPartId: '59d7f112-fb58-4726-9c35-11485c6155e7',
  edition: {
    id: 'a2000000-0000-4000-8000-000000000001',
    editionLabel: 'Fazail-e-amaalComplete.pdf — Virtues of Salaat',
    publisher: 'ALTAF & SONS',
    publicationLabel: null,
    isbn: null,
    languageCode: 'en-ar',
    notes: 'Production structured payload from the locked human-reviewed handoff for printed pages 41–104.',
  },
  sourceDocument: {
    id: 'a3000000-0000-4000-8000-000000000001',
    originalFilename: 'Fazail-e-amaalComplete.pdf',
    storagePath: null,
    sha256Checksum: '2617AA897D3B23AA7BBC9DEAE7CE424771C291F3C46D6E88553BE62222500867',
    pdfPageCount: 958,
    notes: 'Authoritative master provenance; source file was not modified.',
  },
  importBatch: {
    id: 'a4000000-0000-4000-8000-000000000005',
    importedBy: 'locked-human-review-handoff',
    notes: 'Preparation only. Do not import until explicitly authorized.',
  },
  pages,
};

fs.mkdirSync(path.dirname(outputJson), { recursive: true });
fs.writeFileSync(outputJson, `${JSON.stringify(payload, null, 2)}\n`);

const safeJson = JSON.stringify(payload).replace(/<\//g, '<\\/');
const preview = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Virtues of Salaat — locked production pages 41–104</title><style>:root{--bg:#e9e4d7;--paper:#fffdf5;--ink:#20231f;--muted:#697067;--line:#168a4b;--translation:#f1f5ec}body.dark{--bg:#111512;--paper:#1b211c;--ink:#edf2e9;--muted:#aeb9ae;--translation:#242d25}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Georgia,'Times New Roman',serif}.toolbar{position:sticky;top:0;z-index:3;display:flex;gap:.5rem;align-items:center;padding:.75rem 1rem;background:#172019;color:white}.toolbar button,.toolbar select{font:inherit;padding:.45rem .7rem;border-radius:.45rem;border:1px solid #ffffff33;background:#26322a;color:white}.wrap{max-width:920px;margin:2rem auto;padding:0 1rem}.paper{background:var(--paper);padding:clamp(1.4rem,5vw,4rem);min-height:75vh;box-shadow:0 12px 38px #0002}.folio{text-align:center;color:var(--muted);font-weight:700;margin-bottom:2rem}.block{font-size:var(--size,20px);line-height:1.62;margin:1.1rem 0;white-space:pre-wrap}.heading{text-align:center;font-weight:800;font-size:calc(var(--size,20px)*1.2)}.arabic{direction:rtl;text-align:right;font-family:'Noto Naskh Arabic','Segoe UI','Traditional Arabic',serif;font-size:calc(var(--size,20px)*1.6);line-height:2}.translation{padding:1rem 1.2rem;background:var(--translation);border-left:3px solid #879a89}.meta{margin-left:auto;color:#b8c4ba;font:13px system-ui}</style></head><body><div class="toolbar"><button id="prev">Previous</button><select id="page"></select><button id="next">Next</button><button id="down">A−</button><button id="up">A+</button><button id="mode">Light/Dark</button><span class="meta">Exact production payload · offline</span></div><main class="wrap"><article class="paper" id="paper"></article></main><script>const data=${safeJson};let i=0,size=20;const paper=document.querySelector('#paper'),sel=document.querySelector('#page');data.pages.forEach((p,j)=>{const o=document.createElement('option');o.value=j;o.textContent='Printed page '+p.printedPageLabel;sel.append(o)});const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));function render(){const p=data.pages[i];sel.value=i;paper.style.setProperty('--size',size+'px');paper.innerHTML='<div class="folio">Printed page '+esc(p.printedPageLabel)+' · PDF page '+p.pdfPageNumber+'</div>'+p.blocks.map(b=>'<section class="block '+esc(b.blockType)+'" dir="'+esc(b.direction)+'">'+esc(b.textContent)+'</section>').join('');document.title='Virtues of Salaat — '+p.printedPageLabel}prev.onclick=()=>{if(i){i--;render()}};next.onclick=()=>{if(i<data.pages.length-1){i++;render()}};sel.onchange=()=>{i=+sel.value;render()};up.onclick=()=>{size=Math.min(34,size+2);render()};down.onclick=()=>{size=Math.max(14,size-2);render()};mode.onclick=()=>document.body.classList.toggle('dark');render();<\/script></body></html>\n`;
fs.mkdirSync(path.dirname(outputHtml), { recursive: true });
fs.writeFileSync(outputHtml, preview);

const counts = pages.reduce((result, page) => {
  result.blocks += page.blocks.length;
  result.arabic += page.blocks.filter((block) => block.blockType === 'arabic').length;
  result.translation += page.blocks.filter((block) => block.blockType === 'translation').length;
  return result;
}, { blocks: 0, arabic: 0, translation: 0 });
console.log(JSON.stringify({ pages: pages.length, ...counts, first: pages[0].printedPageNumber, last: pages.at(-1).printedPageNumber }, null, 2));

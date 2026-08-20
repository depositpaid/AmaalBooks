import { readFileSync, writeFileSync } from 'node:fs';

const indexPath = new URL('../dist/index.html', import.meta.url);
const html = readFileSync(indexPath, 'utf8');
const pwaHead = `
    <meta name="application-name" content="AmaalBooks" />
    <meta name="theme-color" content="#121212" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="AmaalBooks" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" sizes="180x180" href="/icons/amaalbooks-180.png" />
    <link rel="icon" type="image/png" sizes="192x192" href="/icons/amaalbooks-192.png" />`;

if (!html.includes('/manifest.webmanifest')) {
  writeFileSync(indexPath, html.replace('</head>', `${pwaHead}\n  </head>`));
}

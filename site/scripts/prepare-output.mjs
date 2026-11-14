import { mkdir, rename } from 'node:fs/promises';
// Keep legacy /viewer/ and /viewer/index.html QR paths on Cloudflare.
await mkdir('out/viewer', { recursive: true });
await rename('out/viewer.html', 'out/viewer/index.html');

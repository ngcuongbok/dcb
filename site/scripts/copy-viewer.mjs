import { copyFile, mkdir, rm } from 'node:fs/promises';
await mkdir('public/viewer', { recursive: true });
// Remove only a previous build's generated copy of index.html.
await rm('public/viewer/index.html', { force: true });
await copyFile('../viewer/archive.html', 'public/viewer/archive.html');

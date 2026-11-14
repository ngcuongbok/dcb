import { cp, mkdir } from 'node:fs/promises';
await mkdir('public/viewer', { recursive: true });
await cp('../viewer', 'public/viewer', { recursive: true });

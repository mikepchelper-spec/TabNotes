import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const manifestPath = path.join(root, 'apps/extension/public/manifest.json');
const distDir = path.join(root, 'apps/extension/dist');
const storeDir = path.join(root, 'store');

const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const version = process.argv[2] ?? manifest.version;
manifest.version = version;
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

execFileSync('pnpm', ['build:extension'], { stdio: 'inherit' });

await fs.mkdir(storeDir, { recursive: true });
const zipName = `tabnotes-extension-v${version}.zip`;
const zipPath = path.join(storeDir, zipName);

execFileSync('bash', ['-lc', `cd "${distDir}" && zip -qr "${zipPath}" .`], { stdio: 'inherit' });
console.log(zipPath);
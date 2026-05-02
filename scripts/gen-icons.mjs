import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = resolve(__dirname, '../apps/extension/public/icons');
mkdirSync(iconsDir, { recursive: true });

const sizes = [16, 48, 128, 512];

for (const size of sizes) {
  const rx = Math.round(size * 0.19);
  const fontSize = Math.round(size * 0.56);
  const y = Math.round(size * 0.72);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${rx}" fill="url(#g)"/>
  <text x="${size / 2}" y="${y}" font-family="Arial,sans-serif" font-size="${fontSize}" font-weight="700" fill="white" text-anchor="middle">T</text>
</svg>`;

  await sharp(Buffer.from(svg))
    .png()
    .toFile(`${iconsDir}/icon${size}.png`);

  console.log(`✓ icon${size}.png`);
}

console.log('\nAll icons generated at apps/extension/public/icons/');

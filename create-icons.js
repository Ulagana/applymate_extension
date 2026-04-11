/**
 * run:  node create-icons.js
 * Creates 16x16, 48x48, 128x128 PNG icons from the source icon image.
 * Requires: npm install sharp  (run once in this folder)
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const src = process.argv[2] || 'source-icon.png';
const outDir = path.join(__dirname, 'icons');

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

const sizes = [16, 48, 128];

(async () => {
  for (const size of sizes) {
    await sharp(src)
      .resize(size, size)
      .png()
      .toFile(path.join(outDir, `icon${size}.png`));
    console.log(`✓ Created icons/icon${size}.png`);
  }
  console.log('\n✅ All icons generated! You can now load the extension in Chrome.');
})();

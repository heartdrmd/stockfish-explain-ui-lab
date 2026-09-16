// Copy the viewer and its server validator together after build:portable.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!process.argv[2]) throw new Error('Usage: node scripts/update-zagreb.mjs /absolute/path/to/zagreb-viewer');
const source = resolve(process.argv[2], 'portable');
if (!['dist/index.html', 'bundled/saved-view.mjs', 'bundled/clock-control.mjs', 'bundled/clock-hardware.mjs', 'bundled/clock-styles.mjs', 'bundled/notation-input.mjs', 'bundled/broadcast-proxy.mjs'].every(path => existsSync(resolve(source, path))))
  throw new Error('Run npm run build:portable in the viewer first.');
// Keep prior hashed chunks for tabs already open during deployment. Their
// lazy-loaded clocks must remain available until those tabs are refreshed.
cpSync(resolve(source, 'dist'), resolve(root, 'zagreb'), { recursive: true });
mkdirSync(resolve(root, 'src/server/generated'), { recursive: true });
cpSync(resolve(source, 'bundled/saved-view.mjs'), resolve(root, 'src/server/generated/board-view.mjs'));
cpSync(resolve(source, 'bundled/broadcast-proxy.mjs'), resolve(root, 'src/server/generated/broadcast-proxy.mjs'));
mkdirSync(resolve(root, 'src/generated'), { recursive: true });
cpSync(resolve(source, 'bundled/clock-control.mjs'), resolve(root, 'src/generated/clock-control.js'));
cpSync(resolve(source, 'bundled/clock-hardware.mjs'), resolve(root, 'src/generated/clock-hardware.js'));
cpSync(resolve(source, 'bundled/clock-styles.mjs'), resolve(root, 'src/generated/clock-styles.js'));
cpSync(resolve(source, 'bundled/notation-input.mjs'), resolve(root, 'src/generated/notation-input.js'));
console.log('Updated the embedded viewer and matching board-settings validator.');

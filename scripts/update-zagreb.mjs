// Copy the viewer and its server validator together after build:portable.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!process.argv[2]) throw new Error('Usage: node scripts/update-zagreb.mjs /absolute/path/to/zagreb-viewer');
const source = resolve(process.argv[2], 'portable');
if (!existsSync(resolve(source, 'dist/index.html')) || !existsSync(resolve(source, 'bundled/saved-view.mjs')))
  throw new Error('Run npm run build:portable in the viewer first.');
rmSync(resolve(root, 'zagreb'), { recursive: true, force: true });
cpSync(resolve(source, 'dist'), resolve(root, 'zagreb'), { recursive: true });
mkdirSync(resolve(root, 'src/server/generated'), { recursive: true });
cpSync(resolve(source, 'bundled/saved-view.mjs'), resolve(root, 'src/server/generated/board-view.mjs'));
console.log('Updated the embedded viewer and matching board-settings validator.');

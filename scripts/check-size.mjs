// Fails CI if the initial JS payload exceeds the budget (Constitution IV).
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const ASSETS_DIR = join(process.cwd(), 'dist', 'assets');
const BUDGET_GZIP_BYTES = 200 * 1024; // ~200 KB gzip initial JS budget

let files;
try {
  files = readdirSync(ASSETS_DIR).filter((f) => f.endsWith('.js'));
} catch {
  console.error(`No build found at ${ASSETS_DIR}. Run "npm run build" first.`);
  process.exit(1);
}

let total = 0;
for (const file of files) {
  const full = join(ASSETS_DIR, file);
  if (!statSync(full).isFile()) continue;
  const gz = gzipSync(readFileSync(full)).length;
  total += gz;
  console.log(`${file}: ${(gz / 1024).toFixed(1)} KB gzip`);
}

console.log(
  `\nTotal JS (gzip): ${(total / 1024).toFixed(1)} KB / budget ${(BUDGET_GZIP_BYTES / 1024).toFixed(0)} KB`,
);
if (total > BUDGET_GZIP_BYTES) {
  console.error('Bundle-size budget exceeded.');
  process.exit(1);
}
console.log('Bundle-size budget OK.');

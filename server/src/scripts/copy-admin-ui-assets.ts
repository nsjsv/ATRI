import fs from 'node:fs/promises';
import path from 'node:path';

async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const root = process.cwd();
  const srcDir = path.join(root, 'src', 'admin-ui');
  const outDir = path.join(root, 'dist', 'admin-ui');

  if (!(await exists(srcDir))) return;

  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(path.dirname(outDir), { recursive: true });
  await fs.cp(srcDir, outDir, { recursive: true });
}

main().catch((err) => {
  console.error('[ATRI] copy admin ui assets failed:', err);
  process.exit(1);
});

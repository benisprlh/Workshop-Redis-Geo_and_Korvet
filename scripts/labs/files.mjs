import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const [action, module = 'all'] = process.argv.slice(2);
if (!['apply', 'reset'].includes(action) || !['all', 'geo', 'korvet'].includes(module))
  throw new Error('Gunakan solution:apply atau lab:reset -- geo|korvet|all.');
const root = process.cwd();
const modules = module === 'all' ? ['geo', 'korvet'] : [module];
const stamp = new Date().toISOString().replaceAll(':', '-');
const backup = resolve(root, '.workshop-backups', `${stamp}-${action}`);
await mkdir(backup, { recursive: true });
for (const name of modules) {
  const target = resolve(root, `apps/api/src/labs/${name}.ts`);
  await copyFile(target, resolve(backup, `${name}.ts`));
  const source = resolve(
    root,
    action === 'apply' ? `workshop/solutions/${name}.solution.ts` : `workshop/starters/${name}.ts`,
  );
  const content = await readFile(source, 'utf8');
  await writeFile(target, content);
  console.log(
    `${name}: ${action === 'apply' ? 'jawaban diterapkan' : 'starter dipulihkan'}. Backup: .workshop-backups/${stamp}-${action}/${name}.ts`,
  );
}
console.log('Data tidak direset. Tunggu watcher memulai ulang API, lalu Periksa latihan.');

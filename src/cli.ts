#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { yaakToPostman } from './postman';

async function main(argv: string[]) {
  const [inPath, outPath] = argv;
  if (!inPath) {
    console.error('Usage: ts-node src/cli.ts <yaak.json> [out.postman.json]');
    process.exit(2);
  }

  const input = JSON.parse(await fs.readFile(inPath, 'utf8'));
  const postman = yaakToPostman(input as any);
  const out = outPath || path.join(process.cwd(), 'postman-export.json');
  await fs.writeFile(out, JSON.stringify(postman, null, 2), 'utf8');
  console.log(`Wrote ${out}`);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

export default main;

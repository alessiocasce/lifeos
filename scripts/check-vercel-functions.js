#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiRoot = path.join(repoRoot, 'api');
const hobbyLimit = 12;
const routeFiles = [];

walkApiRoutes(apiRoot);
routeFiles.sort();

console.log('Vercel API route functions:');
for (const file of routeFiles) {
  console.log(`- ${file}`);
}
console.log(`Total: ${routeFiles.length}`);

if (routeFiles.length > hobbyLimit) {
  console.error(`Function count exceeds Vercel Hobby limit (${hobbyLimit}).`);
  process.exitCode = 1;
}

function walkApiRoutes(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('_')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkApiRoutes(fullPath);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    routeFiles.push(toPosix(path.relative(repoRoot, fullPath)));
  }
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

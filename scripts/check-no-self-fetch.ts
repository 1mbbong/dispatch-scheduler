/**
 * check-no-self-fetch.ts
 *
 * Verifies that no Server Component is making HTTP calls to itself
 * (the self-fetch anti-pattern).
 *
 * Checks for:
 *   - fetchWithAuth usage (deleted api-client helper)
 *   - standalone BASE_URL references (not DATABASE_URL)
 *   - localhost self-fetch URL patterns
 *
 * Usage: npx tsx scripts/check-no-self-fetch.ts
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC_DIR = join(__dirname, '..', 'src');

interface ForbiddenPattern {
    regex: RegExp;
    label: string;
}

const FORBIDDEN_PATTERNS: ForbiddenPattern[] = [
    { regex: /\bfetchWithAuth\b/, label: 'fetchWithAuth (deleted helper)' },
    // Match standalone BASE_URL (word boundary) — not DATABASE_URL
    { regex: /\bBASE_URL\b/, label: 'BASE_URL (self-fetch URL variable)' },
    { regex: /localhost:\d+\/api/, label: 'localhost:*/api (hardcoded self-fetch)' },
];

const EXTENSIONS = new Set(['.ts', '.tsx']);

function walk(dir: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir)) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
            if (!entry.startsWith('.') && entry !== 'node_modules') {
                files.push(...walk(fullPath));
            }
        } else {
            const ext = fullPath.substring(fullPath.lastIndexOf('.'));
            if (EXTENSIONS.has(ext)) {
                files.push(fullPath);
            }
        }
    }
    return files;
}

let violations = 0;

const files = walk(SRC_DIR);
for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const relPath = relative(join(__dirname, '..'), file);

    for (const { regex, label } of FORBIDDEN_PATTERNS) {
        if (regex.test(content)) {
            console.error(`❌ FOUND "${label}" in ${relPath}`);
            violations++;
        }
    }
}

if (violations === 0) {
    console.log('✅ No self-fetch patterns found in src/. Clean!');
    process.exit(0);
} else {
    console.error(`\n❌ ${violations} self-fetch violation(s) detected. See above.`);
    process.exit(1);
}

#!/usr/bin/env node --experimental-strip-types
/**
 * Read-only CouchDB conflict manifest and backup exporter.
 *
 * Usage:
 *   COUCHDB_URL='https://user:pass@host/db' \
 *     node --experimental-strip-types scripts/conflict-manifest.ts [--out DIR]
 *
 *   node --experimental-strip-types scripts/conflict-manifest.ts \
 *     --verify-only ~/conflict-review/.../conflict-backup.json
 *
 * This script performs GET requests only. It never PUTs, POSTs, or deletes
 * anything in the source database. The backup file contains full document
 * bodies and is written with mode 0600; treat it as sensitive.
 */

import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  buildConflictBackup,
  buildConflictManifest,
  formatConflictManifestSummary,
  sanitizeConflictSource,
  verifyConflictBackup,
} from '../src/services/conflictManifest.ts';
import { sha256Sync } from '../src/core/utils/crypto.ts';
import type {
  ConflictBackup,
  ConflictDoc,
  ConflictQueueItemLike,
} from '../src/services/conflictManifest.ts';

interface Args {
  outDir?: string;
  verifyOnly?: string;
  help: boolean;
}

interface CouchConnection {
  baseUrl: string;
  headers: Record<string, string>;
  source: { host?: string; database?: string };
}

function parseArgs(argv: string[]): Args {
  const out: Args = { help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--out') out.outDir = argv[++i];
    else if (arg === '--verify-only') out.verifyOnly = argv[++i];
    else if (arg.startsWith('--out=')) out.outDir = arg.slice('--out='.length);
    else if (arg.startsWith('--verify-only=')) out.verifyOnly = arg.slice('--verify-only='.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function redactText(value: string): string {
  return value
    .replace(/https?:\/\/[^@\s]+@/g, 'https://***@')
    .replace(/(password|passwd|secret|token|authorization|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=***');
}

function makeConnection(rawUrl: string): CouchConnection {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('COUCHDB_URL is not a valid URL.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('COUCHDB_URL must use http or https.');
  }

  const username = decodeURIComponent(parsed.username || '');
  const password = decodeURIComponent(parsed.password || '');
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (username || password) {
    headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }

  parsed.username = '';
  parsed.password = '';
  const baseUrl = parsed.toString().replace(/\/+$/, '');
  return {
    baseUrl,
    headers,
    source: sanitizeConflictSource(rawUrl),
  };
}

async function requestJson(
  connection: CouchConnection,
  path: string,
  params: Record<string, string> = {}
): Promise<any> {
  const url = new URL(`${connection.baseUrl}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: connection.headers,
      redirect: 'error',
    });
  } catch (error) {
    throw new Error(
      `GET ${path} failed: ${redactText(error instanceof Error ? error.message : String(error))}`
    );
  }

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(
      `GET ${path} failed with HTTP ${response.status}: ${redactText(raw.slice(0, 500))}`
    );
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`GET ${path} returned non-JSON content.`);
  }
}

async function fetchAllDocs(connection: CouchConnection): Promise<any[]> {
  const rows: any[] = [];
  let startkey: string | undefined;
  const pageSize = 500;

  for (;;) {
    const params: Record<string, string> = {
      include_docs: 'true',
      conflicts: 'true',
      limit: String(pageSize),
    };
    if (startkey) {
      params.startkey = JSON.stringify(startkey);
      params.skip = '1';
    }

    const page = await requestJson(connection, '/_all_docs', params);
    const pageRows = Array.isArray(page?.rows) ? page.rows : [];
    rows.push(...pageRows);

    if (pageRows.length < pageSize) break;
    const lastId = pageRows[pageRows.length - 1]?.id;
    if (!lastId || lastId === startkey) break;
    startkey = lastId;
  }

  return rows;
}

async function fetchConflictingDoc(
  connection: CouchConnection,
  docId: string,
  revision: string
): Promise<ConflictDoc> {
  return requestJson(connection, `/${encodeURIComponent(docId)}`, { rev: revision });
}

async function buildQueue(connection: CouchConnection): Promise<{
  queue: ConflictQueueItemLike[];
  allDocs: ConflictDoc[];
  docCount: number | null;
}> {
  const info = await requestJson(connection, '/');
  const rows = await fetchAllDocs(connection);

  const queue: ConflictQueueItemLike[] = [];
  const allDocs: ConflictDoc[] = [];

  for (const row of rows) {
    const winningDoc = row?.doc as ConflictDoc | undefined;
    if (!winningDoc) continue;
    allDocs.push(winningDoc);

    const conflictRevs = Array.isArray(winningDoc._conflicts) ? winningDoc._conflicts : [];
    if (conflictRevs.length === 0) continue;

    const colon = String(row.id).indexOf(':');
    const docType = colon > 0 ? String(row.id).slice(0, colon) : 'unknown';
    const entityId = colon > 0 ? String(row.id).slice(colon + 1) : String(row.id);

    for (const revision of conflictRevs) {
      let conflictingDoc: ConflictDoc;
      try {
        conflictingDoc = await fetchConflictingDoc(connection, String(row.id), revision);
      } catch (error) {
        conflictingDoc = {
          _id: row.id,
          _rev: revision,
          _unavailable: redactText(error instanceof Error ? error.message : String(error)),
        };
      }
      queue.push({
        id: `${row.id}#${revision}`,
        docId: String(row.id),
        docType,
        entityId,
        winningRev: winningDoc._rev || row?.value?.rev || 'unknown',
        conflictingRev: revision,
        winningDoc,
        conflictingDoc,
        detectedAt: new Date().toISOString(),
      });
      allDocs.push(conflictingDoc);
    }
  }

  return {
    queue,
    allDocs,
    docCount: typeof info?.doc_count === 'number' ? info.doc_count : null,
  };
}

async function writeSecureFile(path: string, content: string): Promise<string> {
  await writeFile(path, content, { encoding: 'utf8', mode: 0o600 });
  await chmod(path, 0o600);
  return sha256Sync(content);
}

async function verifyOnly(path: string): Promise<void> {
  const parsed = JSON.parse(await readFile(path, 'utf8')) as ConflictBackup;
  const result = verifyConflictBackup(parsed);
  console.log(`Backup: ${path}`);
  console.log(`Documents: ${result.counts.documents}`);
  console.log(`Conflict revisions: ${result.counts.conflictRevisions}`);
  console.log(`Integrity: ${result.valid ? 'VALID' : 'INVALID'}`);
  if (!result.valid) {
    for (const error of result.errors) console.log(`- ${error}`);
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(
      'Usage: COUCHDB_URL=https://user:pass@host/db node --experimental-strip-types scripts/conflict-manifest.ts [--out DIR]'
    );
    console.log(
      '       node --experimental-strip-types scripts/conflict-manifest.ts --verify-only FILE'
    );
    return;
  }

  if (args.verifyOnly) {
    await verifyOnly(args.verifyOnly);
    return;
  }

  const rawUrl = process.env.COUCHDB_URL?.trim();
  if (!rawUrl) {
    throw new Error('COUCHDB_URL is required. Use a read-only CouchDB credential.');
  }

  const connection = makeConnection(rawUrl);
  const generatedAt = new Date().toISOString();
  const { queue, allDocs, docCount } = await buildQueue(connection);

  const manifest = buildConflictManifest(queue, {
    generatedAt,
    source: connection.source,
    allDocs,
  });
  const backup = buildConflictBackup(queue, {
    generatedAt,
    source: connection.source,
  });
  const verification = verifyConflictBackup(backup);

  const timestamp = generatedAt.replace(/[:.]/g, '-');
  const outDir = args.outDir || join(homedir(), 'conflict-review', timestamp);
  await mkdir(outDir, { recursive: true, mode: 0o700 });
  await chmod(outDir, 0o700);

  const manifestPath = join(outDir, 'conflict-manifest.json');
  const backupPath = join(outDir, 'conflict-backup.json');
  const summaryPath = join(outDir, 'summary.txt');
  const checksumsPath = join(outDir, 'SHA256SUMS');

  const manifestText = JSON.stringify(manifest, null, 2);
  const backupText = JSON.stringify(backup, null, 2);
  const summaryText = [
    formatConflictManifestSummary(manifest),
    '',
    `Backup integrity: ${verification.valid ? 'VALID' : 'INVALID'}`,
    `CouchDB document count at export: ${docCount ?? 'unknown'}`,
    '',
    'This manifest is read-only. No conflicts were resolved and no CouchDB writes were made.',
    'The backup file contains full winning/conflicting documents and may contain sensitive fields.',
  ].join('\n');

  const manifestHash = await writeSecureFile(manifestPath, manifestText);
  const backupHash = await writeSecureFile(backupPath, backupText);
  const summaryHash = await writeSecureFile(summaryPath, summaryText);
  const checksums = [
    `${manifestHash}  conflict-manifest.json`,
    `${backupHash}  conflict-backup.json`,
    `${summaryHash}  summary.txt`,
    '',
  ].join('\n');
  await writeSecureFile(checksumsPath, checksums);

  console.log(`Read-only conflict review bundle: ${outDir}`);
  console.log(`Documents: ${manifest.counts.documents}`);
  console.log(`Conflict revisions: ${manifest.counts.conflictRevisions}`);
  console.log(
    `By type: ${
      Object.entries(manifest.counts.byType)
        .map(([type, count]) => `${type}=${count}`)
        .join(', ') || 'none'
    }`
  );
  console.log(`Backup integrity: ${verification.valid ? 'VALID' : 'INVALID'}`);
  if (!verification.valid) {
    for (const error of verification.errors) console.log(`- ${error}`);
    process.exitCode = 1;
  }
  console.log('Files: conflict-manifest.json, conflict-backup.json, summary.txt, SHA256SUMS');
  console.log('No CouchDB writes were made.');
}

main().catch((error) => {
  console.error(`ERROR: ${redactText(error instanceof Error ? error.message : String(error))}`);
  process.exitCode = 1;
});

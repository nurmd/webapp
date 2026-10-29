#!/usr/bin/env node
/**
 * Bill Intake extraction proxy.
 *
 * Why this exists: a browser bundle can never hold a model provider key, and the
 * app ships as a PWA/APK. This tiny zero-dependency service is the only piece that
 * talks to a vision model. It does exactly three things:
 *
 *   1. authenticates the app (shared token)
 *   2. forwards the document + prompt to Gemini or OpenAI
 *   3. returns the raw JSON for the client to normalise, reconcile and score
 *
 * It performs no GST logic and stores no documents. Logs contain file metadata only.
 *
 * Run:  node server/bill-intake/server.mjs
 * Env:  see .env.example in this folder
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT = await readFile(join(__dirname, 'prompt.txt'), 'utf8');

const PORT = Number(process.env.PORT || 8787);
const PROVIDER = (process.env.EXTRACTION_PROVIDER || 'gemini').toLowerCase();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1';
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
const INTAKE_TOKEN = process.env.INTAKE_TOKEN || '';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean);
const MAX_BODY_BYTES = 18 * 1024 * 1024;
const RATE_LIMIT_PER_WINDOW = Number(process.env.RATE_LIMIT_PER_WINDOW || 60);
const RATE_WINDOW_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 110_000;

const SUPPORTED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

/* ------------------------------------------------------------------ helpers */

const log = (...args) => console.log(new Date().toISOString(), ...args);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const rateBuckets = new Map();

function rateLimit(ip) {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return;
  }
  bucket.count += 1;
  if (bucket.count > RATE_LIMIT_PER_WINDOW) {
    throw new HttpError(429, 'Rate limit exceeded. Try again later.');
  }
}

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? origin || '*' : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

function send(res, status, body, origin) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'X-Content-Type-Options': 'nosniff',
    ...corsHeaders(origin),
  });
  res.end(payload);
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Document exceeds the 18 MB limit.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Request body must be JSON.');
  }
}

function requireAuth(req) {
  if (!INTAKE_TOKEN) return;
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (token !== INTAKE_TOKEN) throw new HttpError(401, 'Invalid intake token.');
}

/** Models love to wrap JSON in markdown fences; unwrap without changing content. */
function parseModelJson(text) {
  if (typeof text !== 'string' || !text.trim()) throw new HttpError(502, 'Model returned an empty response.');
  let cleaned = text.trim();
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) cleaned = fenced[1].trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) cleaned = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new HttpError(502, 'Model returned malformed JSON.');
  }
}

async function fetchWithTimeout(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ providers */

async function extractWithGemini({ base64, mimeType }) {
  if (!GEMINI_API_KEY) throw new HttpError(500, 'GEMINI_API_KEY is not configured on the intake service.');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ inline_data: { mime_type: mimeType, data: base64 } }, { text: PROMPT }],
      },
    ],
    generationConfig: {
      temperature: 0,
      topP: 0.1,
      responseMimeType: 'application/json',
      maxOutputTokens: 8192,
    },
  };

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    if (response.status === 429) throw new HttpError(429, 'Gemini quota exhausted.');
    if (response.status === 401 || response.status === 403) throw new HttpError(502, 'Gemini rejected the API key.');
    throw new HttpError(502, `Gemini error ${response.status}: ${detail.slice(0, 300)}`);
  }

  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('\n');
  return { data: parseModelJson(text), model: GEMINI_MODEL, provider: 'gemini' };
}

async function extractWithOpenAI({ base64, mimeType, fileName }) {
  if (!OPENAI_API_KEY) throw new HttpError(500, 'OPENAI_API_KEY is not configured on the intake service.');
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const documentPart = mimeType === 'application/pdf'
    ? { type: 'input_file', filename: fileName || 'document.pdf', file_data: dataUrl }
    : { type: 'input_image', image_url: dataUrl, detail: 'high' };

  const response = await fetchWithTimeout(`${OPENAI_BASE_URL}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0,
      input: [
        {
          role: 'user',
          content: [{ type: 'input_text', text: PROMPT }, documentPart],
        },
      ],
      text: { format: { type: 'json_object' } },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    if (response.status === 429) throw new HttpError(429, 'OpenAI quota exhausted.');
    if (response.status === 401 || response.status === 403) throw new HttpError(502, 'OpenAI rejected the API key.');
    throw new HttpError(502, `OpenAI error ${response.status}: ${detail.slice(0, 300)}`);
  }

  const payload = await response.json();
  const text = payload.output_text
    ?? payload?.output?.flatMap((o) => o?.content || []).map((c) => c?.text).filter(Boolean).join('\n');

  return { data: parseModelJson(text), model: OPENAI_MODEL, provider: 'openai' };
}

/* ------------------------------------------------------------------ routes */

async function handleExtract(req, res, origin) {
  requireAuth(req);
  const ip = req.socket.remoteAddress || 'unknown';
  rateLimit(ip);

  const body = await readJsonBody(req);
  const { fileName, mimeType, dataBase64 } = body || {};

  if (!dataBase64 || typeof dataBase64 !== 'string') throw new HttpError(400, 'dataBase64 is required.');
  if (!mimeType || !SUPPORTED_MIME.has(String(mimeType).toLowerCase())) {
    throw new HttpError(415, 'Only PDF, JPG, PNG and WEBP documents are supported.');
  }
  if (dataBase64.length > MAX_BODY_BYTES * 1.4) throw new HttpError(413, 'Document exceeds the size limit.');

  const started = Date.now();
  const doc = { base64: dataBase64, mimeType: String(mimeType).toLowerCase(), fileName: String(fileName || 'document') };

  const result = PROVIDER === 'openai' ? await extractWithOpenAI(doc) : await extractWithGemini(doc);
  const durationMs = Date.now() - started;

  log(`extract ok provider=${result.provider} model=${result.model} file=${doc.fileName} bytes=${Math.round(dataBase64.length * 0.75)} ms=${durationMs}`);
  send(res, 200, { ...result, durationMs }, origin);
}

async function handleHealth(res, origin) {
  const configured = PROVIDER === 'openai' ? Boolean(OPENAI_API_KEY) : Boolean(GEMINI_API_KEY);
  send(res, 200, {
    ok: configured,
    provider: PROVIDER,
    model: PROVIDER === 'openai' ? OPENAI_MODEL : GEMINI_MODEL,
    authRequired: Boolean(INTAKE_TOKEN),
    message: configured ? undefined : 'Provider API key is not set on the service.',
  }, origin);
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders(origin));
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      await handleHealth(res, origin);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/extract') {
      await handleExtract(req, res, origin);
      return;
    }

    throw new HttpError(404, 'Not found.');
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (!(error instanceof HttpError)) log('unhandled error', error);
    send(res, status, { error: error?.message || 'Internal error.' }, origin);
  }
});

server.listen(PORT, () => {
  log(`bill-intake proxy listening on http://localhost:${PORT}`);
  log(`provider=${PROVIDER} model=${PROVIDER === 'openai' ? OPENAI_MODEL : GEMINI_MODEL} auth=${INTAKE_TOKEN ? 'on' : 'OFF'}`);
  if (!INTAKE_TOKEN) log('WARNING: INTAKE_TOKEN is empty - the endpoint is unauthenticated. Set it before exposing this service.');
});

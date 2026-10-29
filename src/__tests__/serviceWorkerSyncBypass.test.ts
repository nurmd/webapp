import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const swSource = fs.readFileSync(
  path.resolve(__dirname, '../../public/sw.js'),
  'utf-8'
);

type FetchHandler = (event: any) => void;
type MessageHandler = (event: any) => void;

function loadServiceWorker() {
  let fetchHandler: FetchHandler | undefined;
  let messageHandler: MessageHandler | undefined;
  const putSpy = vi.fn(async () => {});
  const fetchSpy = vi.fn(async () => ({
    status: 200,
    clone: () => ({ status: 200 }),
  }));

  const self = {
    location: { origin: 'https://app.example.com' },
    addEventListener: (type: string, handler: any) => {
      if (type === 'fetch') fetchHandler = handler;
      if (type === 'message') messageHandler = handler;
    },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
  };

  const context = vm.createContext({
    self,
    URL,
    Headers,
    console,
    fetch: fetchSpy,
    caches: {
      open: async () => ({ put: putSpy }),
      match: async () => undefined,
      keys: async () => [],
      delete: async () => true,
    },
  });

  vm.runInContext(swSource, context);

  return { fetchHandler, messageHandler, fetchSpy, putSpy, self };
}

function makeRequest(url: string, headers?: Headers) {
  return {
    method: 'GET',
    url,
    mode: 'cors',
    headers: headers || new Headers(),
  };
}

describe('service worker sync cache bypass', () => {
  let fetchHandler: FetchHandler | undefined;
  let fetchSpy: ReturnType<typeof vi.fn>;
  let putSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const loaded = loadServiceWorker();
    fetchHandler = loaded.fetchHandler;
    fetchSpy = loaded.fetchSpy;
    putSpy = loaded.putSpy;
  });

  it('never intercepts cross-origin CouchDB sync requests', () => {
    expect(fetchHandler).toBeTypeOf('function');

    const respondWith = vi.fn();
    fetchHandler!({
      request: makeRequest('https://couch.example.com/gst/_changes?feed=longpoll&since=1'),
      respondWith,
    });

    expect(respondWith).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('never intercepts same-origin CouchDB sync endpoints', () => {
    const respondWith = vi.fn();
    fetchHandler!({
      request: makeRequest('https://app.example.com/gst/_all_docs?include_docs=true'),
      respondWith,
    });

    expect(respondWith).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('still caches ordinary same-origin static assets', async () => {
    const respondWith = vi.fn();
    fetchHandler!({
      request: makeRequest('https://app.example.com/assets/app-123.js'),
      respondWith,
    });

    expect(respondWith).toHaveBeenCalledTimes(1);
    await respondWith.mock.calls[0][0];
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not cache responses to requests carrying Authorization', async () => {
    const respondWith = vi.fn();
    fetchHandler!({
      request: makeRequest(
        'https://app.example.com/assets/private.js',
        new Headers({ Authorization: 'Basic abc123' })
      ),
      respondWith,
    });

    await respondWith.mock.calls[0][0];
    expect(putSpy).not.toHaveBeenCalled();
  });

  it('handles SKIP_WAITING message', () => {
    const loaded = loadServiceWorker();
    expect(loaded.messageHandler).toBeTypeOf('function');
    loaded.messageHandler!({ data: { type: 'SKIP_WAITING' } });
    expect(loaded.self.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it('handles CACHE_URLS message to precache lazy modal chunk URLs', async () => {
    const loaded = loadServiceWorker();
    expect(loaded.messageHandler).toBeTypeOf('function');

    const waitUntilPromise = vi.fn();
    loaded.messageHandler!({
      data: {
        type: 'CACHE_URLS',
        urls: ['/assets/InvoicePreviewModal-abc.js', '/assets/TableGridInvoiceModal-def.js'],
      },
      waitUntil: waitUntilPromise,
    });

    expect(waitUntilPromise).toHaveBeenCalledTimes(1);
    await waitUntilPromise.mock.calls[0][0];
    expect(loaded.fetchSpy).toHaveBeenCalledTimes(2);
    expect(loaded.putSpy).toHaveBeenCalledTimes(2);
  });
});

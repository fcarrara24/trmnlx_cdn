import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getFile, listDir, putFile, deleteFile } from '../cdn/src/github-api.js';

// btoa/atob non esistono in Node < 20 come globali del browser: node li fornisce già globalmente da Node 18+.

function mockFetch(handler) {
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return handler(url, opts);
  };
  return calls;
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    json: async () => body,
  };
}

test('getFile decodifica il contenuto base64 UTF-8', async () => {
  mockFetch(() => jsonResponse(200, {
    sha: 'abc123',
    content: Buffer.from('ciao è più', 'utf8').toString('base64'),
  }));

  const result = await getFile({ owner: 'o', repo: 'r', branch: 'main', path: 'x.md', token: 't' });
  assert.equal(result.sha, 'abc123');
  assert.equal(result.content, 'ciao è più');
});

test('getFile ritorna null su 404 invece di lanciare', async () => {
  mockFetch(() => jsonResponse(404, { message: 'Not Found' }));
  const result = await getFile({ owner: 'o', repo: 'r', branch: 'main', path: 'nope.md', token: 't' });
  assert.equal(result, null);
});

test('listDir ritorna [] su 404', async () => {
  mockFetch(() => jsonResponse(404, { message: 'Not Found' }));
  const result = await listDir({ owner: 'o', repo: 'r', branch: 'main', path: 'nope', token: 't' });
  assert.deepEqual(result, []);
});

test('listDir propaga un array di entry', async () => {
  mockFetch(() => jsonResponse(200, [{ name: 'a', type: 'dir' }, { name: 'b.js', type: 'file' }]));
  const result = await listDir({ owner: 'o', repo: 'r', branch: 'main', path: 'content', token: 't' });
  assert.equal(result.length, 2);
  assert.equal(result[0].name, 'a');
});

test('putFile invia PUT con content in base64 e sha quando presente', async () => {
  const calls = mockFetch(() => jsonResponse(200, { content: { sha: 'new-sha' } }));
  const result = await putFile({
    owner: 'o', repo: 'r', branch: 'main', path: 'content/x/meta.json',
    content: '{"a":1}', message: 'test', sha: 'old-sha', token: 't',
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].opts.method, 'PUT');
  const body = JSON.parse(calls[0].opts.body);
  assert.equal(body.sha, 'old-sha');
  assert.equal(body.branch, 'main');
  assert.equal(Buffer.from(body.content, 'base64').toString('utf8'), '{"a":1}');
  assert.equal(result.content.sha, 'new-sha');
});

test('putFile omette sha quando assente (creazione)', async () => {
  const calls = mockFetch(() => jsonResponse(201, { content: { sha: 'created' } }));
  await putFile({
    owner: 'o', repo: 'r', branch: 'main', path: 'content/new/meta.json',
    content: '{}', message: 'create', sha: null, token: 't',
  });
  const body = JSON.parse(calls[0].opts.body);
  assert.equal('sha' in body, false);
});

test('putFile con encoding base64 non ri-codifica il contenuto', async () => {
  const calls = mockFetch(() => jsonResponse(200, { content: { sha: 's' } }));
  const rawBase64 = Buffer.from('finto-png').toString('base64');
  await putFile({
    owner: 'o', repo: 'r', branch: 'main', path: 'content/x/image.png',
    content: rawBase64, encoding: 'base64', message: 'img', sha: null, token: 't',
  });
  const body = JSON.parse(calls[0].opts.body);
  assert.equal(body.content, rawBase64);
});

test('deleteFile invia DELETE con sha e message nel body', async () => {
  const calls = mockFetch(() => jsonResponse(200, {}));
  await deleteFile({
    owner: 'o', repo: 'r', branch: 'main', path: 'content/x/meta.json',
    message: 'rm', sha: 'sha1', token: 't',
  });
  assert.equal(calls[0].opts.method, 'DELETE');
  const body = JSON.parse(calls[0].opts.body);
  assert.equal(body.sha, 'sha1');
});

test('getFile percent-encode i segmenti del path', async () => {
  const calls = mockFetch(() => jsonResponse(200, { sha: 's', content: '' }));
  await getFile({ owner: 'o', repo: 'r', branch: 'main', path: 'content/my item/meta.json', token: 't' });
  assert.match(calls[0].url, /content\/my%20item\/meta\.json/);
});

test('una risposta non-ok diversa da 404 lancia con il messaggio di GitHub', async () => {
  mockFetch(() => jsonResponse(422, { message: 'Validation Failed' }));
  await assert.rejects(
    () => putFile({ owner: 'o', repo: 'r', branch: 'main', path: 'x', content: 'a', message: 'm', sha: null, token: 't' }),
    /Validation Failed/,
  );
});

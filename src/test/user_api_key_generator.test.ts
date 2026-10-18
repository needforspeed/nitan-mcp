import test from 'node:test';
import assert from 'node:assert/strict';
import { constants, publicEncrypt } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildAuthorizationUrl, completeUserApiKeyFromState, decryptPayload, generateClientId, generateKeyPair, getBrowserOpenCommand, parseGenerateUserApiKeyArgs, prepareUserApiKeyGeneration, resolveAuthLaunchMode, savePendingUserApiKeyState } from '../user-api-key-generator.js';
import { getDefaultProfilePath } from '../util/paths.js';

test('generateClientId returns unique nitan-mcp UUID values', () => {
  const first = generateClientId();
  const second = generateClientId();

  assert.match(first, /^nitan-mcp-[0-9a-f-]{36}$/);
  assert.match(second, /^nitan-mcp-[0-9a-f-]{36}$/);
  assert.notEqual(first, second);
});

test('resolveAuthLaunchMode defaults to url and accepts browser', () => {
  assert.equal(resolveAuthLaunchMode(undefined), 'url');
  assert.equal(resolveAuthLaunchMode('url'), 'url');
  assert.equal(resolveAuthLaunchMode('browser'), 'browser');
  assert.throws(() => resolveAuthLaunchMode('popup'), /Invalid --auth-mode value/);
});

test('getBrowserOpenCommand chooses platform-specific open command', () => {
  assert.deepEqual(getBrowserOpenCommand('https://example.com', 'darwin'), {
    command: 'open',
    args: ['https://example.com'],
  });
  assert.deepEqual(getBrowserOpenCommand('https://example.com', 'win32'), {
    command: 'cmd',
    args: ['/c', 'start', '', 'https://example.com'],
  });
  assert.deepEqual(getBrowserOpenCommand('https://example.com', 'linux'), {
    command: 'xdg-open',
    args: ['https://example.com'],
  });
});

test('buildAuthorizationUrl uses provided client_id consistently', () => {
  const url = new URL(buildAuthorizationUrl({
    site: 'https://www.uscardforum.com',
    clientId: 'nitan-mcp-test-id',
    nonce: '12345',
    scopes: 'read',
  }, 'PUBLIC_KEY'));

  assert.equal(url.origin, 'https://www.uscardforum.com');
  assert.equal(url.pathname, '/user-api-key/new');
  assert.equal(url.searchParams.get('client_id'), 'nitan-mcp-test-id');
  assert.equal(url.searchParams.get('nonce'), '12345');
  assert.equal(url.searchParams.get('scopes'), 'read');
});

test('parseGenerateUserApiKeyArgs supports auth-mode and state-file flags', () => {
  const parsed = parseGenerateUserApiKeyArgs([
    '--site', 'https://www.uscardforum.com',
    '--auth-mode', 'browser',
    '--state-file', '/tmp/pending.json',
  ]);

  assert.equal(parsed.showHelp, false);
  assert.deepEqual(parsed.options, {
    site: 'https://www.uscardforum.com',
    authMode: 'browser',
    stateFile: '/tmp/pending.json',
  });
});

test('parseGenerateUserApiKeyArgs rejects deprecated --save-to', () => {
  assert.throws(
    () => parseGenerateUserApiKeyArgs(['--site', 'https://www.uscardforum.com', '--save-to', '/tmp/profile.json']),
    /--save-to is no longer supported/
  );
});

test('getDefaultProfilePath uses platform-appropriate directories', () => {
  assert.equal(
    getDefaultProfilePath('darwin', { HOME: '/Users/tester' } as NodeJS.ProcessEnv, '/Users/tester'),
    '/Users/tester/Library/Application Support/NitanMCP/profile.json'
  );
  assert.equal(
    getDefaultProfilePath('linux', { HOME: '/home/tester' } as NodeJS.ProcessEnv, '/home/tester'),
    '/home/tester/.config/nitan-mcp/profile.json'
  );
  assert.equal(
    getDefaultProfilePath('linux', { HOME: '/home/tester', XDG_CONFIG_HOME: '/custom/config' } as NodeJS.ProcessEnv, '/home/tester'),
    '/custom/config/nitan-mcp/profile.json'
  );
  assert.equal(
    getDefaultProfilePath('win32', { APPDATA: 'C:\\Users\\tester\\AppData\\Roaming' } as NodeJS.ProcessEnv, 'C:\\Users\\tester'),
    'C:\\Users\\tester\\AppData\\Roaming\\NitanMCP\\profile.json'
  );
});

test('decryptPayload with RSA_PKCS1_PADDING round-trips a UTF-8 payload', () => {
  const { publicKey, privateKey } = generateKeyPair();

  const payload = publicEncrypt(
    { key: publicKey, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(JSON.stringify({ key: '用户 API 密钥 🔑' }), 'utf8')
  ).toString('base64');

  assert.equal(decryptPayload(payload, privateKey), JSON.stringify({ key: '用户 API 密钥 🔑' }));
});

test('decryptPayload RSA_NO_PADDING fallback round-trips a UTF-8 payload', () => {
  const { publicKey, privateKey } = generateKeyPair();

  const payload = publicEncrypt(
    { key: publicKey, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(JSON.stringify({ key: 'user-key-manual-unpad-🔑' }), 'utf8')
  ).toString('base64');

  assert.equal(
    decryptPayload(payload, privateKey, { forceNoPaddingFallback: true }),
    JSON.stringify({ key: 'user-key-manual-unpad-🔑' })
  );
});

test('decryptPayload fallback rejects payloads encrypted with OAEP padding', () => {
  const { publicKey, privateKey } = generateKeyPair();

  const payload = publicEncrypt(
    { key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING },
    Buffer.from(JSON.stringify({ key: 'oaep-payload' }), 'utf8')
  ).toString('base64');

  assert.throws(
    () => decryptPayload(payload, privateKey, { forceNoPaddingFallback: true }),
    /unpadding failed/
  );
});

test('resumable generation can complete from a saved state file in a later process', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'nitan-user-api-key-'));
  const stateFile = path.join(dir, 'pending.json');
  const profileFile = path.join(dir, 'profile.json');

  try {
    const prepared = prepareUserApiKeyGeneration({
      site: 'https://www.uscardforum.com',
    });
    await savePendingUserApiKeyState(stateFile, prepared.state);

    const payload = publicEncrypt(
      {
        key: prepared.state.publicKey,
        padding: constants.RSA_PKCS1_PADDING,
      },
      Buffer.from(JSON.stringify({ key: 'user-key-from-payload' }), 'utf8')
    ).toString('base64');

    await completeUserApiKeyFromState({ stateFile, payload, saveTo: profileFile });

    const profile = JSON.parse(await readFile(profileFile, 'utf8'));
    assert.deepEqual(profile.auth_pairs, [{
      site: 'https://www.uscardforum.com',
      user_api_key: 'user-key-from-payload',
      user_api_client_id: prepared.state.clientId,
    }]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('resumable generation defaults to the platform profile path when save-to is omitted', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'nitan-default-profile-'));
  const stateFile = path.join(dir, 'pending.json');
  const originalHome = process.env.HOME;

  try {
    process.env.HOME = dir;
    // Guard against engines whose os.homedir() ignores $HOME: if the resolved
    // default ever escapes the sandbox, abort instead of writing the real profile.
    const sandboxCheck = getDefaultProfilePath();
    if (!sandboxCheck.startsWith(dir)) {
      throw new Error(`test sandbox leak: default profile path resolves to ${sandboxCheck}`);
    }

    const prepared = prepareUserApiKeyGeneration({
      site: 'https://www.uscardforum.com',
    });
    await savePendingUserApiKeyState(stateFile, prepared.state);

    const payload = publicEncrypt(
      {
        key: prepared.state.publicKey,
        padding: constants.RSA_PKCS1_PADDING,
      },
      Buffer.from(JSON.stringify({ key: 'user-key-default-path' }), 'utf8')
    ).toString('base64');

    await completeUserApiKeyFromState({ stateFile, payload });

    const profilePath = getDefaultProfilePath('darwin', process.env, dir);
    const profile = JSON.parse(await readFile(profilePath, 'utf8'));
    assert.deepEqual(profile.auth_pairs, [{
      site: 'https://www.uscardforum.com',
      user_api_key: 'user-key-default-path',
      user_api_client_id: prepared.state.clientId,
    }]);
  } finally {
    process.env.HOME = originalHome;
    await rm(dir, { recursive: true, force: true });
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHmac, randomUUID} from 'node:crypto';
import vm from 'node:vm';

const source = await readFile(new URL('../integrations/contact-mail/Code.gs', import.meta.url), 'utf8');
const example = {
  name: 'Example visitor', email: 'visitor@example.org', topic: 'media',
  message: 'Please clarify the source for this public item.', website: ''
};

function event(values = example) {
  const body = new URLSearchParams(values).toString();
  return {
    parameter: values,
    parameters: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, [value]])),
    contentLength: Buffer.byteLength(body),
    postData: {type: 'application/x-www-form-urlencoded', contents: body}
  };
}

function runtime(options = {}) {
  const properties = {
    OWNER_EMAIL: 'owner@example.org', RATE_LIMIT_SECRET: 'test-secret',
    ...options.properties
  };
  const messages = [];
  const lockCalls = {waited: 0, attempted: 0, released: 0};
  let now = Date.UTC(2026, 10, 9, 0, 30);
  class FixedDate extends Date {
    constructor(...values) { super(...(values.length ? values : [now])); }
    static now() { return now; }
  }
  const lock = {
    waitLock() { lockCalls.waited++; },
    tryLock() { lockCalls.attempted++; return !options.lockBusy; },
    releaseLock() { lockCalls.released++; }
  };
  const sandbox = {
    Date: FixedDate,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: key => properties[key] || null,
        setProperty(key, value) { properties[key] = value; return this; }
      })
    },
    Session: {
      getEffectiveUser: () => ({getEmail: () => options.effectiveOwner || 'owner@example.org'}),
      getActiveUser: () => ({getEmail: () => options.activeOwner || 'owner@example.org'})
    },
    LockService: {getScriptLock: () => lock},
    Utilities: {
      getUuid: randomUUID,
      computeHmacSha256Signature: (value, key) => Array.from(createHmac('sha256', key).update(value).digest())
    },
    MailApp: {
      getRemainingDailyQuota: () => options.quota ?? 100,
      sendEmail(message) {
        if (options.failBeforeAcceptance) throw new Error('Provider failed before acceptance');
        messages.push({...message});
        if (options.failAfterAcceptance) throw new Error('Provider failed after acceptance');
      }
    },
    HtmlService: {
      createHtmlOutput: html => ({html, setTitle() { return this; }})
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return {sandbox, properties, messages, lockCalls, advance: milliseconds => { now += milliseconds; }};
}

function assertNoSuccess(html) {
  assert.doesNotMatch(html, /<h1>Message submitted<\/h1>/);
  assert.doesNotMatch(html, /<strong>Reference:<\/strong>/);
}

test('mail intake sends plain text only to the configured executing owner', () => {
  const {sandbox, messages, lockCalls} = runtime();
  const message = '<script>alert(1)</script>\n=SUM(1,2)\nAn ordinary message.';
  const result = sandbox.doPost(event({...example, message}));

  assert.equal(messages.length, 1);
  const sent = messages[0];
  assert.equal(sent.to, 'owner@example.org');
  assert.equal(sent.replyTo, example.email);
  assert.equal(sent.cc, undefined);
  assert.equal(sent.bcc, undefined);
  assert.equal(sent.htmlBody, undefined);
  assert.equal(sent.name, 'Redlands project contact form');
  assert.match(sent.subject, /^\[Website enquiry\] Media or interview request \[[A-Za-z0-9-]+\]$/);
  assert.ok(sent.body.includes(message));
  assert.ok(sent.body.includes('Name: ' + example.name));
  assert.ok(sent.body.includes('Reply address: ' + example.email));
  assert.match(result.html, /<h1>Message submitted<\/h1>/);
  assert.match(result.html, /accepted for sending/);
  const reference = result.html.match(/<strong>Reference:<\/strong> ([A-Za-z0-9-]+)/)?.[1];
  assert.ok(reference);
  assert.ok(sent.subject.includes(reference));
  assert.ok(sent.body.includes('Reference: ' + reference));
  for (const privateValue of [example.name, example.email, 'owner@example.org', message]) {
    assert.ok(!result.html.includes(privateValue));
  }
  assert.equal(lockCalls.released, 1);
});

test('the visitor cannot choose another recipient, carbon copy or update subscription', () => {
  for (const unwanted of [{to: 'other@example.org'}, {cc: 'other@example.org'}, {bcc: 'other@example.org'}, {updates: 'yes'}]) {
    const {sandbox, messages, lockCalls} = runtime();
    const result = sandbox.doPost(event({...example, ...unwanted}));
    assert.match(result.html, /<h1>Message not submitted<\/h1>/);
    assertNoSuccess(result.html);
    assert.equal(messages.length, 0);
    assert.equal(lockCalls.attempted, 0);
  }
});

test('invalid content, header injection, honeypots, unknown topics and duplicates never send', () => {
  const invalid = [
    {...example, name: ''}, {...example, name: 'x'.repeat(121)}, {...example, name: 'Name\r\nInjected'},
    {...example, email: 'invalid'}, {...example, email: 'one@example.org,two@example.org'},
    {...example, email: 'one@example.org\r\nBcc:two@example.org'},
    {...example, email: '<one@example.org>'}, {...example, topic: 'voting-preferences'},
    {...example, topic: 'toString'}, {...example, topic: '__proto__'},
    {...example, message: ''}, {...example, message: 'x'.repeat(5001)},
    {...example, message: 'Hidden\u0000content'}, {...example, website: 'spam'}
  ].map(values => event(values));
  const oversized = event(); oversized.contentLength = 40000; invalid.push(oversized);
  const oversizedContents = event(); oversizedContents.postData.contents = 'x'.repeat(32769); invalid.push(oversizedContents);
  const unsupportedType = event(); unsupportedType.postData.type = 'application/json'; invalid.push(unsupportedType);
  const duplicate = event(); duplicate.parameters.email.push('another@example.org'); invalid.push(duplicate);
  const unexpectedRepeated = event(); unexpectedRepeated.parameters.recipient = ['other@example.org']; invalid.push(unexpectedRepeated);
  invalid.push(undefined);

  for (const input of invalid) {
    const {sandbox, messages, properties} = runtime();
    const result = sandbox.doPost(input);
    assert.match(result.html, /<h1>Message not submitted<\/h1>/);
    assertNoSuccess(result.html);
    assert.equal(messages.length, 0);
    assert.equal(properties.MAIL_RATE_STATE, undefined);
  }
});

test('missing owner, different executing owner and missing rate secret fail closed', () => {
  for (const options of [
    {properties: {OWNER_EMAIL: ''}},
    {properties: {OWNER_EMAIL: 'one@example.org,two@example.org'}},
    {effectiveOwner: 'different@example.org'},
    {properties: {RATE_LIMIT_SECRET: ''}}
  ]) {
    const {sandbox, messages, lockCalls} = runtime(options);
    const result = sandbox.doPost(event());
    assert.match(result.html, /<h1>Sending could not be confirmed<\/h1>/);
    assertNoSuccess(result.html);
    assert.equal(messages.length, 0);
    assert.equal(lockCalls.released, 1);
    assert.ok(!result.html.includes('configuration'));
  }
});

test('a busy script lock prevents sending without releasing a lock it did not acquire', () => {
  const {sandbox, messages, lockCalls, properties} = runtime({lockBusy: true});
  const result = sandbox.doPost(event());
  assert.match(result.html, /The form is busy/);
  assertNoSuccess(result.html);
  assert.equal(messages.length, 0);
  assert.equal(lockCalls.released, 0);
  assert.equal(properties.MAIL_RATE_STATE, undefined);
});

test('exhausted provider quota produces an unavailable receipt without sending', () => {
  const {sandbox, messages, lockCalls} = runtime({quota: 0});
  const result = sandbox.doPost(event());
  assert.match(result.html, /<h1>Contact form temporarily unavailable<\/h1>/);
  assertNoSuccess(result.html);
  assert.equal(messages.length, 0);
  assert.equal(lockCalls.released, 1);
});

test('provider exceptions before or after acceptance never give an optimistic success receipt', () => {
  for (const options of [{failBeforeAcceptance: true}, {failAfterAcceptance: true}]) {
    const {sandbox, messages, lockCalls} = runtime(options);
    const result = sandbox.doPost(event());
    assert.match(result.html, /<h1>Sending could not be confirmed<\/h1>/);
    assert.match(result.html, /before or after acceptance/);
    assert.match(result.html, /retry may create a duplicate/);
    assertNoSuccess(result.html);
    assert.ok(!result.html.includes('Provider failed'));
    assert.equal(messages.length, options.failAfterAcceptance ? 1 : 0);
    assert.equal(lockCalls.released, 1);
  }
});

test('address limits persist as HMAC counters and reset in a later hour', () => {
  const {sandbox, messages, properties, advance} = runtime();
  for (let i = 0; i < 3; i++) assert.match(sandbox.doPost(event()).html, /<h1>Message submitted<\/h1>/);
  const limited = sandbox.doPost(event());
  assert.match(limited.html, /too many submissions/);
  assertNoSuccess(limited.html);
  assert.equal(messages.length, 3);

  const saved = properties.MAIL_RATE_STATE;
  assert.ok(!saved.includes(example.email));
  assert.ok(!saved.includes(example.name));
  assert.ok(!saved.includes(example.message));
  const state = JSON.parse(saved);
  const digest = createHmac('sha256', 'test-secret').update(example.email).digest('hex');
  assert.deepEqual(Object.keys(state.addresses), [digest]);
  assert.equal(state.addresses[digest], 3);

  advance(3600000);
  assert.match(sandbox.doPost(event()).html, /<h1>Message submitted<\/h1>/);
  assert.equal(messages.length, 4);
  assert.equal(JSON.parse(properties.MAIL_RATE_STATE).addresses[digest], 1);
});

test('the shared hourly ceiling applies across different submitted addresses', () => {
  const {sandbox, messages} = runtime();
  for (let i = 0; i < 30; i++) {
    assert.match(sandbox.doPost(event({...example, email: `visitor${i}@example.org`})).html, /<h1>Message submitted<\/h1>/);
  }
  const result = sandbox.doPost(event({...example, email: 'one-more@example.org'}));
  assert.match(result.html, /too many submissions/);
  assertNoSuccess(result.html);
  assert.equal(messages.length, 30);
});

test('the daily ceiling survives hourly resets and resets on a later UTC day', () => {
  const {sandbox, messages, advance} = runtime();
  for (let hour = 0; hour < 3; hour++) {
    for (let i = 0; i < 30; i++) {
      assert.match(sandbox.doPost(event({...example, email: `visitor${hour}-${i}@example.org`})).html, /<h1>Message submitted<\/h1>/);
    }
    advance(3600000);
  }
  const limited = sandbox.doPost(event({...example, email: 'later-hour@example.org'}));
  assert.match(limited.html, /too many submissions/);
  assertNoSuccess(limited.html);
  assert.equal(messages.length, 90);
  advance(86400000);
  assert.match(sandbox.doPost(event()).html, /<h1>Message submitted<\/h1>/);
  assert.equal(messages.length, 91);
});

test('setup requires the active owner and creates configuration without sending a test message', () => {
  const {sandbox, properties, messages, lockCalls} = runtime({properties: {RATE_LIMIT_SECRET: ''}});
  const result = sandbox.setupContactMail();
  assert.equal(result.ready, true);
  assert.equal(result.remainingDailyMailQuota, 100);
  assert.ok(properties.RATE_LIMIT_SECRET.length > 40);
  assert.equal(messages.length, 0);
  assert.equal(lockCalls.released, 1);

  const other = runtime({activeOwner: 'different@example.org'});
  assert.throws(() => other.sandbox.setupContactMail(), /Owner sign-in required/);
  assert.equal(other.messages.length, 0);
});

test('GET requests reveal no configured inbox and never send a message', () => {
  const {sandbox, messages, properties} = runtime();
  const result = sandbox.doGet();
  assert.match(result.html, /<h1>Contact Luke<\/h1>/);
  assert.ok(!result.html.includes('owner@example.org'));
  assert.equal(messages.length, 0);
  assert.equal(properties.MAIL_RATE_STATE, undefined);
});

test('mail-only deployment requests send-mail and identity scopes without Gmail or Drive access', async () => {
  const manifest = JSON.parse(await readFile(new URL('../integrations/contact-mail/appsscript.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest.oauthScopes.slice().sort(), [
    'https://www.googleapis.com/auth/script.send_mail',
    'https://www.googleapis.com/auth/userinfo.email'
  ].sort());
  assert.equal(manifest.webapp.executeAs, 'USER_DEPLOYING');
  assert.equal(manifest.webapp.access, 'ANYONE_ANONYMOUS');
});

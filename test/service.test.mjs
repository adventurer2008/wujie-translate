import assert from 'node:assert/strict';
import test from 'node:test';
import { canTranslate, translate, serviceOrigins } from '../src/service.js';

function fixture(overrides = {}) {
	return {
		text: 'Access', target: 'zh-Hans', signal: new AbortController().signal,
		...overrides,
	};
}
const entry = source => ({ source, definitions: [{ meaning: '进入' }] });
const json = value => new Response(JSON.stringify(value));

test('looks up the three hosted dictionaries without a credential and keeps their order', async () => {
	const oxford = entry('oxford-hk10');
	const longman = entry('longman-5pp');
	const ecdict = entry('ecdict');
	const result = await translate(fixture({
		fetcher: async (url, request) => {
			assert.equal(url, 'https://sync.wujiesync.cc/ss2/translate/alpha');
			assert.equal(request.redirect, 'error');
			assert.equal(request.credentials, 'omit');
			assert.deepEqual(request.headers, { 'Content-Type': 'application/json' });
			assert.deepEqual(JSON.parse(request.body), { text: 'Access', target: 'zh-Hans', dictionary: true });
			return json({ dictionaries: [ecdict, longman, oxford] });
		},
	}));
	assert.deepEqual(result.dictionaries, [oxford, longman, ecdict]);
});

test('plain sentence translation sends only the text and target', async () => {
	const result = await translate(fixture({
		text: '你好。', target: 'en',
		fetcher: async (_url, request) => {
			assert.deepEqual(JSON.parse(request.body), { text: '你好。', target: 'en' });
			return json({ translation: 'Hello.' });
		},
	}));
	assert.deepEqual(result, { translation: 'Hello.' });
});

test('rejects protected markers and ignores results after cancellation', async () => {
	assert.equal(canTranslate('wujie-lock:secret'), false);
	assert.equal(canTranslate('```wujie-encrypted'), false);
	const late = new AbortController();
	let calls = 0;
	await assert.rejects(translate(fixture({
		signal: late.signal,
		fetcher: async () => {
			calls++;
			late.abort();
			return json({ dictionaries: [entry('oxford-hk10')] });
		},
	})), { name: 'AbortError' });
	assert.equal(calls, 1);
	const controller = new AbortController();
	controller.abort();
	await assert.rejects(translate(fixture({ signal: controller.signal })), { name: 'AbortError' });
});

test('falls through both unavailable domains for lookup and sentence translation', async () => {
	for (const text of ['Access', 'The library is open.']) {
		const calls = [];
		const result = await translate(fixture({ text, fetcher: async (url, request) => {
			calls.push({ url, body: request.body });
			if (calls.length === 1) throw new TypeError('Network unavailable');
			if (calls.length === 2) return new Response('', { status: 503 });
			return json({ translation: '结果' });
		} }));
		assert.deepEqual(calls.map(call => call.url), serviceOrigins.map(origin => origin + '/ss2/translate/alpha'));
		assert.equal(new Set(calls.map(call => call.body)).size, 1);
		assert.equal(result.translation, '结果');
	}
});

test('switches after connection and response-body timeouts', async () => {
	for (const stalledBody of [false, true]) {
		let calls = 0;
		const result = await translate(fixture({ timeout: 15, fetcher: async (_url, request) => {
			calls++;
			if (calls > 1) return json({ translation: '结果' });
			const stalled = () => new Promise((_, reject) => {
				request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true });
			});
			return stalledBody ? { ok: true, json: stalled } : stalled();
		} }));
		assert.equal(result.translation, '结果');
		assert.equal(calls, 2);
	}
});

test('stops on cancellation and business errors without trying another domain', async () => {
	for (const status of [400, 401, 403, 413, 429]) {
		let calls = 0;
		await assert.rejects(translate(fixture({ fetcher: async () => {
			calls++;
			return new Response('', { status });
		} })), { status });
		assert.equal(calls, 1);
	}
	const controller = new AbortController();
	let calls = 0;
	const pending = translate(fixture({ signal: controller.signal, fetcher: async (_url, request) => {
		calls++;
		controller.abort();
		throw request.signal.reason;
	} }));
	await assert.rejects(pending, { name: 'AbortError' });
	assert.equal(calls, 1);
});

test('bounds complete outages to one attempt per domain and can recover on the next request', async () => {
	let calls = 0;
	await assert.rejects(translate(fixture({ fetcher: async () => {
		calls++;
		return new Response('', { status: 502 });
	} })), { status: 502 });
	assert.equal(calls, 3);
	const recovered = await translate(fixture({ fetcher: async () => json({ translation: '恢复' }) }));
	assert.equal(recovered.translation, '恢复');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { canTranslate, translate } from '../src/service.js';

function fixture(overrides = {}) {
	return {
		text: 'Access', target: 'zh-Hans', secret: 'fixture-only',
		signal: new AbortController().signal, current: () => true, showLocal() {},
		...overrides,
	};
}
const entry = source => ({ source, definitions: [{ meaning: '进入' }] });
const json = value => new Response(JSON.stringify(value));

test('shows hosted dictionaries before the online response and keeps their order', async () => {
	const oxford = entry('oxford-hk10');
	const longman = entry('longman-5pp');
	const online = entry('bing');
	const calls = [];
	let displayed;
	const result = await translate(fixture({
		showLocal(entries) { displayed = entries; },
		fetcher: async (url, request) => {
			assert.equal(url, 'https://sync.wujiesync.cc/ss2/account/translate');
			assert.equal(request.redirect, 'error');
			assert.equal(request.headers.Authorization, 'Bearer fixture-only');
			calls.push(JSON.parse(request.body));
			if (calls.length === 1) return json({ dictionaries: [oxford, longman] });
			assert.deepEqual(displayed, [oxford, longman]);
			return json({ dictionaries: [oxford, longman, online] });
		},
	}));
	assert.deepEqual(calls.map(call => call.dictionary), ['alpha-local', 'alpha']);
	assert.deepEqual(result.dictionaries, [oxford, longman, online]);
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

test('rejects protected markers and stops requests when the authorization changes', async () => {
	assert.equal(canTranslate('wujie-lock:secret'), false);
	assert.equal(canTranslate('```wujie-encrypted'), false);
	let current = true;
	let calls = 0;
	await assert.rejects(translate(fixture({
		current: () => current,
		fetcher: async () => {
			calls++;
			current = false;
			return json({ dictionaries: [entry('oxford-hk10')] });
		},
	})), { status: 401 });
	assert.equal(calls, 1);
	const controller = new AbortController();
	controller.abort();
	await assert.rejects(translate(fixture({ signal: controller.signal })), { name: 'AbortError' });
});

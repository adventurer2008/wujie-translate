import assert from 'node:assert/strict';
import test from 'node:test';
import { canTranslate, translate } from '../src/service.js';

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

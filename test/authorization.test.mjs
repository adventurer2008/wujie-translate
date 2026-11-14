import assert from 'node:assert/strict';
import test from 'node:test';
import { vaultAuthorization } from '../src/authorization.js';

test('reads only the selected vault’s domestic authorization and observes sign-out', async () => {
	const id = '01234567-0123-0123-0123-0123456789ab';
	const values = new Map([[ `wujie-sync-${id}-account`, 'fixture-account' ],
		[ 'wujie-translate-service-authorization', 'fixture-legacy' ]]);
	const app = {
		secretStorage: { getSecret: key => values.get(key) },
		vault: { configDir: '.profile', adapter: { async read(path) {
			assert.equal(path, '.profile/plugins/wujie-sync/data.json');
			return JSON.stringify({ localId: id, settings: { origin: 'https://sync.wujiesync.cc' } });
		} } },
	};
	const read = await vaultAuthorization(app);
	assert.equal(read(), 'fixture-account');
	values.delete(`wujie-sync-${id}-account`);
	assert.equal(read(), '');
	app.vault.adapter.read = async () => { throw new Error('missing'); };
	assert.equal((await vaultAuthorization(app))(), 'fixture-legacy');
});

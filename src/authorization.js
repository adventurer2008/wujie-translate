import { serviceOrigin } from './service.js';

export async function vaultAuthorization(app) {
	const storage = app.secretStorage;
	if (!storage) return () => '';
	let localId;
	try {
		const config = JSON.parse(await app.vault.adapter.read(
			app.vault.configDir + '/plugins/wujie-sync/data.json'));
		if (config?.settings?.origin === serviceOrigin &&
			typeof config.localId === 'string' && /^[a-z0-9-]{16,64}$/i.test(config.localId))
			localId = config.localId;
	} catch {
		// The current vault may never have been connected to Wujie Sync.
	}
	if (localId) return () => storage.getSecret(`wujie-sync-${localId}-account`) ||
		storage.getSecret(`wujie-sync-${localId}-access`) || '';
	return () => storage.getSecret('wujie-translate-service-authorization') || '';
}

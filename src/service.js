export const serviceOrigin = 'https://sync.wujiesync.cc';
export const selectionLimit = 1000;

const dictionaryWord = /^[a-z]+(?:['’-][a-z]+)*(?: +[a-z]+(?:['’-][a-z]+)*){0,5}$/i;
const primaryDictionaries = ['oxford-hk10', 'longman-5pp'];
const supportedDictionaries = new Set([...primaryDictionaries, 'oxford-v3', 'bing', 'youdao', 'cambridge', 'oxford', 'ecdict']);

export function canTranslate(text) {
	return typeof text === 'string' && Boolean(text.trim()) &&
		!text.includes('wujie-lock:') && !text.includes('```wujie-encrypted');
}

async function post(text, target, dictionary, secret, signal, fetcher) {
	const response = await fetcher(serviceOrigin + '/ss2/account/translate', {
		method: 'POST', signal, credentials: 'omit', redirect: 'error', cache: 'no-store',
		headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' },
		body: JSON.stringify({ text, target, dictionary }),
	});
	if (!response.ok) throw Object.assign(new Error('Translation service rejected the request'), { status: response.status });
	return response.json();
}

function validDictionary(entry) {
	return Array.isArray(entry?.definitions) && entry.definitions.length &&
		entry.definitions.every(definition => typeof definition?.meaning === 'string');
}

function entries(result) {
	if (!Array.isArray(result?.dictionaries)) return [];
	return result.dictionaries.filter(entry => supportedDictionaries.has(entry?.source) && validDictionary(entry));
}

export async function translate({ text, target, secret, signal, showLocal, current, fetcher = fetch }) {
	const check = () => {
		signal.throwIfAborted();
		if (!secret || !current()) throw Object.assign(new Error('Authorization changed'), { status: 401 });
	};
	check();
	if (!canTranslate(text) || text.length > selectionLimit) throw new Error('Invalid input');
	const word = text.trim();
	const lookup = target === 'zh-Hans' && word.length <= 64 && dictionaryWord.test(word);
	let local = [];
	if (lookup) {
		try {
			const snapshot = await post(text, target, 'alpha-local', secret, signal, fetcher);
			check();
			local = entries(snapshot).filter(entry => primaryDictionaries.includes(entry.source));
		} catch (error) {
			if (error?.status !== 400) throw error;
		}
		if (local.length) showLocal(local);
	}
	check();
	let result;
	try {
		result = await post(text, target, lookup ? 'alpha' : undefined, secret, signal, fetcher);
	} catch (error) {
		check();
		if (!lookup || error?.status !== 400) throw error;
		result = await post(text, target, undefined, secret, signal, fetcher);
	}
	check();
	const dictionaries = new Map(entries(result).map(entry => [entry.source, entry]));
	for (const entry of local) dictionaries.set(entry.source, entry);
	if (lookup && (dictionaries.size || Array.isArray(result?.dictionaries))) return { dictionaries: [...dictionaries.values()] };
	if (lookup && validDictionary(result?.dictionary)) return { dictionary: result.dictionary };
	if (typeof result?.translation !== 'string' || !result.translation.trim() || result.translation.length > 12000)
		throw new Error('Invalid translation response');
	return { translation: result.translation };
}

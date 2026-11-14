export const serviceOrigin = 'https://sync.wujiesync.cc';
export const selectionLimit = 1000;

const dictionaryWord = /^[a-z]+(?:['’-][a-z]+)*(?: +[a-z]+(?:['’-][a-z]+)*){0,5}$/i;
const dictionaryOrder = ['oxford-hk10', 'oxford-v3', 'longman-5pp', 'ecdict'];

export function canTranslate(text) {
	return typeof text === 'string' && Boolean(text.trim()) &&
		!text.includes('wujie-lock:') && !text.includes('```wujie-encrypted');
}

async function post(text, target, dictionary, signal, fetcher) {
	const response = await fetcher(serviceOrigin + '/ss2/translate/alpha', {
		method: 'POST', signal, credentials: 'omit', redirect: 'error', cache: 'no-store',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ text, target, dictionary }),
	});
	if (!response.ok) throw Object.assign(new Error('Translation service rejected the request'), { status: response.status });
	return response.json();
}

function validDictionary(entry) {
	return Array.isArray(entry?.definitions) && entry.definitions.length &&
		entry.definitions.every(definition => typeof definition?.meaning === 'string');
}

export async function translate({ text, target, signal, fetcher = fetch }) {
	signal.throwIfAborted();
	if (!canTranslate(text) || text.length > selectionLimit) throw new Error('Invalid input');
	const word = text.trim();
	const lookup = target === 'zh-Hans' && word.length <= 64 && dictionaryWord.test(word);
	const result = await post(text, target, lookup ? true : undefined, signal, fetcher);
	signal.throwIfAborted();
	if (lookup && Array.isArray(result?.dictionaries)) {
		const dictionaries = dictionaryOrder.flatMap(source => {
			const entry = result.dictionaries.find(value => value?.source === source && validDictionary(value));
			return entry ? [entry] : [];
		});
		return { dictionaries };
	}
	if (lookup && validDictionary(result?.dictionary)) return { dictionary: result.dictionary };
	if (typeof result?.translation !== 'string' || !result.translation.trim() || result.translation.length > 12000)
		throw new Error('Invalid translation response');
	return { translation: result.translation };
}

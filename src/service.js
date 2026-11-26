export const serviceOrigin = 'https://sync.wujiesync.cc';
export const serviceOrigins = Object.freeze([
	serviceOrigin,
	'https://key.106-15-232-208.sslip.io',
	'https://new.106-15-232-208.sslip.io',
]);
export const selectionLimit = 1000;

const dictionaryWord = /^[a-z]+(?:['’-][a-z]+)*(?: +[a-z]+(?:['’-][a-z]+)*){0,5}$/i;
const dictionaryOrder = ['oxford-hk10', 'oxford-v3', 'longman-5pp', 'ecdict'];

export function canTranslate(text) {
	return typeof text === 'string' && Boolean(text.trim()) &&
		!text.includes('wujie-lock:') && !text.includes('```wujie-encrypted');
}

async function post(text, target, dictionary, signal, fetcher, timeout) {
	const body = JSON.stringify({ text, target, dictionary });
	let lastError;
	for (const origin of serviceOrigins) {
		signal.throwIfAborted();
		const controller = new AbortController();
		const abort = () => controller.abort(signal.reason);
		signal.addEventListener('abort', abort, { once: true });
		const timer = setTimeout(() => controller.abort(new DOMException('Translation timed out', 'TimeoutError')), timeout);
		try {
			const response = await fetcher(origin + '/ss2/translate/alpha', {
				method: 'POST', signal: controller.signal, credentials: 'omit', redirect: 'error', cache: 'no-store',
				headers: { 'Content-Type': 'application/json' }, body,
			});
			if (!response.ok) {
				void response.body?.cancel().catch(() => {});
				throw Object.assign(new Error('Translation service rejected the request'), { status: response.status });
			}
			return await response.json();
		} catch (error) {
			signal.throwIfAborted();
			if (!controller.signal.aborted && !(error instanceof TypeError) &&
				!['NetworkError', 'TimeoutError', 'SyntaxError'].includes(error?.name) &&
				![408, 500, 502, 503, 504].includes(error?.status)) throw error;
			lastError = controller.signal.aborted ? controller.signal.reason : error;
		} finally {
			clearTimeout(timer);
			signal.removeEventListener('abort', abort);
		}
	}
	throw lastError;
}

function validDictionary(entry) {
	return Array.isArray(entry?.definitions) && entry.definitions.length &&
		entry.definitions.every(definition => typeof definition?.meaning === 'string');
}

export async function translate({ text, target, signal, fetcher = fetch, timeout = 14000 }) {
	signal.throwIfAborted();
	if (!canTranslate(text) || text.length > selectionLimit) throw new Error('Invalid input');
	const word = text.trim();
	const lookup = target === 'zh-Hans' && word.length <= 64 && dictionaryWord.test(word);
	const result = await post(text, target, lookup ? true : undefined, signal, fetcher, timeout);
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

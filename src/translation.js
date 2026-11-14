// Adapted from Wujie Sync client 3eb934c (Apache-2.0).
import * as ObsidianSdk from 'obsidian';
import { showTooltip } from '@codemirror/view';
import { canTranslate, selectionLimit, translate } from './service.js';

const { Modal, Notice, Platform, editorInfoField } = ObsidianSdk;
const languages = {
	'zh-Hans': '简体中文', en: '英语', ja: '日语', ko: '韩语', fr: '法语',
	de: '德语', es: '西班牙语', ru: '俄语', pt: '葡萄牙语',
};
const title = '翻译所选文字';
const dictionaryWord = /^[a-z]+(?:['’-][a-z]+)*$/i;

function selectionText(file, text) {
	return /\.md$/i.test(file?.path ?? '') && text?.trim() && canTranslate(text) ? text : '';
}

function button(container, label) {
	return container.createEl('button', { text: label, attr: { type: 'button' } });
}

function iconButton(container, label, icon, cls) {
	const control = container.createEl('button', { cls, attr: { type: 'button', 'aria-label': label, title: label } });
	if (ObsidianSdk.setIcon) ObsidianSdk.setIcon(control, icon);
	else control.setText(label);
	return control;
}

function addTranslationMascot(container) {
	container.createEl('span', { cls: 'wujie-translate-translation-mascot', attr: { 'aria-hidden': 'true' } });
}

function errorMessage(error) {
	switch (error?.status) {
		case 404: return '当前服务暂未开放翻译。';
		case 429: return '翻译达到用量上限或服务繁忙，请稍后重试。';
		default: return '翻译失败，请检查网络或稍后重试。';
	}
}

function renderDictionary(output, entry, text) {
	const card = output.createDiv({ cls: 'wujie-translate-dictionary' });
	const hero = card.createDiv({ cls: 'wujie-translate-dictionary-hero' });
	hero.createDiv({ cls: 'wujie-translate-dictionary-kicker', text: '英汉词典' });
	hero.createEl('div', { cls: 'wujie-translate-dictionary-word', text: entry.word || text.trim() });
	if (entry.uk || entry.us || entry.phonetic) {
		const phonetics = hero.createDiv({ cls: 'wujie-translate-dictionary-phonetics' });
		if (entry.uk) phonetics.createEl('span', { text: '英 /' + entry.uk.replace(/^\/|\/$/g, '') + '/' });
		if (entry.us) phonetics.createEl('span', { text: '美 /' + entry.us.replace(/^\/|\/$/g, '') + '/' });
		if (!entry.uk && !entry.us) phonetics.createEl('span', { text: entry.phonetic });
	}
	const groups = new Map();
	for (const { part, meaning } of entry.definitions) {
		const group = groups.get(part) ?? [];
		group.push(meaning);
		groups.set(part, group);
	}
	card.createDiv({ cls: 'wujie-translate-dictionary-label', text: '释义' });
	const definitions = card.createEl('dl', { cls: 'wujie-translate-dictionary-definitions' });
	for (const [part, meanings] of groups) {
		definitions.createEl('dt', { text: part || '释义' });
		definitions.createEl('dd', { text: meanings.join('；') });
	}
	if (entry.forms?.length) {
		card.createDiv({ cls: 'wujie-translate-dictionary-label', text: '词形' });
		const forms = card.createDiv({ cls: 'wujie-translate-dictionary-forms' });
		for (const { label, value } of entry.forms) forms.createEl('span', { text: label ? label + ' ' + value : value });
	}
	if (entry.examples?.length) {
		card.createDiv({ cls: 'wujie-translate-dictionary-label', text: '例句' });
		const examples = card.createEl('ol', { cls: 'wujie-translate-dictionary-examples' });
		for (const { source, translation } of entry.examples) {
			const example = examples.createEl('li', { text: source });
			if (translation) example.createDiv({ cls: 'wujie-translate-dictionary-example-translation', text: translation });
		}
	}
}

const dictionaryNames = new Map([
	['oxford-hk10', '牛津'],
	['oxford-v3', '牛津'],
	['longman-5pp', '朗文当代高级英汉双解词典'],
	['bing', '必应词典'], ['youdao', '有道词典'], ['cambridge', '剑桥词典'], ['oxford', '牛津词典'],
	['ecdict', '自建词库'],
]);

function renderDictionaries(output, entries, text) {
	const openBySource = new Map([...output.querySelectorAll('details[data-source]')]
		.map(section => [section.dataset.source, section.open]));
	output.empty();
	if (!entries.length) {
		output.setText('未查到词条。');
		return;
	}
	const bySource = new Map(entries.map(entry => [entry.source, entry]));
	for (const [source, name] of dictionaryNames) {
		const entry = bySource.get(source);
		if (!entry) continue;
		const section = output.createEl('details', { cls: 'wujie-translate-dictionary-source', attr: { 'data-source': source } });
		section.createEl('summary', { text: name });
		renderDictionary(section, entry, text);
		section.open = openBySource.get(source) ?? true;
	}
}

function renderTranslation(container, text, request, close) {
	const doc = container.ownerDocument;
	const header = container.createDiv({ cls: 'wujie-translate-translation-header' });
	addTranslationMascot(header);
	header.createDiv({ cls: 'wujie-translate-translation-source', text, attr: { dir: 'auto' } });
	const dismiss = iconButton(header, '关闭翻译', 'x', 'wujie-translate-translation-dismiss');
	const output = container.createDiv({
		cls: 'wujie-translate-translation-output', attr: { role: 'status', 'aria-live': 'polite', dir: 'auto' },
	});
	const controls = container.createDiv({ cls: 'wujie-translate-translation-controls' });
	const target = controls.createEl('select', { attr: { 'aria-label': '目标语言' } });
	for (const [code, label] of Object.entries(languages))
		target.createEl('option', { text: label, attr: { value: code } });
	const letters = text.match(/\p{L}/gu)?.length ?? 0;
	target.value = !/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text) &&
		(text.match(/\p{Script=Han}/gu)?.length ?? 0) > letters / 2 ? 'en' : 'zh-Hans';
	const copy = button(controls, '复制译文');
	const retry = button(controls, '重试');
	let current, translation;
	const run = async () => {
		current?.abort();
		const controller = new AbortController();
		current = controller;
		translation = undefined;
		copy.hidden = true;
		retry.hidden = true;
		output.setText(target.value === 'zh-Hans' && dictionaryWord.test(text.trim()) ? '正在查询…' : '正在翻译…');
		try {
			const result = await request(text, target.value, controller.signal);
			if (controller.signal.aborted) return;
			if (result.dictionaries) {
				renderDictionaries(output, result.dictionaries, text);
				return;
			}
			if (result.dictionary) {
				output.empty();
				renderDictionary(output, result.dictionary, text);
				return;
			}
			translation = result.translation;
			output.setText(translation);
			copy.hidden = false;
		} catch (error) {
			if (controller.signal.aborted) return;
			output.setText(errorMessage(error));
			retry.hidden = false;
		}
	};
	copy.addEventListener('click', async () => {
		if (!translation) return;
		const controller = current;
		try {
			await doc.defaultView.navigator.clipboard.writeText(translation);
			if (!controller.signal.aborted) new Notice('已复制译文。');
		} catch {
			if (!controller.signal.aborted) new Notice('无法访问剪贴板，可选中译文手动复制。');
		}
	});
	target.addEventListener('change', () => void run());
	retry.addEventListener('click', () => void run());
	dismiss.addEventListener('click', () => close(true));
	const onVisibility = () => { if (doc.hidden) close(); };
	doc.addEventListener('visibilitychange', onVisibility);
	void run();
	return () => {
		current?.abort();
		translation = undefined;
		doc.removeEventListener('visibilitychange', onVisibility);
		container.empty();
	};
}

function translationTooltip(open) {
	return showTooltip.compute(['selection', 'doc'], state => {
		const { main, ranges } = state.selection;
		if (ranges.length !== 1 || main.empty || main.to - main.from > selectionLimit) return null;
		const file = state.field(editorInfoField, false)?.file;
		const text = selectionText(file, state.sliceDoc(main.from, main.to));
		if (!text) return null;
		return {
			pos: main.head, above: true, clip: true, offset: { x: 4, y: 6 },
			create(view) {
				const doc = view.dom.ownerDocument;
				const dom = doc.createElement('div');
				dom.addClass('wujie-translate-translation-tooltip');
				const trigger = dom.createEl('button', { cls: 'wujie-translate-translation-trigger', attr: {
					type: 'button', 'aria-label': title, title,
				} });
				addTranslationMascot(trigger);
				trigger.setAttribute('aria-expanded', 'false');
				let close, destroyed = false;
				trigger.addEventListener('mousedown', event => event.preventDefault());
				trigger.addEventListener('click', async () => {
					const dismiss = await open(text, dom, trigger);
					if (destroyed) dismiss?.();
					else close = dismiss;
				});
				return { dom, destroy() { destroyed = true; close?.(); } };
			},
		};
	});
}

function protectedReadingSelection(preview, range) {
	return preview.closest('.markdown-embed, .wujie-encrypted') ||
		[...preview.querySelectorAll('.wujie-encrypted, .markdown-embed')].some(area => range.intersectsNode(area));
}

function registerReadingTranslation(owner, enabled, open) {
	const workspace = owner.app.workspace;
	const documents = new Map();
	let active;
	const clear = () => {
		if (!active) return;
		const previous = active;
		active = undefined;
		previous.close?.();
		previous.anchor.remove();
	};
	const readingSelection = doc => {
		const selection = doc.getSelection();
		if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return;
		const range = selection.getRangeAt(0);
		const start = range.startContainer;
		const preview = (start.nodeType === 1 ? start : start.parentElement)?.closest('.markdown-preview-view');
		if (!preview?.isConnected || !preview.contains(range.endContainer)) return;
		const view = workspace.getLeavesOfType('markdown').map(leaf => leaf.view).find(view =>
			view?.containerEl?.contains(preview) && view.getMode?.() === 'preview');
		const text = selectionText(view?.file, selection.toString());
		if (!text || text.length > selectionLimit) return;
		if (protectedReadingSelection(preview, range)) return;
		return { view, file: view.file, preview, text, range };
	};
	const update = doc => {
		if (doc.hidden || !enabled()) { if (active?.doc === doc) clear(); return; }
		const selection = doc.getSelection();
		if (active?.doc === doc && active.close && active.anchor.contains(selection?.anchorNode)) return;
		const selected = readingSelection(doc);
		if (!selected) { if (active?.doc === doc) clear(); return; }
		const { range } = selected;
		if (active?.doc === doc && active.file === selected.file && active.preview === selected.preview &&
			active.text === selected.text && active.range.compareBoundaryPoints(0, range) === 0 &&
			active.range.compareBoundaryPoints(2, range) === 0) return;
		clear();
		const rect = range.getBoundingClientRect?.();
		const win = doc.defaultView;
		if (!rect || !win || (!rect.width && !rect.height) || rect.bottom < 0 || rect.top > win.innerHeight) return;
		const anchor = doc.createElement('div');
		anchor.className = 'wujie-translate-translation-tooltip wujie-translate-reading-translation';
		const width = Math.min(480, win.innerWidth - 24);
		anchor.style.left = `${Math.max(12, Math.min(rect.right, win.innerWidth - width - 12))}px`;
		const below = rect.bottom + 8;
		const above = win.innerHeight - rect.top + 8;
		const placeBelow = win.innerHeight - below >= 240 || below < above;
		anchor.style[placeBelow ? 'top' : 'bottom'] = `${Math.max(8, placeBelow ? below : above)}px`;
		anchor.style.setProperty('--reading-translation-height', `${Math.max(40, (placeBelow ? win.innerHeight - below : win.innerHeight - above) - 12)}px`);
		const trigger = anchor.createEl('button', { cls: 'wujie-translate-translation-trigger', attr: {
			type: 'button', 'aria-label': title, title,
		} });
		addTranslationMascot(trigger);
		trigger.setAttribute('aria-expanded', 'false');
		const candidate = { ...selected, range: range.cloneRange(), doc, anchor };
		active = candidate;
		trigger.addEventListener('pointerdown', event => event.preventDefault());
		trigger.addEventListener('click', async () => {
			if (active !== candidate || !enabled() || !candidate.preview.isConnected ||
				candidate.view.file !== candidate.file || candidate.view.getMode() !== 'preview') return clear();
			if (Platform.isMobile) { clear(); await open(candidate.text); }
			else {
				const dismiss = await open(candidate.text, anchor, trigger);
				if (active !== candidate) dismiss?.();
				else candidate.close = dismiss;
			}
		});
		doc.body.appendChild(anchor);
	};
	const refreshDocuments = () => {
		const current = new Set(workspace.getLeavesOfType('markdown').map(leaf => leaf.view?.containerEl?.ownerDocument).filter(Boolean));
		for (const [doc, controller] of documents) if (!current.has(doc)) {
			if (active?.doc === doc) clear();
			controller.abort();
			documents.delete(doc);
		}
		for (const doc of current) if (!documents.has(doc)) {
			const controller = new doc.defaultView.AbortController();
			documents.set(doc, controller);
			const options = { signal: controller.signal, capture: true };
			doc.addEventListener('selectionchange', () => update(doc), options);
			doc.addEventListener('pointerdown', event => {
				if (active?.doc === doc && !active.anchor.contains(event.target)) clear();
			}, options);
			doc.addEventListener('pointerup', event => { if (!active?.anchor.contains(event.target)) update(doc); }, options);
			doc.addEventListener('keydown', event => { if (event.key === 'Escape' && active?.doc === doc && !active.close) clear(); }, options);
			doc.addEventListener('visibilitychange', () => { if (doc.hidden && active?.doc === doc) clear(); }, options);
			doc.addEventListener('scroll', event => { if (active?.doc === doc && !active.anchor.contains(event.target)) clear(); }, options);
			doc.defaultView.addEventListener('resize', () => { if (active?.doc === doc) clear(); }, options);
		}
	};
	if (workspace.getLeavesOfType && workspace.on && owner.register) {
		owner.registerEvent(workspace.on('layout-change', () => { clear(); refreshDocuments(); }));
		owner.registerEvent(workspace.on('active-leaf-change', () => { clear(); refreshDocuments(); }));
		owner.registerEvent(workspace.on('window-open', refreshDocuments));
		owner.registerEvent(workspace.on('window-close', refreshDocuments));
		owner.register(() => { clear(); for (const controller of documents.values()) controller.abort(); documents.clear(); });
		workspace.onLayoutReady ? workspace.onLayoutReady(() => { if (!owner.stopped) refreshDocuments(); }) : refreshDocuments();
	}
	return clear;
}

export function registerNoteTranslation(owner) {
	class TranslationModal extends Modal {
		constructor(app, text, request, onClose) {
			super(app);
			Object.assign(this, { text, request, afterClose: onClose });
		}
		onOpen() {
			this.setTitle('翻译');
			this.modalEl.addClass('wujie-translate-translation-modal');
			if (Platform.isMobile) this.containerEl?.addClass('wujie-translate-translation-sheet');
			this.cleanup = renderTranslation(this.contentEl, this.text, this.request, () => this.close());
		}
		onClose() {
			this.cleanup?.();
			this.cleanup = this.text = undefined;
			this.afterClose();
		}
	}
	const workspace = owner.app.workspace;
	const enabled = () => !owner.stopped && owner.translationEnabled;
	let closeActive;
	const close = () => closeActive?.();
	const open = (text, anchor, trigger) => {
		if (!enabled() || !canTranslate(text)) return;
		if (text.length > selectionLimit) {
			new Notice('请选中不超过 1000 字符的文字。');
			return;
		}
		close();
		if (anchor && !anchor.isConnected) return;
		const request = (text, target, signal) => translate({ text, target, signal });
		if (!anchor) {
			const modal = new TranslationModal(owner.app, text, request, () => {
				if (closeActive === closeModal) closeActive = undefined;
			});
			const closeModal = () => modal.close();
			closeActive = closeModal;
			modal.open();
			return;
		}
		const panel = anchor.createDiv({ cls: 'wujie-translate-translation-panel', attr: { role: 'group', 'aria-label': '划词翻译' } });
		const doc = anchor.ownerDocument;
		const focusPanel = doc.activeElement === trigger;
		trigger.hidden = true;
		trigger.setAttribute('aria-expanded', 'true');
		const outside = event => { if (!anchor.contains(event.target)) closePanel(); };
		const escape = event => { if (event.key === 'Escape') closePanel(anchor.contains(doc.activeElement)); };
		const closePanel = (restoreFocus = false) => {
			if (closeActive !== closePanel) return;
			closeActive = undefined;
			cleanup();
			panel.remove();
			trigger.hidden = false;
			trigger.setAttribute('aria-expanded', 'false');
			doc.removeEventListener('pointerdown', outside, true);
			doc.removeEventListener('keydown', escape, true);
			if (restoreFocus) trigger.focus();
		};
		const cleanup = renderTranslation(panel, text, request, closePanel);
		closeActive = closePanel;
		doc.addEventListener('pointerdown', outside, true);
		doc.addEventListener('keydown', escape, true);
		if (focusPanel) panel.querySelector('.wujie-translate-translation-dismiss')?.focus();
		return closePanel;
	};
	const clearReading = registerReadingTranslation(owner, enabled, open);
	const closeAll = () => { clearReading(); close(); };
	owner.addCommand({
		id: 'translate-selection', name: title,
		editorCheckCallback(checking, editor, info) {
			if (!enabled()) return false;
			const text = selectionText(info?.file, editor.getSelection());
			if (!text) return false;
			if (!checking) open(text);
			return true;
		},
	});
	if (workspace.on) {
		owner.registerEvent(workspace.on('editor-menu', (menu, editor, info) => {
			if (!enabled()) return;
			const text = selectionText(info?.file, editor.getSelection());
			if (text) menu.addItem(item => item.setTitle(title).setIcon('languages').onClick(() => open(text)));
		}));
		owner.registerEvent(workspace.on('file-open', closeAll));
	}
	const extensions = [];
	const tooltip = !Platform.isMobile && editorInfoField ? translationTooltip(open) : null;
	if (tooltip) {
		if (enabled()) extensions.push(tooltip);
		owner.registerEditorExtension(extensions);
	}
	return {
		close: closeAll,
		refresh() {
			if (!enabled()) closeAll();
			if (tooltip) {
				extensions.splice(0, extensions.length, ...(enabled() ? [tooltip] : []));
				workspace.updateOptions();
			}
		},
		open,
	};
}

import { Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { registerNoteTranslation } from './translation.js';
import { canTranslate, selectionLimit } from './service.js';

class LookupModal extends Modal {
	constructor(app, openResult) {
		super(app);
		this.openResult = openResult;
	}
	onOpen() {
		this.setTitle('无界译 · 查词和翻译');
		const form = this.contentEl.createEl('form');
		const input = form.createEl('textarea', { cls: 'wujie-translate-input', attr: {
			maxlength: String(selectionLimit), placeholder: '输入英文单词、短语或要翻译的文字',
			'aria-label': '查词和翻译内容',
		} });
		form.createEl('button', { text: '查询或翻译', attr: { type: 'submit' } });
		form.addEventListener('submit', event => {
			event.preventDefault();
			const text = input.value.trim();
			if (!canTranslate(text)) {
				new Notice('请输入可翻译的普通文字。');
				return;
			}
			this.close();
			this.openResult(text);
		});
	}
	onClose() {
		this.contentEl.empty();
	}
}

class TranslateSettings extends PluginSettingTab {
	constructor(app, plugin) {
		super(app, plugin);
		this.plugin = plugin;
	}
	display() {
		this.containerEl.empty();
		this.containerEl.createEl('p', { text: '发起查询或翻译时，只将所选或输入的文字发送到无界服务。' });
		new Setting(this.containerEl)
			.setName('启用翻译功能')
			.setDesc('选中文字后可查词或翻译。')
			.addToggle(toggle => toggle.setValue(this.plugin.translationEnabled)
				.onChange(value => this.plugin.setTranslationEnabled(value)));
	}
}

module.exports = class WujieTranslate extends Plugin {
	translationEnabled = true;
	saveQueue = Promise.resolve();
	async onload() {
		this.translationEnabled = (await this.loadData())?.translationEnabled !== false;
		this.stopped = false;
		this.translation = registerNoteTranslation(this);
		const lookup = () => {
			if (!this.translationEnabled) return;
			this.lookup?.close();
			this.lookup = new LookupModal(this.app, this.translation.open);
			this.lookup.open();
		};
		this.ribbon = this.addRibbonIcon('languages', '无界译', lookup);
		this.ribbon.hidden = !this.translationEnabled;
		this.addCommand({ id: 'lookup', name: '查词和翻译', checkCallback: checking => {
			if (!this.translationEnabled) return false;
			if (!checking) lookup();
			return true;
		} });
		this.addSettingTab(new TranslateSettings(this.app, this));
	}
	setTranslationEnabled(value) {
		this.translationEnabled = value;
		this.ribbon.hidden = !value;
		if (!value) this.lookup?.close();
		this.translation.refresh();
		this.saveQueue = this.saveQueue.then(() => this.saveData({ translationEnabled: value }))
			.catch(() => new Notice('无法保存翻译设置，请重试。'));
	}
	onunload() {
		this.stopped = true;
		this.lookup?.close();
		this.translation?.close();
	}
};

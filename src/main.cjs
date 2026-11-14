import { Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { registerNoteTranslation } from './translation.js';
import { canTranslate, selectionLimit } from './service.js';

const secretId = 'wujie-translate-service-authorization';

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
		this.containerEl.createEl('p', { text: '发起查询或翻译时，只将所选或输入的文字发送到无界服务。牛津高阶和朗文词库由服务端维护。' });
		const storage = this.app.secretStorage;
		if (!storage) {
			this.containerEl.createEl('p', { text: '当前 Obsidian 无法使用安全存储，请升级后设置服务授权。' });
			return;
		}
		let input;
		const auth = new Setting(this.containerEl)
			.setName('服务授权')
			.setDesc(storage.getSecret(secretId) ? '当前库已保存授权。' : '填写有效的国内无界服务授权码。');
		auth.addText(text => {
			input = text;
			text.inputEl.type = 'password';
			text.inputEl.autocomplete = 'off';
			text.inputEl.setAttribute('aria-label', '服务授权码');
		});
		auth.addButton(button => button.setButtonText('保存').onClick(() => {
			const value = input.getValue().trim();
			if (!value || /\s/.test(value)) return new Notice('请填写有效的服务授权码。');
			storage.setSecret(secretId, value);
			this.plugin.translation.close();
			this.display();
			new Notice('已保存无界译授权。');
		}));
		auth.addButton(button => button.setButtonText('清除').onClick(() => {
			storage.setSecret(secretId, '');
			this.plugin.translation.close();
			this.display();
		}));
	}
}

module.exports = class WujieTranslate extends Plugin {
	authorization() {
		return this.app.secretStorage?.getSecret(secretId) ?? '';
	}
	onload() {
		this.stopped = false;
		this.translation = registerNoteTranslation(this);
		const lookup = () => {
			this.lookup?.close();
			this.lookup = new LookupModal(this.app, this.translation.open);
			this.lookup.open();
		};
		this.addRibbonIcon('languages', '无界译', lookup);
		this.addCommand({ id: 'lookup', name: '查词和翻译', callback: lookup });
		this.addSettingTab(new TranslateSettings(this.app, this));
	}
	onunload() {
		this.stopped = true;
		this.lookup?.close();
		this.translation?.close();
	}
};

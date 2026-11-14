# 无界译 · Wujie Translate

无界译是独立的 Obsidian 插件。在笔记里选中文字后点「翻译所选文字」，也可以点侧边栏图标或用「查词和翻译」命令手动输入。支持英汉查词、切换目标语言和复制译文。

在 Obsidian 中打开「设置 → 第三方插件 → 浏览」，搜索 **Wujie Translate**，安装并启用。翻译默认开启。

Wujie Translate is a standalone Obsidian plugin for looking up English words and translating selected or entered text.

### 网络与隐私 · Network and privacy

查词和翻译使用当前库已有的登录状态访问无界在线服务。插件只在你发起请求时发送所选或输入的文字、目标语言和登录凭据。服务可能调用上游供应商，并记录用量以执行额度限制。插件不会自动发送笔记或保存翻译历史。详见[隐私说明](https://wujiesync.cc/privacy/)。

Lookups and translations use the current vault’s existing sign-in to access the online Wujie service. The plugin sends your selected or entered text, target language, and sign-in credential only when you make a request. The service may use upstream providers and tracks usage for quotas. See the [privacy policy](https://wujiesync.cc/privacy/).

`npm ci` 安装构建依赖，`npm test` 运行专项测试，`npm run build` 生成可安装文件和 SHA-256 清单。Obsidian 最低版本为 1.12.7。

代码采用 Apache License 2.0。

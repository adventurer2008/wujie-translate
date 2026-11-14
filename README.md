# 无界译 · Wujie Translate

无界译是独立的 Obsidian 插件。在笔记里选中文字后点「翻译所选文字」，也可以点侧边栏图标或用「查词和翻译」命令手动输入。翻译可切换目标语言和复制译文。英汉查询使用国内无界服务提供的双语词典。

在 Obsidian 中打开「设置 → 第三方插件 → 浏览」，搜索 **Wujie Translate**，安装并启用。翻译默认开启。

查词和翻译使用无界在线服务，并复用当前库已有的登录授权。发起请求时，插件只发送所选或输入的文字、目标语言和授权信息。服务可能调用上游供应商，并记录用量以执行额度限制。插件不会自动发送笔记或保存翻译历史。详见[隐私说明](https://wujiesync.cc/privacy/)。

Wujie Translate looks up English words and translates selected or entered text. Lookups and translations use the online Wujie service and require an existing sign-in. The service may use upstream providers and tracks usage for quotas. See the [privacy policy](https://wujiesync.cc/privacy/).

`npm ci` 安装构建依赖，`npm test` 运行专项测试，`npm run build` 生成可安装文件和 SHA-256 清单。Obsidian 最低版本为 1.12.7。

代码采用 Apache License 2.0。

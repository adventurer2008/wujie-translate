# 无界译 · Wujie Translate

无界译是独立的 Obsidian 插件。在笔记里选中文字后点「翻译所选文字」，也可以点侧边栏图标或用「查词和翻译」命令手动输入。翻译可切换目标语言和复制译文。英汉查询从国内无界服务读取词典，牛津高阶排在第一，朗文当代高级英汉双解排在第二。

在测试库的 `.obsidian/plugins/` 下放入构建生成的 `wujie-translate` 文件夹，在 Obsidian 社区插件中启用 **Wujie Translate**。翻译默认开启，使用当前库已保存的国内无界同步登录授权。旧版无界译已有授权的库也可继续使用。牛津和朗文由后台维护，无界译没有词库导入入口。

查词和翻译需要互联网和国内无界账号。发起请求时，插件将所选或输入的文字、目标语言和当前库的服务授权发送到 `https://sync.wujiesync.cc`。线上词典或翻译会按服务配置使用上游供应商，服务器按账号统计用量以执行额度限制。插件不会自动发送笔记或保存翻译历史。详见[隐私说明](https://wujiesync.cc/privacy/)。网络恢复后可点「重试」。

Wujie Translate looks up English words and translates selected or entered text. It requires an internet connection and a domestic Wujie account for all lookups and translations. The plugin uses the current vault's existing Wujie Sync authorization in Obsidian SecretStorage. Requests go to `https://sync.wujiesync.cc`, which may use upstream dictionary and translation providers. The service tracks account usage for quotas. See the [privacy policy](https://wujiesync.cc/privacy/).

`npm ci` 安装构建依赖，`npm test` 运行专项测试，`npm run build` 生成可安装文件和 SHA-256 清单。Obsidian 最低版本为 1.12.7。

划词 UI 和样式改编自 Wujie Sync 客户端提交 `3eb934c58427854ed111d989dd6569c063145610`。Copyright (c) 2026 lihy。代码采用 Apache License 2.0，见 LICENSE。

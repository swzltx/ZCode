# Nebula QA plugin

把 Nebula 的 QA 能力作为 ZCode **内置插件**提供：插件自带本地 stdio MCP 服务与 `nebula-qa` 技能，不启动 Nebula 桌面端、不监听端口、不需要令牌。`ui.run` 通过 MCP sampling 使用 **ZCode 当前会话模型**（多模态），插件不再保存模型 Key。

## 前置

- 本机需要 Playwright Chromium（UI 执行用；约 400MB，缺失时执行会明确报错）。
- ZCode 需支持 MCP sampling（当前宿主已支持；不支持时 `ui.run` 会明确报错）。

## 启用插件

在 ZCode 设置 › 插件里启用 **Nebula QA** 即可，没有模型/令牌配置。

启用后 ZCode 以子进程方式启动 `dist/mcp/main.js`：

- 数据目录：`${ZCODE_PLUGIN_DATA}`
- 项目目录：`${ZCODE_PROJECT_DIR}`
- 工具命名空间：`mcp__plugin_nebula-qa_nebula__<tool>`

## 构建产物

仓库内不提交 `dist/` 与根级 `node_modules/`（均被 .gitignore 覆盖）。开发时从 Nebula 构建并复制：

```bash
# 在 Nebula 仓库
pnpm --config.verifyDepsBeforeRun=false --filter @nebula/qa-mcp build
node node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild/bin/esbuild \
  packages/qa-mcp/src/main.ts --bundle --platform=node --format=esm --target=node22 \
  --outdir=<plugin>/dist/mcp --splitting \
  --external:playwright --external:playwright-core --external:@lancedb/lancedb \
  --external:@nebula/device-android --external:@nebula/device-computer \
  --external:@nebula/device-harmony --external:@nebula/device-ios --external:*.node \
  --banner:js="import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);"

# 在 Nebula 仓库把 playwright 与 playwright-core 复制到 <plugin>/node_modules/
```

## 技能

`skills/nebula-qa/SKILL.md` 说明执行 UI、轮询 `ui.get_run`、读断言证据、API 执行与分诊。工具清单见 `skills/nebula-qa/references/tools.md`。

## 边界

- ZCode 负责宿主、模型权限与工具确认；插件只提供 QA 能力，不改 ZCode 核心。
- 本服务不创建审批队列；ZCode 的权限弹窗是唯一闸门。
- 模型 Key 不写进仓库、示例、日志或对话；只放在插件 sensitive 配置里。
- 当前只启用 browser 设备；设计腿已技能化（`case.prepare/validate/save`），设计判断由 ZCode 模型完成，不需要第二把设计模型 Key。

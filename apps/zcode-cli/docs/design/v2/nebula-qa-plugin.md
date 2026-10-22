# Nebula QA 插件（stdio 内置版）

## 背景

Nebula 桌面端作为独立产品退役，QA 能力改为 ZCode 的**能力补充**：C 端只保留 ZCode，Nebula 以插件自带的本机 stdio MCP 服务 + skill 形式提供用例执行、证据读取与分诊。ZCode 核心（agent、权限、会话、UI）不做修改。

早期版本通过 HTTP 连接 Nebula 桌面端（`127.0.0.1:46133` + Bearer 令牌），依赖桌面端常驻、审批窗口与外部接入设置。该形态已废弃。

## 目标

- 内置插件 `nebula-qa` 自带 stdio MCP 服务，启动插件即可用，不监听端口、不需要 URL/token。
- 数据落在 ZCode 插件数据目录（`${ZCODE_PLUGIN_DATA}`），项目目录取 `${ZCODE_PROJECT_DIR}`。
- ZCode 的工具权限弹窗是唯一审批闸门；服务内部不再创建审批队列。
- 执行结果通过 `ui.get_run` 返回断言判定（`assertions[].passed`）、报告摘要与截图/trace 路径。
- skill `nebula-qa` 指导 agent 完成“启动执行 → 轮询 → 读证据 → 分诊”的闭环。
- 设计能力迁移为本地技能工具（`case.prepare/validate/save`），不依赖 Nebula 的设计子智能体。

## 非目标

- 不修改 ZCode 核心能力、权限模型、agent 循环或 UI 框架。
- 不把 Nebula 桌面端作为运行前置条件。
- 第一版只启用 browser 设备；Android/iOS/harmony/desktop 驱动与原生依赖不进产物。
- 不在仓库中保存模型密钥；密钥走 sensitive `userConfig` 注入环境变量。

## 产品规则

- 插件默认关闭；启用后自动启动本地 MCP 服务。
- 没有模型/token 配置：设计由 ZCode 会话模型完成；`ui.run` 通过 **MCP sampling** 使用同一个会话模型（多模态），插件不保存模型 Key。
- 宿主为 MCP sampling 增加一个**可选端口**：只有注入了 sampling 端口才向 server 宣告能力；没有端口时行为与之前完全一致。
- 工具命名空间：`mcp__plugin_nebula-qa_nebula__<tool>`。
- 执行类工具（`ui.run`/`ui.stop`/`api.run`/`triage.run`）由 ZCode 弹权限；拒绝即停手，不换参数重试、不声称已执行。
- 长任务：`ui.run` 默认立即返回 `executionId`（`waitMs=0`）；用 `ui.get_run` 轮询终态。`success` 不等于断言通过，必须以 `assertions[].passed` 为准。
- sampling 归属：优先用当前工具调用 trace；`ui.run` 返回后引擎继续在后台采样，用“最近一次工具调用 trace（30 分钟内）”兜底；超过窗口不猜会话。
- MCP 协议固定 `protocolVersion: "legacy"`：新版协议把 sampling 标记为 deprecated，legacy era 下宿主与插件的行为可验证。
- 数据目录与旧 `~/.nebula/data` 隔离；原型期不迁移旧库。
- ID 一律从工具返回中取，不许猜。

## 状态与所有权

- 插件清单、技能与打包产物：`apps/zcode-cli/packages/nebula-qa-plugin` 是唯一来源；`dist/mcp` 与 `node_modules/playwright*` 是构建产物（gitignore）。
- QA 引擎（执行、设备、证据、用例库）：`E:/CodeSpace/Nebula/packages/qa-mcp` 构建为自包含 stdio 服务；第一阶段仍从 Nebula 仓库构建，验证通过后再迁入 ZCode monorepo。
- 数据：插件数据目录下的 `nebula.db` 与 `artifacts/`；服务独占写入。
- 审批：ZCode 权限层（项目级规则）；服务不持有第二套审批状态。
- 浏览器：Playwright Chromium 由宿主机器提供；插件携带 `playwright`/`playwright-core` JS 包。

## 验收

- `OFFICIAL_PLUGIN_DEFINITIONS` 含 `nebula-qa`，默认关闭；package、manifest、definition 版本一致（0.3.0）。
- manifest `mcpServers.nebula.type === "stdio"`，`command === "node"`，args 指向 `${ZCODE_PLUGIN_ROOT}/dist/mcp/main.js`，env 只注入数据目录与项目目录；不存在 `userConfig`/`url`/`headers`/模型 Key。
- 官方 seed 包含 `dist/mcp/main.js`、SKILL.md、tools.md，并允许根级 `node_modules`。
- 不启动 Nebula 桌面端时：`tools/list` 返回 17 个工具；`project.active`、`device.list` 返回真实数据；设计腿完整可用。
- `ui.run` 宿主模型链路（**当前阻塞，未通过**）：ZCode 内调用 ui.run 能拿到 executionId，sampling handler 被调用且 `hasTrace=true`，但 `sampleModel` 的模型调用一直不返回；执行停在 running。同一插件 bundle 在独立 stdio 客户端 + 模型环境下跑通过（含 `assertionPassed=true` 与 trace/截图），因此阻塞在宿主 sampling 的模型调用/会话模型绑定，而不是执行引擎。
- 设计腿（已验证）：ZCode 模型通过 `case.prepare` 取 diff/影响面，自己产出 facts 与用例，`case.validate` 连续修正后 `case.save` 入库；插件数据目录里能读到 `case_design_requests.status=completed`、UI 用例与 `knowledge_snapshots`。
- bootstrap 单测、CLI typecheck/lint、architecture check 全绿。

## 测试计划

- bootstrap 单测：manifest stdio/env/无 token、definition seed 路径与 `runtimeTopLevelPaths`、skill 的权限与证据口径。
- 引擎侧：`packages/qa-mcp/scripts/smoke.mjs` 以 stdio 客户端拉起服务，覆盖 tools/list、只读工具与 `ui.run`（真实浏览器 + 模型，手动运行）。
- 真实联调：ZCode 启用插件，不启动 Nebula 桌面端，跑一条浏览器任务并从 `ui.get_run` 读断言证据。

## 风险与待验证

- Playwright Chromium 需要本机已安装（约 400MB）；缺失时执行报错，不自动下载。后续可改用系统 Chrome channel。
- 插件产物约 33MB（bundle 16MB + playwright 17MB）；后续可裁剪未使用的 AI provider chunk 或改为共享宿主 Node 模块。
- MCP sampling 在新版协议里被标记为 deprecated（ZCode 当前仍保留 handler 表面）；插件已固定 legacy。若未来宿主移除 sampling，需要改走宿主导出的模型网关工具或把执行腿技能化。
- **当前阻塞**：sampling handler 已被调用并带回 trace，但宿主 `sampleModel` 的模型调用不返回（无 model_usage、无错误日志），执行停在 running。下一步先用一个最小 MCP App sampling 用例确认 `record.app.sampleModel` 在“agent turn 正在进行”时能否完成；若不能，需要把执行腿改成 ZCode 技能（agent 自己跑 ReAct），或给 sampling 单独的模型通道。**在解决前，ui.run 只能以独立模型配置运行，不能算“走 ZCode 统一模型”。**
- 采样请求必须能归属到当前工具调用 trace（sessionId）；服务在空闲时发起采样会被明确拒绝，不会偷用默认会话。
- 图片只支持 png/jpeg/webp；执行引擎的截图是 png，字体/坐标归一化仍按通用 0-1000 约定（除非设置 `NEBULA_LLM_MODEL_FAMILY`）。
- token 用量记入当前会话的 model_usage（querySource=mcp_app_sampling），与聊天共用同一套计费/观测。
- 引擎包仍在 Nebula 仓库；第二阶段迁入 ZCode monorepo 并删除桌面端，才算“彻底摒弃”。
- 动态导入的外部依赖（LanceDB、非 browser 设备驱动）未随包提供；当前通过 `NEBULA_EXPERIENCE=off`、`NEBULA_DEVICE_PROVIDERS=browser` 保证不加载。若开启相关能力，需补依赖或明确报错。

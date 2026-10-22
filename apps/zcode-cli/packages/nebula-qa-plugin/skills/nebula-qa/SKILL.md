---
name: nebula-qa
description: 通过 ZCode 内置的 Nebula QA MCP 服务设计、执行与分诊测试。当用户要求“设计/补充测试用例”“在浏览器上验证”“跑一条 UI 用例”“看看这次运行为什么失败/帮我分诊”“查一下用例库”时使用。
---

# Nebula QA

Nebula QA 以本插件自带的 stdio MCP 服务运行，**不需要启动 Nebula 桌面端、不需要填 URL 或令牌**。设计判断由你（ZCode 模型）完成；`ui.run` 的感知/推理也使用 **ZCode 当前会话模型**（多模态，走 MCP sampling），插件里不需要再配模型 Key。MCP 只提供确定性的 diff、校验、入库、执行与证据读取能力。

## 工具名

ZCode 把本插件的工具暴露为 `mcp__plugin_nebula-qa_nebula__<原始工具名>`（例如 `mcp__plugin_nebula-qa_nebula__ui_run`）。下文用原始工具名指代；实际调用以工具列表里的名称为准。完整清单见 `references/tools.md`。

## 接入检查

- 工具列表里没有 Nebula 工具：检查 ZCode 设置 › 插件 › Nebula QA 是否启用。**不要**再去找 Nebula 桌面端或填 token。
- 只调用工具列表里出现的工具。缺少能力时如实说明，不要用别的工具凑结果。
- 执行 UI 前先看 `project.active` 与 `device.list`；没有项目或没有在线浏览器就如实说，不要换一个端蒙过去。

## 权限闸门

- 写操作（`case.prepare`、`case.save`、`ui.run`、`ui.stop`、`api.run`、`triage.run`）会弹 ZCode 的权限确认。确认由用户做；被拒绝就停手并说明，不要换参数重试或绕开。
- 本服务不产生“去 Nebula 窗口批准”的审批请求。看到这类说法一律视为过时信息。

## 设计用例：`case.prepare` → 设计 → `case.validate` → `case.save`

1. `case.prepare`：传 `requirement`（自包含：测什么对象、哪些场景、期望什么结果）；`repoPath` 缺省用当前 ZCode 项目目录；`uiPlatform` 对网站传 `browser`；用户点名某次提交时传 `commitId`。
2. 返回里有 `requestId`、`changedFiles`、`diff`、`decision.caseTypes`、`factsVersion`。用 ZCode 的文件工具读取 `changedFiles`（不要只看 diff，事实措辞要从代码里来）。
3. 按需整理 facts（可选但推荐）：
   - UI：`pageFacts = { factsVersion, repo, commitId, pages:[{ pageId, route?, elements:[{ targetId, description, kind? }], transitions:[] }], gaps:[] }`。
   - 每条用例的 `knowledgeRef = { factsVersion, applicationId, pageIds, targetIds }`，只能引用 facts 里的 id。
   - 不整理 facts 时按降级模式设计：**不要填 knowledgeRef**，`generatedBy.mode` 传 `degraded`。
4. 产出用例数组（UI 形状）：
   `{ caseId, name, priority, designMethod, task, precondition?, assertions:[{ description }], knowledgeRef? }`
   - `task` 是环境无关的自然语言操作目标；
   - `assertions` 必须可机器判定：文本出现/消失、元素状态、页面跳转；禁止“美观/流畅/体验好”；
   - 禁止在 task/断言里硬编码 URL、包名、selector/locator/账号密码；
   - `designMethod` 取 `equivalence` / `boundary` / `decision_table` / `state_transition` / `error_guessing`。
5. `case.validate`：传 `uiCases`、可选 `facts`、`generatedBy`（有 facts 时 `{ mode:"diff_impact", commitId: factsVersion }`）、`uiPlatform`。返回 `valid` / `excluded` / `counts`；被拒的按原因修正后重试。
6. `case.save`：传同一个 `requestId`、`uiCases`、`facts`、`generatedBy`、`uiPlatform`。返回入库的 `caseId` 与质量统计。
7. 汇报时分开说“生成 / 被拒 / 不可判定”；`excluded` 是人工评审项，不是失败。0 条要分清“影响面无可测改动”（`testable:false`）和“全被校验拒绝”。

## 执行 UI：`ui.run`

1. `project.active` 确认项目目录；`device.list` 确认 `browser-default` 在线。
2. `ui.run` 传 `task`：写清操作步骤 + 要验证的文案/状态。`provider` 默认 `browser`；`deviceId` 用 `device.list` 的值。执行引擎通过 MCP sampling 使用当前 ZCode 会话模型；如果宿主不支持采样或当前模型不支持图片，会明确报错，不要改用别的模型蒙混。
3. `ui.run` 默认只表示**已启动**，立刻返回 `executionId`（`waitMs>0` 才会等终态）。等待期间不要重复派发同一任务。
4. 用 `ui.get_run`（参数 `executionId`）轮询到 `success` / `failed` / `stopped`；工具调用超时不等于执行失败，先查 `ui.get_run`。
   - 每条形如 `{ subtaskIndex, step, passed, content, thought }`；`passed` 才是断言判定。
   - `execution.success=true` 只说明执行链路跑完，**不能替代断言证据**；两者不一致时以 `assertions` 为准并如实说明。
   - `artifacts` 里有截图、trace、报告的绝对路径；需要时引用路径，不要编造内容。

## 执行 API：`api.run`

需要 `caseIds`（用 `testcase.list` 拿）和 `envId`。当前构建没有环境管理工具；用户没给 `envId` 时如实说明无法执行 API 用例，不要猜一个环境。

`api.run` 返回 `runId`，用 `api.list_runs` 轮询终态。`completed:false` 表示等待窗口用完、仍在跑，不要说“已完成”。

## 分诊：`triage.run`

需要 `runId`：UI 用 `executionId`，API 用 `api.run` 返回的 `runId`。没指名就用 `ui.list_runs` / `api.list_runs` 挑失败条数最多的那次，并说清分诊的是哪一次（时间与任务，不要只抄 id）。

结论以工具返回的类别为准，说人话；分诊是建议，不是已执行修复。查历史用 `triage.list`。

## ID 纪律

所有 id 都从工具返回里取，不要凭记忆或猜测：

- 设备：`device.list`
- 执行：`ui.run` 返回的 `executionId` / `ui.list_runs`
- 用例：`testcase.list` / `testcase.get`
- 设计：`case.prepare` 返回的 `requestId` / `case.list` / `case.get`
- 运行：`api.list_runs`
- 分诊：`triage.list`

缺 ID 时先问用户或先查，不要挑一个“看起来像”的提交。

## 结果怎么说

- UI 与 API 分开报数；没有跑完就说没跑完，不要把“已启动”说成“已通过”。
- 报告断言时引用 `assertions[].passed` 与 `thought` 里的实际文案；不要只报 `success`。
- 一次只推进一个场景；需要扩大范围时先问用户。

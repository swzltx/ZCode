# Nebula QA 工具清单（v0.2.0）

本插件通过本地 stdio MCP 服务暴露以下工具；ZCode 中的完整名称为
`mcp__plugin_nebula-qa_nebula__<下表中的名字>`。服务不监听端口、不需要令牌。

| 工具 | 读/写 | 说明 |
| --- | --- | --- |
| `project.active` | 读 | 返回 ZCode 当前项目目录；`NEBULA_WORKSPACE` 由插件注入。 |
| `device.list` | 读 | 列出已发现设备（当前构建只启用 browser）。 |
| `case.prepare` | 写 | 取仓库 diff、算影响面、落设计请求；返回 `requestId`、`changedFiles`、`diff`、`factsVersion`、`decision`。 |
| `case.validate` | 读 | 校验模型产出的 UI/API 用例（协议 + 可判定性 + knowledgeRef），返回 valid/excluded/counts，不写库。 |
| `case.save` | 写 | 校验并入库用例、写知识快照、把设计请求置 completed。 |
| `case.list` | 读 | 最近的设计请求。 |
| `case.get` | 读 | 按 `requestId` 读请求与结果。 |
| `ui.run` | 写 | 在真实浏览器执行自然语言 UI 任务；默认立即返回 `executionId`（`waitMs>0` 才等终态）。 |
| `ui.get_run` | 读 | 按 `executionId` 读执行状态、报告摘要、逐条断言判定（`assertions[].passed`）与截图/trace/报告路径。 |
| `ui.list_runs` | 读 | 最近的 UI 执行记录。 |
| `ui.stop` | 写 | 停止一条正在运行的 UI 执行。 |
| `testcase.list` | 读 | 分页列出用例库（UI/API）。 |
| `testcase.get` | 读 | 按 `caseId` 查看用例。 |
| `api.run` | 写 | 按 `caseIds` + `envId` 执行 API 用例，返回 `runId`。 |
| `api.list_runs` | 读 | 最近的 API 执行记录。 |
| `triage.run` | 写 | 对指定 `runId` 执行失败分诊。 |
| `triage.list` | 读 | 查看指定 `runId` 的分诊记录。 |

## 环境与数据

- 数据目录：ZCode 插件数据目录（`$ZCODE_PLUGIN_DATA`），与旧 Nebula 数据目录隔离。
- 模型：设计由 ZCode 会话模型完成；`ui.run` 的感知/推理走 **MCP sampling**，同样使用当前会话模型（多模态）。插件没有模型 Key 配置。
- 浏览器：首次使用需要本机有 Playwright Chromium；缺失时执行会明确报错。
- 设计：`case.prepare` 需要当前项目目录是 git 仓库；ZCode 工作区不是仓库时显式传 `repoPath`。
- 宿主：需要支持 MCP sampling 的 ZCode 版本；不支持时 `ui.run` 会明确报“宿主模型采样失败”。

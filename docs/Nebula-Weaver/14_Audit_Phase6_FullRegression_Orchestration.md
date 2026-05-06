# 14 - 深度审计第六轮（全量回归编排与统一报告自动化）

## A. 本阶段目标
- 建立一键全量回归入口，减少人工分步执行成本。
- 汇总多阶段审计结果到统一 JSON 报告，支持横向对比与门禁。
- 将“审计可执行性”升级为“持续回归能力”。

## B. 本阶段审计范围
- 新增脚本：`scripts/audit/run-full-audit.mjs`
- 新增命令：`npm run audit:full`
- 汇总范围：`audit:phase2` + `audit:phase4` + `audit:phase5` + `npm test` + `typecheck` + `build`
- 汇总产物：`audit_full_regression_report.json`

## C. 本阶段使用的验证方式
- 静态阅读：是
- 本地启动：是（由子脚本执行）
- 构建验证：是
- 日志验证：是
- 单测/集成测试：是
- 手动构造输入验证：由 phase2/4/5 子脚本覆盖
- 其他工具验证：Node child_process 编排执行

## D. 已确认事实
- [事实] `package.json` 已新增 `audit:full`。
- [事实] `run-full-audit.mjs` 可串行执行 6 个步骤并统计耗时/结果。
- [事实] `npm run audit:full` 执行成功：6/6 步骤通过，`allPassed=true`。
- [事实] 统一报告已写入：`../docs/Nebula-Weaver/audit_full_regression_report.json`。
- [事实] 报告内已内联 phase2/4/5 最新 artifact，便于一次读取全局状态。

## E. 关键审计发现（按严重程度排序）
1. [事实] 回归门禁链已可自动化执行并稳定通过。
2. [事实] 当前阶段未发现新增功能级高危缺陷。
3. [推断] 下一步应加强“失败定位信息密度”（目前 full 报告记录步骤状态与耗时，详细日志可进一步结构化）。

## F. 逐项问题详解
### R-PIPELINE-01
- 编号：R-PIPELINE-01
- 标题：全量回归编排已建立
- 分类：测试 / 维护性
- 严重程度：Info
- 证据：
  - `package.json` `audit:full`
  - `scripts/audit/run-full-audit.mjs`
  - `audit_full_regression_report.json.summary.allPassed=true`
- 影响：后续修复后可一键复跑，降低漏测概率。
- 触发条件：执行 `npm run audit:full`。
- 修复建议：无。
- 回归建议：每次关键改动后强制执行 full audit。

### R-PIPELINE-02
- 编号：R-PIPELINE-02
- 标题：统一报告已具备阶段 artifact 聚合能力
- 分类：可观测性 / 维护性
- 严重程度：Info
- 证据：`audit_full_regression_report.json.artifacts.phase2/phase4/phase5`
- 影响：接手者可快速获取“当前质量状态快照”。
- 触发条件：full audit 执行完成。
- 修复建议：后续可增加失败日志摘要字段。
- 回归建议：验证失败场景下报告仍能输出。

## G. 本阶段结论
- [事实] 回归体系从“脚本集合”升级为“一键编排 + 统一报告”。
- [推断] 当前已具备持续执行深度审计的工程基础，后续重点是覆盖深度与失败可观测性增强。

## H. 必须立即处理的问题
1. [事实] 无新增必须立即处理问题。

## I. 近期建议处理的问题
1. full audit 失败时输出每步骤的关键错误摘要（stdout/stderr 片段）。
2. 增加“压力级别参数化”（如 Model cycles 可配置）。
3. 将 full audit 集成到团队日常提交流程（若后续引入 CI）。

## J. 可延后处理的问题
1. 报告可视化（dashboard）
2. 历史趋势追踪（多次运行对比）

## K. 本阶段摘要包（紧凑版）
【阶段摘要包】
阶段名称：深度审计第六轮（全量回归编排与统一报告自动化）
已审计范围：full audit 编排脚本、统一 JSON 报告、全链回归执行
未审计范围：失败日志细粒度结构化、历史趋势系统

一、确认事实
- `audit:full` 已可用
- 6 步骤回归全通过
- 报告已聚合 phase2/4/5 结果

二、关键问题
- 无新增高危问题
- 下一步是提升失败可定位性

三、最严重风险
- 当未来出现失败时，定位效率仍可提升（日志摘要不足）

四、已验证运行情况
- `npm run audit:full` 通过，`allPassed=true`

五、待验证项
- 人为制造失败后，报告是否足够定位问题

六、下一阶段建议优先分析目标
- 失败注入演练 + 报告增强

七、紧凑继承上下文
- 目前已实现从修复到回归编排的闭环；进入“失败定位效率优化”阶段。

## L. 下一阶段启动提示词
你现在进入“深度审计第七轮：失败注入演练与报告可定位性增强”。
目标：
1) 设计可控失败注入场景（例如禁用 key、强制某模块报错）；
2) 验证 `audit:full` 在失败时的可定位性；
3) 增强统一报告的失败摘要字段（最小必要信息）。
建议优先读取：
- `scripts/audit/run-full-audit.mjs`
- `../docs/Nebula-Weaver/audit_full_regression_report.json`
- phase2/4/5 审计脚本
期望输出格式：继续沿用 A-L。

# 16 - 深度审计第八轮（失败注入演练与业务边界回归增强）

## A. 本阶段目标
- 建立可控失败注入能力，验证回归门禁在失败场景下的可信性。
- 补充高价值业务边界测试，降低命名与导出链路回归风险。
- 保持“每问题修复后回归、阶段完成后冒烟、最终全量回归”的执行闭环。

## B. 本阶段审计范围
- 业务边界修复与测试：
  - `services/videoExportNaming.ts`
  - `services/compressorNaming.ts`
  - `App.tsx`
  - `components/PhotoCompressorTool.tsx`
  - `tests/videoExportNaming.spec.ts`
  - `tests/compressorNaming.spec.ts`
- 失败注入与门禁修复：
  - `scripts/audit/phase2-critical-repro.mjs`
  - `scripts/audit/phase4-module-deep-checks.mjs`
  - `scripts/audit/phase5-stability-stress.mjs`
  - `scripts/audit/run-full-audit.mjs`
  - `scripts/audit/phase8-failure-injection.mjs`
  - `package.json`

## C. 本阶段使用的验证方式
- 静态阅读：是
- 本地启动：是（phase2/4/5）
- 构建验证：是（`audit:full`）
- 日志验证：是
- 单测/集成测试：是
- 手动构造输入验证：是（注入环境变量）
- 其他工具验证：Playwright + Vitest + child_process 编排

## D. 已确认事实
- [事实] 新增 `videoExportNaming` 抽象，Nebula 导出文件名逻辑从页面组件抽离。
- [事实] 新增 `compressorNaming` 抽象，压缩导出文件名规则集中化，避免组件内分支散落。
- [事实] 新增 2 组业务边界测试：`videoExportNaming.spec.ts`、`compressorNaming.spec.ts`。
- [事实] phase2/4/5 已支持失败注入开关（`AUDIT_FORCE_FAIL_STEP` 等）。
- [事实] 新增 `audit:phase8`（失败注入验证脚本）并可自动恢复基线。
- [事实] 修复 `audit:full` 退出码缺陷：当任一步骤失败时返回非零退出码。

## E. 关键审计发现（按严重程度排序）
1. [事实] Critical：`audit:full` 曾存在“失败却返回 0”的缺陷，已修复。
2. [事实] High：失败注入三场景验证通过，门禁链路在故障场景下可正确拦截。
3. [事实] Medium：导出命名与压缩命名边界规则已形成可测试的稳定抽象。

## F. 逐项问题详解
### FIX-08-01
- 编号：FIX-08-01
- 标题：`audit:full` 子步骤失败但进程退出码为 0
- 分类：测试基础设施 / 可观测性
- 严重程度：Critical
- 证据：`scripts/audit/run-full-audit.mjs`
- 影响：CI/本地门禁可能误判“通过”。
- 触发条件：phase2/4/5 任一失败但 `audit:full` 未显式 exit 1。
- 修复建议：已修复（`!allPassed` 时 `process.exitCode = 1`）。
- 回归建议：`npm run audit:phase8` 第三场景验证。

### FIX-08-02
- 编号：FIX-08-02
- 标题：缺少可控失败注入能力，无法系统验证门禁
- 分类：测试基础设施
- 严重程度：High
- 证据：`phase2/4/5` 注入开关 + `phase8-failure-injection.mjs`
- 影响：历史上只能靠偶发失败验证门禁，覆盖不稳定。
- 触发条件：需要验证失败传播链路时。
- 修复建议：已修复（3 个可控失败场景 + 自动恢复基线）。
- 回归建议：`npm run audit:phase8`。

### FIX-08-03
- 编号：FIX-08-03
- 标题：导出命名规则散落在组件内，边界行为不易验证
- 分类：业务逻辑 / 维护性
- 严重程度：Medium
- 证据：`services/videoExportNaming.ts`、`tests/videoExportNaming.spec.ts`
- 影响：MIME 分支与文件名清洗逻辑回归风险较高。
- 触发条件：新增导出格式或修改下载链路时。
- 修复建议：已修复（统一命名服务 + 单测覆盖）。
- 回归建议：`npx vitest run tests/videoExportNaming.spec.ts`。

### FIX-08-04
- 编号：FIX-08-04
- 标题：压缩结果文件名规则分散，特殊格式兼容边界不透明
- 分类：业务逻辑 / 维护性
- 严重程度：Medium
- 证据：`services/compressorNaming.ts`、`tests/compressorNaming.spec.ts`
- 影响：`original` 模式在 HEIC->JPEG 等路径易回归。
- 触发条件：变更压缩输出格式或下载命名时。
- 修复建议：已修复（统一命名决策函数）。
- 回归建议：`npx vitest run tests/compressorNaming.spec.ts` + `npm run audit:phase5`。

## G. 本阶段结论
- [事实] 已完成失败注入、门禁修复、业务边界补测三项核心目标。
- [事实] 当前门禁在“成功/失败”两类场景下均能给出一致、可依赖的结果。
- [推断] 下一步可将注入场景扩展到“业务语义级失败”（而非仅门禁链路失败）。

## H. 必须立即处理的问题
1. [事实] 无新增必须立即处理项。

## I. 近期建议处理的问题
1. [待验证] 为 phase8 增加“期望失败日志关键字”断言，进一步提升定位性。
2. [待验证] 增加针对 Model Studio 环境切换的视觉断言（截图或参数快照）。

## J. 可延后处理的问题
1. [推断] 可将注入场景扩展为可配置矩阵（step x failure-type）。
2. [推断] 后续若引入 CI，可将 `audit:phase8` 作为定期健康检查而非每次提交阻塞项。

## K. 本阶段摘要包（紧凑版）
【阶段摘要包】
阶段名称：深度审计第八轮（失败注入演练与业务边界回归增强）
已审计范围：失败注入门禁、导出命名边界、压缩命名边界
未审计范围：语义级业务失败注入、视觉快照断言

一、确认事实
- `audit:full` 退出码缺陷已修复。
- 3 个失败注入场景全部验证通过。
- 新增 2 组业务边界单测并通过。

二、关键问题
- 旧门禁假阳性已闭环。
- 命名逻辑已从组件抽离为可测试服务。

三、最严重风险
- 当前剩余风险主要是“失败定位深度”而非“门禁可靠性”。

四、已验证运行情况
- `npm run audit:phase8`：通过（3/3 注入场景通过 + 基线恢复通过）。
- `npm run audit:phase5`：通过。
- `npm test`：8 files / 18 tests 通过。
- `npm run audit:full`：6/6 步骤通过。

五、待验证项
- 失败摘要对复杂故障的定位充分性。

六、下一阶段建议优先分析目标
- 语义级失败注入 + 高风险业务分支补测。

七、紧凑继承上下文
- 门禁可信性问题已解决；当前进入“业务语义正确性深测”更具收益。

## L. 下一阶段启动提示词
你现在进入“深度审计第九轮：语义级失败注入与业务边界补测扩展”。
目标：
1) 围绕 Nebula 导出、PhotoCompressor 压缩参数、ModelStudio 图层操作设计语义级失败注入；
2) 每个语义失败注入至少给出 1 条自动化断言；
3) 补齐 3~5 条高价值业务边界回归测试并接入现有回归链路。
建议优先读取：
- `services/videoExportNaming.ts`
- `services/compressorNaming.ts`
- `scripts/audit/phase8-failure-injection.mjs`
- `scripts/audit/run-full-audit.mjs`
- `docs/Nebula-Weaver/audit_phase8_failure_injection.json`
期望输出格式：继续沿用 A-L。

# 15 - 深度审计第七轮（分阶段缺陷修复与回归门禁强化）

## A. 本阶段目标
- 基于既有审计报告继续“分阶段修复 -> 问题级回归 -> 阶段冒烟 -> 全量回归”。
- 关闭运行稳定性与配置漂移类缺陷，提升接手可维护性。
- 修复审计门禁脚本的假阳性问题，保证回归结果可作为真实质量门禁。

## B. 本阶段审计范围
- 运行稳定性：
  - `components/ModelViewer3D.tsx`
  - `components/ModelStudioTool.tsx`
  - `services/rafLoop.ts`
  - `services/modelStudioState.ts`
- 配置/接口漂移：
  - `App.tsx`
  - `components/NebulaCanvas.tsx`
  - `components/ModelStudioTool.tsx`
  - `components/ModelViewer3D.tsx`
  - `services/viewerEnvironment.ts`
  - `types.ts`
  - `components/PhotoCompressorTool.tsx`
- 回归门禁：
  - `scripts/audit/phase2-critical-repro.mjs`
  - `scripts/audit/phase4-module-deep-checks.mjs`
  - `scripts/audit/phase5-stability-stress.mjs`
  - `scripts/audit/run-full-audit.mjs`
  - `index.html`

## C. 本阶段使用的验证方式
- 静态阅读：是
- 本地启动：是（通过 phase2/4/5 脚本）
- 构建验证：是（`audit:full` 内含 build）
- 日志验证：是
- 单测/集成测试：是
- 手动构造输入验证：是（Playwright 自动化输入）
- 其他工具验证：Vitest + Playwright + Vite server

## D. 已确认事实
- [事实] 已新增 `services/rafLoop.ts`，`ModelViewer3D` 改为可停止的 RAF 循环，卸载时调用 `stop()` + `controls.dispose()`。
- [事实] 已新增 `services/modelStudioState.ts`，删除图层时使用 `getNextActiveIndexAfterDelete` 计算下一个激活索引。
- [事实] Nebula 侧已移除死接口：`previewTrigger`、`onImageReady`。
- [事实] Model Studio 的 `environment` 配置已接入真实渲染（背景/灯光），并补充 UI 控制项（Environment + Exposure）。
- [事实] 压缩器设置已移除未实现字段：`preserveMetadata`、`maintainAspectRatio`。
- [事实] phase2/4/5 脚本已新增 `summary.allChecksPassed`，且在检查失败时返回非零退出码。
- [事实] `audit:full` 已支持失败摘要片段（`failure.primaryMessage/stdoutTail/stderrTail`）。
- [事实] `index.html` 已对 Tailwind 全局变量加保护，避免 CDN 超时时触发 `tailwind is not defined`。

## E. 关键审计发现（按严重程度排序）
1. [事实] Critical：原回归门禁存在“假阳性”风险（子检查失败但总报告仍 allPassed），现已修复为严格退出码门禁。
2. [事实] High：3D 视图 RAF 循环原先缺少显式停止路径，长期运行有泄漏风险，现已修复并回归通过。
3. [事实] Medium：Model Studio 删除图层后激活索引计算原逻辑易错，已提炼纯函数并覆盖关键分支测试。
4. [事实] Medium：配置/接口漂移导致“有声明无实现”误导，已完成清理与落地。

## F. 逐项问题详解
### FIX-07-01
- 编号：FIX-07-01
- 标题：ModelViewer3D 渲染循环缺少可控停止路径
- 分类：性能 / 维护性
- 严重程度：High
- 证据：`components/ModelViewer3D.tsx` + `services/rafLoop.ts`
- 影响：页面切换或组件卸载后，潜在持续占用 RAF 与控制器监听。
- 触发条件：频繁进入/离开 Model Studio。
- 修复建议：已修复（引入 `createRafLoop` 并在 cleanup 中 `stop()`）。
- 回归建议：`npx vitest run tests/rafLoop.spec.ts`；`npm run audit:phase4`。

### FIX-07-02
- 编号：FIX-07-02
- 标题：删除图层后的激活索引可能错位
- 分类：业务状态 / 维护性
- 严重程度：High
- 证据：`components/ModelStudioTool.tsx` + `services/modelStudioState.ts`
- 影响：删除当前层或前置层后，后续编辑可能作用于错误目标层。
- 触发条件：多图层切换后删除任意层。
- 修复建议：已修复（纯函数统一索引迁移规则）。
- 回归建议：`npx vitest run tests/modelStudioState.spec.ts`；`npm run audit:phase5`。

### FIX-07-03
- 编号：FIX-07-03
- 标题：Nebula 组件存在死接口（预览触发/图片握手）
- 分类：架构 / 维护性
- 严重程度：Medium
- 证据：`App.tsx`、`components/NebulaCanvas.tsx`
- 影响：增加阅读噪声，误导后续扩展点判断。
- 触发条件：接手者尝试沿死接口扩展。
- 修复建议：已修复（删除无效 props，重置逻辑改为依赖 `imageBase64`）。
- 回归建议：`npm run audit:phase2`。

### FIX-07-04
- 编号：FIX-07-04
- 标题：Model Studio 环境配置声明与实现不一致
- 分类：架构 / 业务表现
- 严重程度：Medium
- 证据：`services/viewerEnvironment.ts`、`components/ModelViewer3D.tsx`、`components/ModelStudioTool.tsx`
- 影响：配置项此前无效，调试与视觉结果不可控。
- 触发条件：期望切换环境光或暴光时。
- 修复建议：已修复（环境配置驱动背景与灯光，UI 可调）。
- 回归建议：`npx vitest run tests/viewerEnvironment.spec.ts`；`npm run audit:phase4`。

### FIX-07-05
- 编号：FIX-07-05
- 标题：压缩器设置存在未实现字段
- 分类：业务配置 / 维护性
- 严重程度：Medium
- 证据：`types.ts`、`components/PhotoCompressorTool.tsx`
- 影响：文档与代码语义不一致，增加二次开发误判风险。
- 触发条件：按字段语义尝试扩展元数据/比例处理。
- 修复建议：已修复（移除无效字段）。
- 回归建议：`npx vitest run tests/compressorService.spec.ts`；`npm run audit:phase5`。

### FIX-07-06
- 编号：FIX-07-06
- 标题：审计门禁脚本不以检查结果驱动退出码
- 分类：测试基础设施 / 可观测性
- 严重程度：Critical
- 证据：`scripts/audit/phase2-critical-repro.mjs`、`phase4-module-deep-checks.mjs`、`phase5-stability-stress.mjs`、`run-full-audit.mjs`
- 影响：可能出现“子项失败但总门禁通过”的错误放行。
- 触发条件：Playwright 子检查局部失败但脚本未抛异常。
- 修复建议：已修复（增加 `summary.allChecksPassed` 与 `process.exitCode=1`，`audit:full` 增加失败摘要）。
- 回归建议：`npm run audit:phase2`、`npm run audit:phase4`、`npm run audit:phase5`、`npm run audit:full`。

## G. 本阶段结论
- [事实] 本轮完成多阶段缺陷修复闭环，并满足“问题级回归 + 阶段冒烟 + 全量回归”。
- [事实] 当前主质量门禁链路可稳定识别真实失败，不再依赖“只看命令执行成功”。
- [推断] 后续重点应从“门禁正确性”转向“覆盖深度扩展”（尤其失败注入与边界业务语义）。

## H. 必须立即处理的问题
1. [事实] 无新增必须立即处理问题。

## I. 近期建议处理的问题
1. [待验证] 增加失败注入样例（故意制造 phase 子检查失败），验证 `audit:full` 失败摘要质量。
2. [待验证] 为 Model Studio 环境切换增加 e2e 断言（例如背景色/光照参数快照）。

## J. 可延后处理的问题
1. [推断] `services/exportService.ts` 目前仍未接入主流程，可在后续需求明确后决定接入或归档。
2. [推断] 进一步减少外网依赖（字体/CDN）可提升离线稳定性，但非当前阻塞。

## K. 本阶段摘要包（紧凑版）
【阶段摘要包】
阶段名称：深度审计第七轮（分阶段缺陷修复与回归门禁强化）
已审计范围：运行稳定性、配置漂移、审计门禁脚本
未审计范围：失败注入覆盖、长期趋势看板

一、确认事实
- RAF 释放、删除索引、配置漂移已修复并有回归测试。
- phase2/4/5 已改为检查失败返回非零退出。
- `audit:full` 可输出失败摘要并汇总最新 artifact。

二、关键问题
- 关键门禁假阳性问题已关闭。
- 主要剩余工作是覆盖深度扩展。

三、最严重风险
- 当前更偏“覆盖深度不足”，非“门禁失真”。

四、已验证运行情况
- `npm test`：6 files / 13 tests 通过。
- `npm run audit:phase2`：通过。
- `npm run audit:phase4`：通过。
- `npm run audit:phase5`：通过。
- `npm run audit:full`：6/6 步骤通过。

五、待验证项
- 失败注入下的摘要可定位性仍需专项演练。

六、下一阶段建议优先分析目标
- 失败注入演练 + 关键业务边界场景补测。

七、紧凑继承上下文
- 目前系统已具备可信门禁与分阶段回归能力，可进入“失败场景可信性”与“业务语义覆盖”强化阶段。

## L. 下一阶段启动提示词
你现在进入“深度审计第八轮：失败注入与业务边界回归增强”。
目标：
1) 为 phase2/4/5 设计至少 3 个可控失败注入场景；
2) 验证 `audit:full` 在失败时摘要信息是否足以定位；
3) 补充 2~3 条高价值业务边界回归（非 UI 样式类）。
建议优先读取：
- `scripts/audit/run-full-audit.mjs`
- `scripts/audit/phase2-critical-repro.mjs`
- `scripts/audit/phase4-module-deep-checks.mjs`
- `scripts/audit/phase5-stability-stress.mjs`
- `docs/Nebula-Weaver/audit_full_regression_report.json`
期望输出格式：继续沿用 A-L。

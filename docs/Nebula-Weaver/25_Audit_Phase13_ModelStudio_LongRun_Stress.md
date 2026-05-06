# 25 - 深度审计第十三轮（ModelStudio 高规模层级长期压力与时延门禁）

## A. 本阶段目标
- 将 ModelStudio 审计从“5层快照一致性”扩展到“10层+长期组合操作”。
- 在同一场景内同时验证：结构一致性、父子关系正确性、无环约束、操作时延阈值。
- 保持“问题级回归 -> 阶段冒烟 -> 全量回归”闭环。

## B. 本阶段审计范围
- 审计脚本：`scripts/audit/phase5-stability-stress.mjs`
- 全量编排：`scripts/audit/run-full-audit.mjs`
- 输出工件：
  - `docs/Nebula-Weaver/audit_phase5_stability_stress.json`
  - `docs/Nebula-Weaver/audit_full_regression_report.json`

## C. 本阶段使用的验证方式
- 静态阅读：是
- 本地启动：是（Playwright + Vite 临时服务）
- 构建验证：是（`audit:full` 内置）
- 日志验证：是（JSON artifact）
- 单测/集成测试：是（`audit:full` 内含 `npm test`）
- 手动构造输入验证：否（自动化场景驱动）
- 其他工具验证：Playwright UI 自动操作 + 时延采样

## D. 已确认事实
- [事实] `phase5` 新增 `modelStudioLargeHierarchyLongRun` 检查项，默认目标 12 层、60 次操作。
- [事实] 新增一致性断言：`allParentRefsValid`、`noSelfParent`、`acyclic`。
- [事实] 新增时延门禁：`meanOpMs <= 900` 且 `p95OpMs <= 1800`（支持环境变量覆盖）。
- [事实] `npm run audit:phase5` 通过：`operationsExecuted=60`、`meanOpMs=362.53`、`p95OpMs=605`。
- [事实] `npm run audit:full` 通过：7/7 全绿，phase5 新检查已纳入统一报告。

## E. 关键审计发现（按严重程度排序）
1. [事实] High：10层+长期组合操作下，层级结构保持无环且父引用无悬挂。
2. [事实] Medium：操作时延在当前机器上显著低于门禁阈值（mean/p95 均通过）。
3. [推断] Medium：ModelStudio 回归从“功能可用”升级为“语义一致性 + 性能门禁”的双重保障。

## F. 逐项问题详解
### FIX-13-01
- 编号：FIX-13-01
- 标题：10层+长期操作缺失自动化覆盖
- 分类：测试覆盖 / 稳定性
- 严重程度：High
- 证据：`modelStudioLargeHierarchyLongRun` 已写入 phase5，并在 artifact 中输出一致性与时延指标。
- 影响：此前复杂场景容易在回归中漏检。
- 触发条件：多轮重排/绑定/删除/新增组合操作。
- 修复建议：已修复（新增长期压力场景 + 门禁断言）。
- 回归建议：`npm run audit:phase5`，检查 `modelStudioLargeHierarchyLongRun.ok=true`。

### FIX-13-02
- 编号：FIX-13-02
- 标题：长期操作缺少性能阈值约束
- 分类：性能 / 可维护性
- 严重程度：Medium
- 证据：新增 `meanOpMs`、`p95OpMs`、`latencyWithinThreshold`。
- 影响：过去只能看是否“能跑完”，无法判定是否出现明显退化。
- 触发条件：层级规模扩大或后续重构引入慢路径。
- 修复建议：已修复（默认阈值 + 环境变量可调）。
- 回归建议：在低性能机器上用环境变量调整阈值并记录基线。

## G. 本阶段结论
- [事实] 高规模层级长期操作已进入自动审计矩阵，且当前结果通过。
- [事实] 全量回归仍保持全绿，未引入新增功能回归。
- [推断] 下一阶段可转向“真实复杂模型素材”的性能与内存专项基准。

## H. 必须立即处理的问题
1. [事实] 无新增必须立即处理项。

## I. 近期建议处理的问题
1. [待验证] 增加“真实 glb/fbx 多网格模型”长期操作基准（当前以 primitive 为主）。
2. [待验证] 增加内存曲线门禁（heap delta 上限）。

## J. 可延后处理的问题
1. [推断] 将 phase5 内部模型操作场景模块化拆分，提高脚本可维护性。

## K. 本阶段摘要包（紧凑版）
【阶段摘要包】
阶段名称：深度审计第十三轮（ModelStudio 高规模层级长期压力与时延门禁）
已审计范围：phase5 长期压力场景（12层/60操作）、一致性断言、时延门禁、full audit 复验
未审计范围：真实复杂模型素材长时压测、内存门禁

一、确认事实
- phase5 新增 `modelStudioLargeHierarchyLongRun`。
- 一致性断言（父引用有效/无自指/无环）全部通过。
- 时延门禁通过（mean/p95 低于阈值）。
- `audit:full` 7/7 通过。

二、关键问题
- 历史缺口“10层+长期组合场景缺失”已补齐。

三、最严重风险
- 当前仍缺真实复杂模型素材的性能/内存证据。

四、已验证运行情况
- `npm run audit:phase5`：通过
- `npm run audit:full`：通过（7/7）

五、待验证项
- 真实模型素材下的长时性能与内存稳定性。

六、下一阶段建议优先分析目标
- Nebula 与 ModelStudio 的“真实素材回放基准 + 内存门禁”专项。

七、紧凑继承上下文
- 回归体系已具备功能、语义一致性、性能基础门禁三层保障；后续重点转向素材级真实性能证据。

## L. 下一阶段启动提示词
你现在进入“深度审计第十四轮：真实素材基准与内存门禁”。
目标：
1) 引入真实 glb/fbx 与高像素图片样本，做长期回放与导出基准；
2) 增加内存采样与阈值门禁（heap delta）；
3) 完成问题级回归、阶段冒烟、全量回归闭环。
建议优先读取：
- `scripts/audit/phase5-stability-stress.mjs`
- `scripts/audit/phase9-star-detection-perf.mjs`
- `docs/Nebula-Weaver/audit_phase5_stability_stress.json`
- `docs/Nebula-Weaver/audit_phase9_star_detection_perf.json`
期望输出格式：继续沿用 A-L。

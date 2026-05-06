# 20 - 深度审计第十二轮（ModelStudio 大规模组合场景与结构快照断言）

## A. 本阶段目标
- 将 ModelStudio 回归从小规模交互扩展到 >=5 层组合场景。
- 引入结构快照断言，验证层序、父子关系、删除后一致性。
- 继续执行问题级回归、阶段冒烟、全量回归闭环。

## B. 本阶段审计范围
- 重排/活动层语义基础：
  - `services/modelLayerOrdering.ts`
  - `components/ModelStudioTool.tsx`
  - `tests/modelLayerOrdering.spec.ts`
- 大规模组合场景：
  - `scripts/audit/phase5-stability-stress.mjs`
- 关联复验：
  - `tests/modelHierarchy.spec.ts`
  - `scripts/audit/phase4-module-deep-checks.mjs`
  - `scripts/audit/run-full-audit.mjs`

## C. 本阶段使用的验证方式
- 静态阅读：是
- 本地启动：是（phase5/phase4）
- 构建验证：是（`audit:full`）
- 日志验证：是
- 单测/集成测试：是
- 手动构造输入验证：否（自动化回归覆盖）
- 其他工具验证：Playwright 结构快照采集与断言

## D. 已确认事实
- [事实] ModelStudio 图层行新增 `data-layer-id`，为结构化快照提供稳定锚点。
- [事实] phase5 新增 `modelStudioLargeHierarchySnapshot` 场景，覆盖：
  - 初始化 5 层；
  - 链式父子绑定；
  - 重排操作；
  - 删除中间父层；
  - 删除后悬挂引用清理校验。
- [事实] phase5 新增场景输出以下结构字段：
  - `initialLayerCount`、`chainCreated`、`reorderApplied`、`deleteApplied`、`danglingCleared`、`snapshotConsistent`。

## E. 关键审计发现（按严重程度排序）
1. [事实] High：复杂组合场景下，层级结构在绑定/重排/删除链路中保持一致。
2. [事实] Medium：结构快照断言已显著提升“状态语义回归”可观测性。

## F. 逐项问题详解
### FIX-12-01
- 编号：FIX-12-01
- 标题：大规模层级组合场景覆盖不足
- 分类：测试覆盖 / 语义一致性
- 严重程度：High
- 证据：`phase5` 新增 `modelStudioLargeHierarchySnapshot`
- 影响：此前复杂层级操作的回归风险难以提前发现。
- 触发条件：多层绑定 + 重排 + 删除组合操作。
- 修复建议：已修复（新增结构快照断言链路）。
- 回归建议：`npm run audit:phase5`，关注 `snapshotConsistent=true`。

### FIX-12-02
- 编号：FIX-12-02
- 标题：活动层稳定性断言需与大规模场景联动
- 分类：状态管理
- 严重程度：Medium
- 证据：`modelStudioReorderActiveStability` + `modelStudioLargeHierarchySnapshot`
- 影响：若仅单场景验证，复杂路径仍有漏检风险。
- 触发条件：多层结构下重排非活动层。
- 修复建议：已修复（phase5 同时保留两类断言）。
- 回归建议：phase5 两检查均为 `ok=true`。

## G. 本阶段结论
- [事实] ModelStudio 回归矩阵已扩展到大规模组合链路。
- [事实] 本轮新增结构快照断言全部通过，未发现新增行为回归。
- [推断] 现阶段可将重点转向“性能维度与复杂层级长时间操作”。

## H. 必须立即处理的问题
1. [事实] 无新增必须立即处理项。

## I. 近期建议处理的问题
1. [待验证] 增加“10 层+连续操作”压力场景，关注交互延迟与状态一致性。
2. [待验证] 对层级快照断言加入更多字段（可见性、变换参数）。

## J. 可延后处理的问题
1. [推断] 将 phase5 的模型操作脚本进一步模块化，提升维护性与复用性。

## K. 本阶段摘要包（紧凑版）
【阶段摘要包】
阶段名称：深度审计第十二轮（ModelStudio 大规模组合场景与结构快照断言）
已审计范围：>=5 层组合场景、层级快照断言、活动层稳定性联动验证
未审计范围：超大规模（10+层）长时操作性能

一、确认事实
- `modelStudioLargeHierarchySnapshot` 已接入 phase5 并通过。
- 关键结构字段均满足预期：chain/reorder/delete/dangling 全部 true。
- 全量回归继续全绿。

二、关键问题
- 复杂组合场景覆盖短板已补齐。

三、最严重风险
- 剩余风险集中在超大规模操作的性能与长期一致性。

四、已验证运行情况
- `npx tsc --noEmit` 通过。
- `npx vitest run tests/modelLayerOrdering.spec.ts tests/modelHierarchy.spec.ts` 通过。
- `npm run audit:phase5` 通过（含 large hierarchy snapshot）。
- `npm run audit:phase4` 通过。
- `npm test` 通过（11 files / 26 tests）。
- `npm run audit:full` 通过（6/6）。

五、待验证项
- 10 层+场景下的操作稳定性与性能曲线。

六、下一阶段建议优先分析目标
- 大规模层级压力与长期交互一致性测试。

七、紧凑继承上下文
- 语义正确性回归矩阵已覆盖中等复杂度组合场景；下一步建议聚焦高规模压力与性能。

## L. 下一阶段启动提示词
你现在进入“深度审计第十三轮：ModelStudio 高规模层级压力与长期一致性验证”。
目标：
1) 设计 10 层+ 的绑定/重排/删除压力场景；
2) 增加操作时延与状态一致性联合断言；
3) 完成问题级回归、阶段冒烟、全量回归闭环。
建议优先读取：
- `scripts/audit/phase5-stability-stress.mjs`
- `services/modelLayerOrdering.ts`
- `services/modelHierarchy.ts`
- `docs/Nebula-Weaver/audit_phase5_stability_stress.json`
期望输出格式：继续沿用 A-L。

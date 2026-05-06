# 19 - 深度审计第十一轮（ModelStudio 重排活动层稳定性与组合场景扩展）

## A. 本阶段目标
- 扩展 ModelStudio 复杂层级组合场景回归矩阵。
- 修复图层重排时活动层漂移问题，避免属性面板编辑目标误切换。
- 保持“问题级回归 -> 阶段冒烟 -> 全量回归”闭环。

## B. 本阶段审计范围
- 重排语义修复：
  - `services/modelLayerOrdering.ts`
  - `components/ModelStudioTool.tsx`
  - `tests/modelLayerOrdering.spec.ts`
- 组合场景扩展：
  - `scripts/audit/phase5-stability-stress.mjs`
- 关联复验：
  - `tests/modelHierarchy.spec.ts`
  - `tests/nebulaRecording.spec.ts`

## C. 本阶段使用的验证方式
- 静态阅读：是
- 本地启动：是（phase5/phase4）
- 构建验证：是（`audit:full`）
- 日志验证：是
- 单测/集成测试：是
- 手动构造输入验证：否（本轮以自动化回归为主）
- 其他工具验证：Playwright 通过 data-testid 精确校验活动层稳定性

## D. 已确认事实
- [事实] `moveLayer` 原实现会无条件将活动层切到“被移动层”，即使用户当前编辑的是其他层。
- [事实] 已新增 `moveLayerById` 与 `getNextActiveIndexAfterMove`，实现“活动层按对象身份保持稳定”。
- [事实] `ModelStudioTool` 图层行与移动按钮已增加 `data-testid`，提高自动化断言稳定性。
- [事实] phase5 新增 `modelStudioReorderActiveStability` 场景，验证跨层重排后活动层不漂移。

## E. 关键审计发现（按严重程度排序）
1. [事实] High：重排非活动层会意外切换活动层，存在误编辑风险，已修复。
2. [事实] Medium：复杂组合场景覆盖提升，phase5 现已覆盖 8 条关键链路检查。

## F. 逐项问题详解
### FIX-11-01
- 编号：FIX-11-01
- 标题：图层重排导致活动层漂移
- 分类：状态管理 / 交互语义
- 严重程度：High
- 证据：`components/ModelStudioTool.tsx`（原 `moveLayer` 直接 `setActiveIndex(targetIdx)`）
- 影响：属性面板可能切到非预期层，导致操作对象错位。
- 触发条件：在未选中某层时，点击其“上移/下移”按钮。
- 修复建议：已修复（基于移动区间计算活动索引迁移，而非固定切换到被移动层）。
- 回归建议：`tests/modelLayerOrdering.spec.ts` + phase5 `modelStudioReorderActiveStability`。

### FIX-11-02
- 编号：FIX-11-02
- 标题：组合场景回归矩阵不足
- 分类：测试覆盖
- 严重程度：Medium
- 证据：`scripts/audit/phase5-stability-stress.mjs`
- 影响：复杂交互回归缺陷可能漏检。
- 触发条件：多层级绑定 + 删除 + 重排组合操作。
- 修复建议：已扩展（新增重排活动层稳定性检查）。
- 回归建议：持续在 phase5 中演进更多组合链路。

## G. 本阶段结论
- [事实] ModelStudio 高价值交互语义缺陷已闭环。
- [事实] phase5 组合场景覆盖进一步增强，所有检查通过。
- [推断] 下一阶段可继续扩展到“批量导入 + 绑定链 + 重排链”更大规模场景。

## H. 必须立即处理的问题
1. [事实] 无新增必须立即处理项。

## I. 近期建议处理的问题
1. [待验证] 增加 4~6 层混合操作场景，观察长期状态一致性。
2. [待验证] 为层级操作引入可视化快照断言（非仅布尔状态）。

## J. 可延后处理的问题
1. [推断] 可考虑为 ModelStudio 状态机提炼独立 reducer，降低 UI 事件耦合。

## K. 本阶段摘要包（紧凑版）
【阶段摘要包】
阶段名称：深度审计第十一轮（ModelStudio 重排活动层稳定性与组合场景扩展）
已审计范围：重排活动层语义、phase5 组合场景扩展
未审计范围：大规模批量导入组合链路

一、确认事实
- 重排活动层漂移问题已修复。
- 新增 `modelStudioReorderActiveStability` 并通过。
- 全量回归继续全绿。

二、关键问题
- 关键交互语义错误已闭环。

三、最严重风险
- 剩余风险集中在更大规模组合操作覆盖不足。

四、已验证运行情况
- `npx vitest run tests/modelLayerOrdering.spec.ts` 通过。
- `npx vitest run tests/modelHierarchy.spec.ts` 通过。
- `npm run audit:phase5` 通过（新增检查通过）。
- `npm run audit:phase4` 通过。
- `npm test` 通过（11 files / 26 tests）。
- `npm run audit:full` 通过（6/6）。

五、待验证项
- 多层级批量操作下的状态一致性耐久验证。

六、下一阶段建议优先分析目标
- 扩展 ModelStudio 大规模组合场景（>=5 层）并引入结构快照断言。

七、紧凑继承上下文
- 当前系统已具备活动层稳定重排语义与关键组合回归；下一步建议放大场景规模提高鲁棒性。

## L. 下一阶段启动提示词
你现在进入“深度审计第十二轮：ModelStudio 大规模组合场景与结构快照断言”。
目标：
1) 设计至少 3 条 >=5 层的绑定/删除/重排组合场景；
2) 增加结构快照断言（层序、parentId、活动层）；
3) 完成问题级回归、阶段冒烟、全量回归闭环。
建议优先读取：
- `components/ModelStudioTool.tsx`
- `services/modelLayerOrdering.ts`
- `services/modelHierarchy.ts`
- `scripts/audit/phase5-stability-stress.mjs`
- `docs/Nebula-Weaver/audit_phase5_stability_stress.json`
期望输出格式：继续沿用 A-L。

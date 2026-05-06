# 17 - 深度审计第九轮（录制失败恢复语义修复与并发稳健性增强）

## A. 本阶段目标
- 修复 Nebula 导出链路在录制初始化失败时的状态卡死问题。
- 强化审计脚本并发稳健性（固定端口冲突 -> 动态端口分配）。
- 继续执行“问题级回归 -> 阶段冒烟 -> 全量单测与集成回归”闭环。

## B. 本阶段审计范围
- 录制失败恢复：
  - `components/NebulaCanvas.tsx`
  - `App.tsx`
  - `services/nebulaRecording.ts`
  - `tests/nebulaRecording.spec.ts`
  - `scripts/audit/phase5-stability-stress.mjs`
- 并发稳健性：
  - `scripts/audit/phase2-critical-repro.mjs`
  - `scripts/audit/phase4-module-deep-checks.mjs`
  - `scripts/audit/phase5-stability-stress.mjs`

## C. 本阶段使用的验证方式
- 静态阅读：是
- 本地启动：是（phase2/4/5）
- 构建验证：是（`audit:full`）
- 日志验证：是
- 单测/集成测试：是
- 手动构造输入验证：是（captureStream 失败注入）
- 其他工具验证：并发执行 phase2 场景验证端口冲突修复

## D. 已确认事实
- [事实] NebulaCanvas 新增 `onRecordingError` 回调链路，录制初始化失败时会通知父层清理 `isGenerating`。
- [事实] NebulaCanvas 新增录制停止计时器清理逻辑（`recordingStopTimeoutRef`），避免残留计时器干扰后续录制。
- [事实] 新增 `canStartRecording` 抽象，统一“流是否可录制”判定。
- [事实] `phase5` 新增 `nebulaCaptureFailureRecovery` 检查，验证导出失败后按钮状态恢复。
- [事实] phase2/4/5 脚本由固定端口改为动态分配空闲端口，降低并发冲突风险。

## E. 关键审计发现（按严重程度排序）
1. [事实] High：Nebula 导出失败时父层可能卡在“生成中”状态，已修复并有自动化回归覆盖。
2. [事实] High：审计脚本固定端口导致并发/残留进程时偶发失败，已修复为动态端口。
3. [事实] Medium：录制超时 stop 定时器此前未统一清理，已修复。

## F. 逐项问题详解
### FIX-09-01
- 编号：FIX-09-01
- 标题：录制初始化失败后导出状态卡死
- 分类：业务流程 / 错误处理
- 严重程度：High
- 证据：`components/NebulaCanvas.tsx`、`App.tsx`
- 影响：用户点击导出后若 captureStream/MediaRecorder 初始化失败，界面长期不可再次导出。
- 触发条件：浏览器不支持/流初始化失败/Recorder 构造失败。
- 修复建议：已修复（错误回调 + 父层状态复位 + 定时器清理）。
- 回归建议：`npm run audit:phase5` 中 `nebulaCaptureFailureRecovery.ok=true`。

### FIX-09-02
- 编号：FIX-09-02
- 标题：审计脚本固定端口导致并发冲突
- 分类：测试基础设施
- 严重程度：High
- 证据：`phase2/phase4/phase5` 脚本端口分配逻辑
- 影响：并发跑审计或端口被占用时出现假失败。
- 触发条件：同机并发执行或残留服务占用固定端口。
- 修复建议：已修复（`net` 动态分配空闲端口）。
- 回归建议：并发执行两次 `npm run audit:phase2` 均通过。

## G. 本阶段结论
- [事实] 录制失败恢复路径已闭环，语义级失败注入验证通过。
- [事实] 并发端口冲突脆弱点已修复，审计脚本在并发场景下更稳健。
- [推断] 下一阶段可继续扩大“语义级失败注入矩阵”（尤其业务规则边界）。

## H. 必须立即处理的问题
1. [事实] 无新增必须立即处理项。

## I. 近期建议处理的问题
1. [待验证] phase2 的 `consoleErrors` 中网络噪声可进一步结构化过滤，减少误导。
2. [待验证] 为 Nebula 录制错误类型补充分级统计（流错误/Recorder 构造错误/运行时错误）。

## J. 可延后处理的问题
1. [推断] 将各 phase 的公共能力（动态端口、goto 重试、错误过滤）提炼为共享脚本工具模块。

## K. 本阶段摘要包（紧凑版）
【阶段摘要包】
阶段名称：深度审计第九轮（录制失败恢复语义修复与并发稳健性增强）
已审计范围：Nebula 录制失败恢复、phase 脚本动态端口化
未审计范围：更细粒度业务规则失败矩阵

一、确认事实
- 导出失败后卡死问题已修复。
- phase5 新增恢复检查并通过。
- phase2/4/5 已改为动态端口，避免并发冲突。

二、关键问题
- 主要缺陷已闭环，当前质量门禁稳定。

三、最严重风险
- 剩余风险转向“失败信息分级与定位细粒度不足”。

四、已验证运行情况
- `npx vitest run tests/nebulaRecording.spec.ts` 通过。
- 并发两次 `npm run audit:phase2` 均通过。
- `npm run audit:phase5` 通过（含 `nebulaCaptureFailureRecovery`）。
- `npm run audit:phase4` 通过。
- `npm test` 通过（9 files / 20 tests）。
- `npm run audit:full` 通过（6/6）。

五、待验证项
- 语义级失败注入矩阵的覆盖广度（ModelStudio/Compressor 复杂边界）。

六、下一阶段建议优先分析目标
- 扩展语义失败注入到 ModelStudio 图层关系与 Compressor 极值参数路径。

七、紧凑继承上下文
- 当前系统在“失败恢复 + 门禁稳健性”上已明显增强；下一阶段重点应放在业务语义复杂分支覆盖。

## L. 下一阶段启动提示词
你现在进入“深度审计第十轮：复杂语义分支失败注入与业务规则极值验证”。
目标：
1) 对 ModelStudio 图层绑定/删除/重排进行语义失败注入；
2) 对 Compressor 极值参数（超小目标、格式回退、批次重跑）进行边界验证；
3) 每个新增风险点至少给出 1 条自动化断言并接入现有审计链。
建议优先读取：
- `components/ModelStudioTool.tsx`
- `components/PhotoCompressorTool.tsx`
- `scripts/audit/phase5-stability-stress.mjs`
- `docs/Nebula-Weaver/audit_full_regression_report.json`
期望输出格式：继续沿用 A-L。

# 10 - 深度审计第二轮（关键缺陷复现 + 最小回归基线）

## A. 本阶段目标
- 对上一轮高优先级问题进行可执行复现与纠偏。
- 建立最小自动化回归基线（可在本地重复执行）。
- 输出“已确认/已推翻/待验证”的问题状态变更。

## B. 本阶段审计范围
- 关键问题：P0（启动阻塞）、P1（导出命名）、P2（空队列点击）、P3（删除释放）。
- 工具链：playwright、vitest、Vite programmatic server。
- 产物落地：`scripts/audit/*`、`tests/*`、`../docs/Nebula-Weaver/*`。

## C. 本阶段使用的验证方式
- 静态阅读：是
- 本地启动：是（无 Key 与 dummy Key 双场景）
- 构建验证：是（build 复跑）
- 日志验证：是（pageerror/console/error）
- 单测/集成测试：是（vitest 执行审计脚本断言）
- 手动构造输入验证：是（自动导航 + 画布交互）
- 其他工具验证：playwright 浏览器执行

## D. 已确认事实
- [事实] 新增脚本 `scripts/audit/phase2-critical-repro.mjs` 可自动执行关键审计。
- [事实] 新增测试 `tests/phase2-audit.spec.ts`，`npm test` 通过。
- [事实] `npm run audit:phase2` 输出 JSON 证据并写入 `../docs/Nebula-Weaver/audit_phase2_repro_result.json`。
- [事实] 无 `GEMINI_API_KEY` 时，页面启动报错：`An API Key must be set when running in a browser`。
- [事实] P3（deleteLayer 释放缺口）静态扫描仍成立。
- [事实] P2 在当前 UI 路径下不可复现：空队列时 overlay 拦截 canvas 点击。
- [事实] 当前 Chromium 环境支持 `MediaRecorder video/mp4`，P1 风险在该环境下不触发。

## E. 关键审计发现（按严重程度排序）
1. [事实] Critical：无 Gemini key 时应用启动即失败（P0）。
2. [事实] High：ModelStudio 删除图层资源释放缺口（P3）。
3. [推断] Medium：P1 为跨浏览器/编码分支风险，当前环境未触发。
4. [事实] Low：P2 在正常用户路径不可达，需降级并保留监控。

## F. 逐项问题详解
### P0
- 编号：P0
- 标题：缺失 GEMINI_API_KEY 导致前端启动阻塞
- 分类：配置 / 业务可用性
- 严重程度：Critical
- 证据：`audit_phase2_repro_result.json` -> `p0_boot_without_gemini_key.bootFailed=true`
- 影响：应用页面在本地/测试环境无法进入主界面。
- 触发条件：运行时未注入 key。
- 修复建议：在 `geminiService` 延迟初始化 client；无 key 时降级为“可进入 UI + 功能受限提示”。
- 回归建议：新增“无 key 仍可启动首页”自动化测试。

### P3
- 编号：P3
- 标题：deleteLayer 未做 URL 与 three 对象释放
- 分类：性能 / 资源管理
- 严重程度：High
- 证据：`audit_phase2_repro_result.json` -> `p3_delete_layer_cleanup_gap.riskConfirmed=true`
- 影响：长会话下内存和 GPU 资源累积风险。
- 触发条件：频繁导入/删除图层。
- 修复建议：抽取统一释放函数，delete/new-session 两个路径复用。
- 回归建议：压力场景循环导入删除并观察内存曲线。

### P1
- 编号：P1
- 标题：导出文件名固定 mp4 的跨浏览器风险
- 分类：业务正确性
- 严重程度：Medium
- 证据：`p1_export_extension_risk.fixedMp4Filename=true`；当前 Chromium `mp4=true`。
- 影响：在不支持 mp4 recorder 的环境可能出现“内容容器与扩展名不一致”。
- 触发条件：[待验证] 浏览器不支持 mp4 分支且回落到 webm。
- 修复建议：下载名按 recorder 实际 mime 映射扩展名。
- 回归建议：mock 不同 `isTypeSupported` 组合验证命名。

### P2（状态修正）
- 编号：P2
- 标题：空队列点击崩溃路径状态修正
- 分类：状态
- 严重程度：Low
- 证据：`p2_empty_queue_canvas_click.normalClickBlockedByOverlay=true` 且未捕获异常。
- 影响：普通用户路径当前不可触发，不构成立即故障。
- 触发条件：[待验证] 若未来移除 overlay 或点击路径变化，潜在问题可能重新可达。
- 修复建议：保守加空值保护（低成本防御性修复）。
- 回归建议：保留覆盖层行为测试与 forced-path 安全测试。

## G. 本阶段结论
- [事实] 第二轮审计已完成“可执行复现 + 基线自动化”。
- [事实] 问题优先级已更新：P0 上升为 Critical；P2 降级。
- [推断] 下一阶段应进入“修复实施前置验证”：先修 P0/P3，再处理 P1。

## H. 必须立即处理的问题
1. P0（无 key 启动阻塞）
2. P3（deleteLayer 释放缺口）

## I. 近期建议处理的问题
1. P1（导出命名与 mime 映射）
2. P2（防御性空值保护）

## J. 可延后处理的问题
1. 更全面跨浏览器矩阵回归
2. 性能分包与观测性体系扩展

## K. 本阶段摘要包（紧凑版）
【阶段摘要包】
阶段名称：深度审计第二轮（关键缺陷复现 + 最小回归基线）
已审计范围：P0/P1/P2/P3 可执行复现、自动化基线搭建、问题优先级纠偏
未审计范围：修复代码实现、跨端兼容全量矩阵、完整业务 E2E

一、确认事实
- 无 key 启动失败可稳定复现（Critical）。
- deleteLayer 释放缺口仍成立（High）。
- P2 普通路径不可复现，已降级。
- `npm test` 已可执行并通过。

二、关键问题
- P0：启动阻塞
- P3：资源释放缺口
- P1：跨浏览器导出命名风险

三、最严重风险
- 环境配置缺失直接导致应用不可用（P0）。

四、已验证运行情况
- `npm run audit:phase2`：通过并输出 JSON
- `npm test`：1 测试通过
- `npm run build`：通过（仍有大包警告）

五、待验证项
- P1 在非 mp4 录制环境是否触发
- P3 的真实内存增长曲线

六、下一阶段建议优先分析目标
- 先做 P0/P3 修复设计与改动边界
- 同步建立修复后回归用例

七、紧凑继承上下文
- 当前最应修的是“可用性+稳定性”：P0、P3。
- 自动化审计脚本和最小测试基线已落地，可持续复跑。
- P2 已由高风险降级为低风险观察项。

## L. 下一阶段启动提示词
你现在进入“深度审计第三轮：关键缺陷修复设计与回归准入定义”。
目标：
1) 针对 P0/P3 给出最小改动修复方案与实施顺序；
2) 为每个修复项定义回归准入标准（通过条件/失败信号）；
3) 对 P1 给出跨浏览器验证策略（不立即重构）。
优先读取：
- `services/geminiService.ts`
- `components/ModelStudioTool.tsx`
- `components/NebulaCanvas.tsx`
- `scripts/audit/phase2-critical-repro.mjs`
- `tests/phase2-audit.spec.ts`
- `../docs/Nebula-Weaver/audit_phase2_repro_result.json`
重点验证链路：
- 无 key 启动链
- 图层删除资源清理链
- 导出命名与 mime 映射链
输出格式：沿用 A-L 结构，附修复任务分解清单。

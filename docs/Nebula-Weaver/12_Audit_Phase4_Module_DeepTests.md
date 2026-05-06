# 12 - 深度审计第四轮（模块化深测与边界用例扩展）

## A. 本阶段目标
- 对四个核心模块执行自动化深测，验证关键用户路径与边界输入行为。
- 扩展回归测试到服务边界（Gemini fallback、Canvas toBlob 空值防护）。
- 形成下一轮“稳定性压测 + 观测性补点”输入。

## B. 本阶段审计范围
- 动态深测脚本：`scripts/audit/phase4-module-deep-checks.mjs`
- 审计覆盖模块：Nebula / ModelStudio / PhotoCompressor / PhotoFramer
- 边界服务：`services/compressorService.ts`, `services/geminiService.ts`
- 新增测试：
  - `tests/compressorService.spec.ts`
  - `tests/geminiService.spec.ts`
  - `tests/phase2-audit.spec.ts`（回归基线）

## C. 本阶段使用的验证方式
- 静态阅读：是
- 本地启动：是（脚本内 Vite server）
- 构建验证：是
- 日志验证：是（pageerror + console.error）
- 单测/集成测试：是（Vitest 3 文件 5 用例）
- 手动构造输入验证：是（脚本注入图片/文本文件）
- 其他工具验证：Playwright

## D. 已确认事实
- [事实] `audit:phase4` 已执行并输出 `audit_phase4_module_deep_checks.json`。
- [事实] 四模块本轮深测均通过：`home/nebula/modelStudio/photoCompressor/photoFramer.ok=true`。
- [事实] Nebula 路径已能捕获下载事件：`downloadCaptured=true`, 文件名示例 `nebula_nebula.mp4`。
- [事实] PhotoCompressor 已验证非图片输入被过滤：`nonImageRejected=true`。
- [事实] PhotoFramer 已验证上传后预览画布可用：`previewCanvasReady=true`。
- [事实] 新增压缩服务边界防护：`safeCanvasToBlob` 对 `null` blob 显式抛错。
- [事实] 新增 MIME 归一化：不支持格式自动回落 `image/jpeg`。
- [事实] 全量验证通过：`npm test`、`npx tsc --noEmit`、`npm run build`、`npm run audit:phase2`、`npm run audit:phase4`。

## E. 关键审计发现（按严重程度排序）
1. [事实] 无新增 Critical/High 功能故障。
2. [事实] 压缩服务边界风险（原 P7）已实质缓解：不再使用 `toBlob` 非空断言。
3. [推断] 当前主要风险转移到“长时稳定性与性能曲线”而非功能正确性。

## F. 逐项问题详解
### P7（状态更新：已缓解）
- 编号：P7
- 标题：`compressorService` 空值与 MIME 边界风险
- 分类：错误处理 / 输入边界
- 严重程度：Medium -> Mitigated
- 证据：
  - `compressorService.ts:13,23,31,50`
  - `compressorService.spec.ts:9-12,15-21`
- 影响：边界输入下失败行为从“潜在静默异常”转为“可预期错误路径”。
- 触发条件：Canvas `toBlob` 返回 `null` 或原始 MIME 不受支持。
- 修复建议：已实施。
- 回归建议：保留 helper 单测并在 CI 中执行。

### M-NEBULA 深测结果
- 编号：M-NEBULA-01
- 标题：Nebula 上传与导出链路回归通过
- 分类：业务主链路
- 严重程度：Info
- 证据：`audit_phase4_module_deep_checks.json` `nebula` 段
- 影响：确认第三轮修复后主路径可运行。
- 触发条件：上传小图并执行导出。
- 修复建议：无。
- 回归建议：后续扩展到非 mp4 优先浏览器矩阵。

### M-MODEL 深测结果
- 编号：M-MODEL-01
- 标题：ModelStudio 增删循环基础场景通过
- 分类：生命周期/状态
- 严重程度：Info
- 证据：`audit_phase4_module_deep_checks.json` `modelStudio` 段（`addDeleteCycles=3`, `finalPrimitiveCount=0`）
- 影响：确认删除路径在基础循环下无前端错误。
- 触发条件：连续新增/删除 primitive。
- 修复建议：无。
- 回归建议：下一轮补长时压力（>100 cycles）与内存采样。

### M-COMPRESSOR 深测结果
- 编号：M-COMP-01
- 标题：非图像输入过滤与压缩执行正常
- 分类：输入边界/业务
- 严重程度：Info
- 证据：`audit_phase4_module_deep_checks.json` `photoCompressor` 段
- 影响：确认输入过滤与主链路稳定。
- 触发条件：图像+文本混合上传。
- 修复建议：无。
- 回归建议：补超大图与极小目标体积场景。

### M-FRAMER 深测结果
- 编号：M-FRAMER-01
- 标题：上传与预览渲染链正常
- 分类：业务主链路
- 严重程度：Info
- 证据：`audit_phase4_module_deep_checks.json` `photoFramer` 段
- 影响：确认预览流程可用。
- 触发条件：上传图像后等待渲染。
- 修复建议：无。
- 回归建议：补批量导出取消场景与错误汇总场景。

## G. 本阶段结论
- [事实] 第四轮完成从“修复验证”到“模块深测”的过渡，核心模块基础路径稳定。
- [事实] 新增服务边界单测有效提升了异常输入可验证性。
- [推断] 下一阶段应以“稳定性压测 + 边界极值 + 回归覆盖扩展”为中心。

## H. 必须立即处理的问题
1. [事实] 当前无必须立即处理的新增 Critical/High 问题。

## I. 近期建议处理的问题
1. ModelStudio 长时增删循环压测并采集内存趋势。
2. Nebula 导出 MIME 矩阵（特别是非 mp4 优先环境）验证。
3. PhotoFramer 批量导出取消/失败恢复路径自动化。
4. PhotoCompressor 极端目标体积与大图输入回归。

## J. 可延后处理的问题
1. 分包与体积优化（当前仍 >500k 警告）。
2. 统一观测性平台（结构化日志、错误上报）。

## K. 本阶段摘要包（紧凑版）
【阶段摘要包】
阶段名称：深度审计第四轮（模块化深测与边界用例扩展）
已审计范围：四模块自动化深测、compressor/gemini 边界单测补齐
未审计范围：长时压力、跨浏览器矩阵、批量失败恢复全场景

一、确认事实
- 四模块 deep-check 均通过
- P7 已缓解（toBlob 空值保护 + MIME 归一化）
- test/typecheck/build/audit 全通过

二、关键问题
- 无新增高危功能缺陷
- 剩余风险集中在稳定性与覆盖率深度

三、最严重风险
- 长时压力场景缺乏定量验证

四、已验证运行情况
- `audit:phase4` 通过并输出 JSON
- `npm test` 3 文件 5 用例通过

五、待验证项
- ModelStudio >100 次增删循环内存曲线
- Nebula 非 mp4 分支真实下载行为
- Framer 批量导出取消/异常恢复

六、下一阶段建议优先分析目标
- 稳定性压测与极值边界验证（按模块分层执行）

七、紧凑继承上下文
- 关键功能修复已稳定，进入“高强度稳定性审计”阶段。
- 现有基线：`audit:phase2` + `audit:phase4` + 5 条单测。

## L. 下一阶段启动提示词
你现在进入“深度审计第五轮：稳定性压测与极值边界验证”。
目标：
1) 对 ModelStudio 执行长时增删循环压测并记录趋势；
2) 对 Nebula 执行导出场景分支测试（至少模拟 mp4/webm/matroska 兼容差异）；
3) 对 Framer/Shrink 执行批量极值输入与取消/失败恢复测试；
4) 输出可用于缺陷回归与性能基线追踪的检查项。
建议优先读取：
- `scripts/audit/phase4-module-deep-checks.mjs`
- `components/ModelStudioTool.tsx`
- `components/NebulaCanvas.tsx`
- `components/PhotoFramerTool.tsx`
- `components/PhotoCompressorTool.tsx`
- `services/compressorService.ts`
期望输出格式：继续沿用 A-L。

# 13 - 深度审计第五轮（稳定性压测与极值边界验证）

## A. 本阶段目标
- 对关键模块执行更高强度稳定性验证。
- 验证修复后的跨分支行为（尤其 Nebula 导出 MIME 分支）。
- 验证极值输入场景（HEIC、批量取消、循环增删）。

## B. 本阶段审计范围
- 深测脚本：`scripts/audit/phase5-stability-stress.mjs`
- 核心路径：
  - Nebula 导出默认分支 + “禁用 mp4 支持”分支
  - ModelStudio 30 次增删循环
  - PhotoCompressor HEIC 输入与下载扩展名一致性
  - PhotoFramer 导出取消流程

## C. 本阶段使用的验证方式
- 静态阅读：是
- 本地启动：是
- 构建验证：是
- 日志验证：是
- 单测/集成测试：是
- 手动构造输入验证：是（脚本注入文件/模拟分支）
- 其他工具验证：Playwright + Vite

## D. 已确认事实
- [事实] `audit:phase5` 执行成功，结果写入 `audit_phase5_stability_stress.json`。
- [事实] Nebula 在默认支持下下载 `nebula_nebula.mp4`。
- [事实] Nebula 在“禁用 mp4 支持”模拟下下载 `nebula_nebula.webm`。
- [事实] ModelStudio 30 次增删循环后 `finalPrimitiveCount=0`，无页面错误。
- [事实] ModelStudio 采样 `heapSamples` 在本次脚本中保持稳定（同值序列）。
- [事实] PhotoCompressor HEIC 流程压缩成功，下载名 `astro_optimized.jpeg`，与 blob 类型一致。
- [事实] PhotoFramer 取消按钮可见并可成功取消导出流程。

## E. 关键审计发现（按严重程度排序）
1. [事实] 无新增 Critical/High 故障。
2. [事实] P1 跨分支导出命名问题在模拟分支验证中通过（mp4/webm 均正确）。
3. [事实] 修复后的 PhotoCompressor 扩展名一致性在 HEIC 边界输入通过。
4. [推断] 当前最大风险已转为“压力规模不足与长期运行样本不足”。

## F. 逐项问题详解
### S1
- 编号：S1
- 标题：Nebula 导出 MIME 分支验证通过
- 分类：业务正确性
- 严重程度：Info
- 证据：`audit_phase5_stability_stress.json` `nebulaExportDefault` 与 `nebulaExportNoMp4Support`
- 影响：确认导出扩展名映射在关键分支有效。
- 触发条件：默认 mp4 支持 / 禁用 mp4 支持。
- 修复建议：无。
- 回归建议：保留该双场景脚本为固定门禁。

### S2
- 编号：S2
- 标题：ModelStudio 增删循环稳定性通过（30 cycles）
- 分类：稳定性/资源
- 严重程度：Info
- 证据：`modelStudioStress.cycles=30`, `finalPrimitiveCount=0`, `pageErrors=[]`
- 影响：当前释放逻辑在中等循环压力下稳定。
- 触发条件：连续新增与删除 primitive。
- 修复建议：无。
- 回归建议：下一步扩展到 100+ cycles 并分段采样。

### S3
- 编号：S3
- 标题：Compressor HEIC 输入扩展名一致性通过
- 分类：输入边界/业务正确性
- 严重程度：Info
- 证据：`photoCompressorHeicFlow.downloadFile=astro_optimized.jpeg` 且 `extensionMatchesBlobType=true`
- 影响：已关闭此前“转换后扩展名错配”隐患。
- 触发条件：`outputFormat=original` 且原始 MIME 为不支持类型。
- 修复建议：无。
- 回归建议：追加 webp/avif 边界样本。

### S4
- 编号：S4
- 标题：PhotoFramer 导出取消路径通过
- 分类：错误恢复/用户流程
- 严重程度：Info
- 证据：`photoFramerCancelFlow.cancelButtonSeen=true`, `cancelWorked=true`
- 影响：批量导出中断路径可用。
- 触发条件：导出进行中主动取消。
- 修复建议：无。
- 回归建议：补“取消后重试导出”场景。

## G. 本阶段结论
- [事实] 第五轮完成了稳定性与极值边界验证，核心链路表现稳定。
- [推断] 当前阶段适合转向“回归编排自动化 + 报告聚合”，减少人工执行成本。

## H. 必须立即处理的问题
1. [事实] 无新增必须立即处理问题。

## I. 近期建议处理的问题
1. 扩大 ModelStudio 压测规模（100+ cycles）。
2. 为 Framer 补“取消后重试”自动化用例。
3. 增加 Compressor 超大图输入样本。

## J. 可延后处理的问题
1. 产线级性能基线与监控接入。
2. 更广泛浏览器矩阵（Safari/Firefox 录制细分差异）。

## K. 本阶段摘要包（紧凑版）
【阶段摘要包】
阶段名称：深度审计第五轮（稳定性压测与极值边界验证）
已审计范围：Nebula 分支导出、Model 30 次循环、Compressor HEIC、Framer 取消
未审计范围：更高强度压力、跨浏览器全矩阵

一、确认事实
- 全部 phase5 检查项通过
- 导出命名跨分支行为正确
- HEIC 扩展名一致性修复有效

二、关键问题
- 无新增高危问题
- 待扩展压力规模与覆盖深度

三、最严重风险
- 长时间高强度场景仍缺少充分样本

四、已验证运行情况
- `npm run audit:phase5` 通过并产出 JSON

五、待验证项
- 100+ cycles 长时稳定性
- Framer 取消后重试闭环

六、下一阶段建议优先分析目标
- 全量回归编排与统一报告自动化

七、紧凑继承上下文
- 功能与边界稳定性较好，进入“回归编排产品化”阶段。

## L. 下一阶段启动提示词
你现在进入“深度审计第六轮：全量回归编排与统一报告自动化”。
目标：
1) 将 phase2/phase4/phase5 + test/typecheck/build 串成一键回归；
2) 生成统一 machine-readable 报告，便于后续每次修复复跑对比；
3) 明确回归准入门禁与失败处理策略。
建议优先读取：
- `scripts/audit/phase2-critical-repro.mjs`
- `scripts/audit/phase4-module-deep-checks.mjs`
- `scripts/audit/phase5-stability-stress.mjs`
- `package.json`
期望输出格式：继续沿用 A-L。

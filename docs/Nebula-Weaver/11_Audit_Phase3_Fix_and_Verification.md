# 11 - 深度审计第三轮（关键缺陷修复实施与回归验证）

## A. 本阶段目标
- 对 P0/P3/P1 的修复方案进行代码落地。
- 用自动化脚本 + 测试 + 构建验证修复有效性。
- 输出修复后的风险分层与下一阶段深测路线。

## B. 本阶段审计范围
- 修复范围：`services/geminiService.ts`, `components/ModelStudioTool.tsx`, `components/NebulaCanvas.tsx`, `App.tsx`。
- 自动化范围：`scripts/audit/phase2-critical-repro.mjs`, `tests/phase2-audit.spec.ts`。
- 验证范围：`npm run audit:phase2`, `npm test`, `npm run build`, `npx tsc --noEmit`。

## C. 本阶段使用的验证方式
- 静态阅读：是
- 本地启动：是（通过审计脚本中的浏览器场景）
- 构建验证：是
- 日志验证：是（pageerror/console）
- 单测/集成测试：是
- 手动构造输入验证：是（脚本自动化导航）
- 其他工具验证：Playwright + Vite programmatic server

## D. 已确认事实
- [事实] P0 已修复：Gemini 客户端改为惰性初始化，无 key 不再阻塞页面启动。
  - 证据：`geminiService.ts:8,34,60`
- [事实] P3 已修复：新增 `disposeLayerResources`，delete/new-session 路径共用释放逻辑。
  - 证据：`ModelStudioTool.tsx:97,136,234,237`
- [事实] P1 已缓解：导出回调改为 `url + mimeType`，文件扩展名动态映射。
  - 证据：`NebulaCanvas.tsx:13,569`, `App.tsx:160,271`
- [事实] 防御性修复：`onSetZoomOrigin` 增加空值保护。
  - 证据：`App.tsx:284`
- [事实] 回归结果：
  - `npm run audit:phase2`：通过，`bootFailed=false`, `riskConfirmed=false`, `fixedMp4Filename=false`
  - `npm test`：1 passed
  - `npx tsc --noEmit`：通过
  - `npm run build`：通过（仍有大包警告）

## E. 关键审计发现（按严重程度排序）
1. [事实] Critical -> Closed：P0 启动阻塞已关闭。
2. [事实] High -> Closed：P3 资源释放缺口已关闭。
3. [推断] Medium -> Mitigated：P1 风险由“固定扩展名”降为“依赖 MIME 映射正确性”。
4. [事实] Low：P2 仍不可达，已加防御性保护。
5. [事实] Remaining：工程化风险仍在（无完整业务测试集、包体偏大）。

## F. 逐项问题详解
### P0（已修复）
- 编号：P0
- 标题：无 Key 启动阻塞
- 分类：业务/配置
- 严重程度：Critical -> Closed
- 证据：`geminiService.ts:8-26,34-35,60-61`；`audit_phase2_repro_result.json` 中 `bootFailed=false`
- 影响：启动可用性恢复，未配置 key 时可进入 UI。
- 触发条件：key 缺失时进入降级逻辑。
- 修复建议：已实施（惰性 client + fallback）。
- 回归建议：保留无 key 启动测试为准入门禁。

### P3（已修复）
- 编号：P3
- 标题：删除图层释放缺口
- 分类：性能/资源管理
- 严重程度：High -> Closed
- 证据：`ModelStudioTool.tsx:97-116,136,234-237`；审计 JSON `riskConfirmed=false`
- 影响：删除路径与新会话路径统一释放。
- 触发条件：导入/删除模型时触发统一释放函数。
- 修复建议：已实施（helper 复用）。
- 回归建议：后续补充长期运行内存曲线压测。

### P1（已缓解）
- 编号：P1
- 标题：导出命名与容器一致性
- 分类：业务正确性
- 严重程度：Medium -> Mitigated
- 证据：`NebulaCanvas.tsx:569` 回传 blobType；`App.tsx:160,271` 动态扩展名映射
- 影响：降低跨浏览器容器/扩展名错配概率。
- 触发条件：不同浏览器 recorder MIME 分支。
- 修复建议：已实施；后续补充多浏览器分支验证。
- 回归建议：mock 不同 MIME 组合，断言下载扩展名。

### P2（已防御）
- 编号：P2
- 标题：空队列点击路径防御性保护
- 分类：状态管理
- 严重程度：Low
- 证据：`App.tsx:284` 判空返回 `prev`
- 影响：即使未来 UI 交互可达，也不会因空引用写入崩溃。
- 触发条件：`copy[activeIndex]` 不存在。
- 修复建议：已实施。
- 回归建议：保留 forced-path 安全性检查。

## G. 本阶段结论
- [事实] 第三轮以“修复 + 回归验证”为主，关键阻塞问题已闭环。
- [事实] 当前审计重点应从“可用性故障”转向“业务深测与边界回归”。
- [推断] 下一阶段应按模块做深测：Nebula 导出链、Model 资源生命周期压测、Framer/Shrink 边界输入。

## H. 必须立即处理的问题
1. [事实] 无新增 Critical/High 未闭环代码缺陷。
2. [待验证] 需要建立更完整业务回归集（当前仅最小基线）。

## I. 近期建议处理的问题
1. Nebula 多 MIME 分支回归测试（真实/模拟）。
2. ModelStudio 长时间导入删除压力测试。
3. PhotoFramer 与 PhotoCompressor 的边界输入测试（超大图、异常 MIME、批量取消）。

## J. 可延后处理的问题
1. 包体优化与懒加载拆分。
2. 统一观测性（结构化日志/错误上报）。

## K. 本阶段摘要包（紧凑版）
【阶段摘要包】
阶段名称：深度审计第三轮（关键缺陷修复实施与回归验证）
已审计范围：P0/P3/P1 修复落地，自动化回归脚本与测试校验
未审计范围：全量业务 E2E、跨浏览器矩阵、性能长期压测

一、确认事实
- P0 已关闭（无 key 可启动）
- P3 已关闭（deleteLayer 释放闭环）
- P1 已缓解（动态扩展名）
- test/typecheck/build/audit 全通过

二、关键问题
- 关键阻塞缺陷已闭环
- 剩余问题主要是“测试覆盖深度不足”

三、最严重风险
- 回归测试深度不够，可能遗漏长尾边界

四、已验证运行情况
- `npm run audit:phase2` 通过
- `npm test` 通过
- `npm run build` 通过

五、待验证项
- Nebula 跨浏览器导出分支
- Model 长时会话内存稳定性

六、下一阶段建议优先分析目标
- 按模块建立深测清单并执行（Nebula -> Model -> Framer/Shrink）

七、紧凑继承上下文
- 关键故障修复已完成，进入“模块化深测与回归覆盖率提升”阶段。
- 当前可用脚本：`audit:phase2` + `npm test`。

## L. 下一阶段启动提示词
你现在进入“深度审计第四轮：模块化深测与边界用例扩展”。
目标：
1) 深测 Nebula 导出链（MIME 分支、失败恢复、下载命名）；
2) 深测 ModelStudio 生命周期（重复导入/删除、内存稳定性）；
3) 深测 Framer/Shrink 边界输入（异常格式、超大文件、批量取消）；
4) 产出最小但高价值的回归用例扩展方案。
建议优先读取：
- `components/NebulaCanvas.tsx`
- `components/ModelStudioTool.tsx`
- `components/PhotoFramerTool.tsx`
- `components/PhotoCompressorTool.tsx`
- `services/compressorService.ts`
- `scripts/audit/phase2-critical-repro.mjs`
- `tests/phase2-audit.spec.ts`
期望输出格式：继续沿用 A-L。

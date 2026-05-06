# 09 - 深度审计第一轮（本地运行 + 入口链 + 主链路初审）

## A. 本阶段目标
- 验证本地可运行性。
- 识别依赖与配置前提。
- 审计主入口与初始化链。
- 初审核心业务主链路并输出首批高风险问题。

## B. 本阶段审计范围
- 入口与初始化：`index.tsx`, `App.tsx`。
- 核心模块：Nebula / Model Studio / Photo Framer / Photo Shrink。
- 配置与运行：`package.json`, `vite.config.ts`, `README.md`, `.env`状态。

## C. 本阶段使用的验证方式
- 静态阅读：是
- 本地启动：是（Vite programmatic server）
- 构建验证：是（`npm run build`）
- 日志验证：是（命令输出 + 编译警告）
- 单测/集成测试：否（项目无测试）
- 手动构造输入验证：有限（服务调用脚本与运行链检查）
- 其他工具验证：`npx madge`, `npm audit`, `npx depcheck`

## D. 已确认事实
- [事实] 本地启动链：`npm run dev`；构建链：`npm run build`；预览链：`npm run preview`。
- [事实] 本地环境变量 `GEMINI_API_KEY` 与 `API_KEY` 当前为空。
- [事实] `.env` 与 `.env.local` 均不存在（当前工作目录）。
- [事实] `npm run build` 成功；产物 chunk 约 1.4MB，触发 Vite 大包警告。
- [事实] `npx tsc --noEmit` 通过。
- [事实] 使用 Vite Node API 启动本地服务后，`http://127.0.0.1:3005/` 返回 `200`。
- [事实] `npx madge --circular` 未发现循环依赖。
- [事实] `npm audit` 未发现漏洞（prod+dev 均 0）。
- [事实] 无测试文件、无 `test/lint` 脚本。

## E. 关键审计发现（按严重程度排序）
1. [事实] Nebula 导出扩展名固定为 `.mp4`，与实际录制 MIME 可能不一致（High）。
2. [事实] Nebula 点击画布设置缩放原点时，对空队列缺少保护，存在运行时崩溃路径（High）。
3. [事实] Model Studio 删除单图层时未释放 URL/几何体/材质，存在资源泄漏风险（High）。
4. [事实] 前端构建注入 Gemini key，存在密钥暴露风险（High）。
5. [事实] 测试与质量门禁缺失，回归风险高（High）。
6. [事实] 多项配置/能力已声明但未生效或未接通（Medium）。
7. [推断] 压缩服务对 `canvas.toBlob` 结果做非空断言，遇不支持 MIME 可能触发空值故障（Medium, 待动态验证）。

## F. 逐项问题详解
### P1
- 编号：P1
- 标题：Nebula 导出文件名与实际 MIME 可能不一致
- 分类：业务 / 错误处理
- 严重程度：High
- 证据：
  - `App.tsx:261` 固定 `link.download = ...mp4`
  - `NebulaCanvas.tsx:521-533` MIME 可能为 webm/mp4/matroska
- 影响：导出文件在部分播放器中识别错误、用户误判导出失败。
- 触发条件：请求格式与最终 recorder MIME 不一致时。
- 修复建议：在回调中返回最终 MIME 或扩展名映射，按真实编码命名。
- 回归建议：覆盖 `webm/mp4/mkv` 三分支并验证文件可播放性。

### P2
- 编号：P2
- 标题：Nebula 空队列点击画布存在崩溃路径
- 分类：状态 / 业务
- 严重程度：High
- 证据：
  - `App.tsx:264`：`copy[activeIndex].zoomOrigin = {x,y}` 无空值保护
  - `NebulaCanvas.tsx:240-244,604`：画布点击始终触发 `onSetZoomOrigin`
- 影响：无图片时点击画布可能抛异常，破坏交互流程。
- 触发条件：`batchItems` 为空且触发画布点击。
- 修复建议：在回调中增加 `if (!copy[activeIndex]) return prev;` 或仅在有 activeItem 时传入 `onSetZoomOrigin`。
- 回归建议：空队列点击、单图点击、多图切换点击均需覆盖。

### P3
- 编号：P3
- 标题：Model Studio 删除图层未做完整资源释放
- 分类：性能 / 资源管理
- 严重程度：High
- 证据：
  - `ModelStudioTool.tsx:227-230` 删除逻辑仅 `setLayers + layerObjects.delete`
  - 对比 `processImport(new)` 中有 `geometry.dispose/material.dispose/revokeObjectURL`（`119-128`）
- 影响：长会话多次增删图层可导致内存上涨与渲染稳定性下降。
- 触发条件：频繁删除/重导入模型。
- 修复建议：提取 `disposeLayerResources(layerId)`，删除路径与会话重置路径统一调用。
- 回归建议：脚本化执行 N 次导入/删除并监测内存曲线。

### P4
- 编号：P4
- 标题：Gemini API Key 前端注入存在泄露面
- 分类：安全 / 配置
- 严重程度：High
- 证据：
  - `vite.config.ts:14-15` 将 `GEMINI_API_KEY` 注入前端变量
  - `geminiService.ts:5` 前端直接消费
- 影响：公网部署时密钥可被提取并滥用配额。
- 触发条件：应用暴露到外网。
- 修复建议：生产改为后端代理签名与限流；本地保持现状可用。
- 回归建议：上线前做前端 bundle 密钥扫描。

### P5
- 编号：P5
- 标题：测试与质量门禁缺失
- 分类：测试 / 维护性
- 严重程度：High
- 证据：
  - `package.json` 仅 `dev/build/preview`
  - 未发现仓库内测试文件
- 影响：核心链路改动无法自动验证，回归依赖人工。
- 触发条件：任意需求迭代或缺陷修复。
- 修复建议：先补最小关键测试集（导出命名、空队列点击保护、删除资源释放、压缩边界）。
- 回归建议：PR 前强制 `typecheck + smoke`。

### P6
- 编号：P6
- 标题：声明能力与实际行为不一致（断链/僵尸配置）
- 分类：架构 / 维护性
- 严重程度：Medium
- 证据：
  - `services/exportService.ts` 无调用点
  - `NebulaCanvas.tsx:17` `onImageReady` 仅定义
  - `PhotoCompressorTool.tsx:37-38` 配置声明未进入 service
  - `ModelStudioTool.tsx:88` `environment` 在 viewer 中未消费
- 影响：维护者误判能力已生效，改动风险上升。
- 触发条件：按 UI/类型推断能力时。
- 修复建议：标注实验字段或移除；必要能力尽快接线并补回归。
- 回归建议：每个配置项建立“UI->状态->行为”可追踪测试点。

### P7
- 编号：P7
- 标题：压缩服务 `toBlob` 非空断言存在边界风险
- 分类：错误处理 / 输入边界
- 严重程度：Medium
- 证据：
  - `compressorService.ts:29,42,62,76` 使用 `resolve(b!)`
- 影响：在不支持 MIME 或浏览器异常下可能出现空值异常。
- 触发条件：[待验证] 输入 MIME 非标准或浏览器实现差异。
- 修复建议：显式判空并降级到 `image/jpeg`；记录错误原因。
- 回归建议：构造不支持 MIME 的输入并验证兜底路径。

## G. 本阶段结论
- [事实] 项目在本地可启动、可构建、可类型检查通过。
- [事实] 主入口和核心主链路可定位且总体可运行。
- [事实] 首批高风险集中在：导出正确性、状态边界保护、资源释放、安全配置、测试缺失。
- [推断] 当前项目更像“可用原型向工程化过渡阶段”，应先补关键质量护栏再做深改。

## H. 必须立即处理的问题
1. P1 导出扩展名与 MIME 一致性。
2. P2 空队列点击崩溃路径。
3. P3 图层删除资源释放。
4. P5 最小质量门禁（至少 typecheck + smoke）。

## I. 近期建议处理的问题
1. P4 API key 生产安全收敛（本地开发可暂缓）。
2. P6 僵尸配置/断链能力清理。
3. P7 toBlob 空值兜底。

## J. 可延后处理的问题
1. 构建分包与性能深度优化（在功能正确性稳定后执行）。
2. 观测性平台化（先做最小日志结构化）。

## K. 本阶段摘要包（紧凑版）
【阶段摘要包】
阶段名称：深度审计第一轮（本地运行 + 入口链 + 主链路初审）
已审计范围：启动与构建、入口初始化、核心链路初审、首批风险识别
未审计范围：逐功能动态 E2E、浏览器兼容矩阵、完整回归测试实现

一、确认事实
- 本地 `dev/build/typecheck` 可跑通。
- 无 `.env(.local)`，Gemini key 当前为空。
- 无测试、无 lint、无 CI。

二、关键问题
- 导出扩展名不一致
- 空队列点击崩溃路径
- 删除图层资源未完整释放
- 前端密钥暴露面

三、最严重风险
- 业务正确性与稳定性风险（P1/P2/P3）先于性能优化。

四、已验证运行情况
- Vite programmatic server 返回 HTTP 200。
- build/typecheck/audit/madge 均已执行。

五、待验证项
- `toBlob` 空值路径的真实触发率
- iOS/Android 录制与导出兼容矩阵
- exportService 的业务去向

六、下一阶段建议优先分析目标
- Nebula 导出链与状态边界（含修复方案）
- Model Studio 资源生命周期
- 最小测试集与回归脚本落地

七、紧凑继承上下文
- 项目可本地运行，但存在 3 个高优先级代码缺陷（导出命名、空队列点击、删除释放）。
- 无自动化测试，修复前需先补 smoke 测试骨架。
- 安全层面需规划 API key 收敛，但本地开发不阻塞。

## L. 下一阶段启动提示词
你现在进入“深度审计第二轮：关键缺陷复现与最小回归集建立”。
目标：
1) 对 P1/P2/P3 做可复现验证与修复方案细化；
2) 建立最小测试/验证脚本（至少覆盖导出命名、空队列点击防护、资源释放路径）；
3) 输出可直接进入缺陷修复迭代的任务清单。
优先读取：
- `App.tsx`
- `components/NebulaCanvas.tsx`
- `components/ModelStudioTool.tsx`
- `services/compressorService.ts`
- `docs/Nebula-Weaver/09_Audit_Phase1_LocalRun_EntryCore.md`
重点验证链路：
- Nebula 导出链
- Nebula 画布点击链
- Model 删除图层链
输出格式：沿用 A-L 结构，并附更新版阶段摘要包。

# 模块级深度逆向分析（四大子系统）

> 说明：本阶段按子系统切分，而非逐文件罗列。每条关键结论按证据等级标注。

## A. 模块职责与系统定位
- M1 Nebula Weaver：
  - [事实] 将单张天体图片转为可预览与可导出的动态星场视频。
  - 证据：`App.tsx:41-263`, `NebulaCanvas.tsx:248-592`。
- M2 Photo Framer：
  - [事实] 对批量照片进行装裱风格渲染并导出单图/ZIP。
  - 证据：`PhotoFramerTool.tsx:24-505`, `framerWorker.ts:112-281`。
- M3 Model Studio：
  - [事实] 管理多图层 3D 资产导入、视觉属性编辑与 GLB 导出。
  - 证据：`ModelStudioTool.tsx:54-606`, `ModelViewer3D.tsx:14-186`, `threeService.ts:10-208`。
- M4 Photo Shrink：
  - [事实] 以目标体积压缩批量图片并下载。
  - 证据：`PhotoCompressorTool.tsx:26-463`, `compressorService.ts:9-90`。

## B. 模块边界
### M1 Nebula Weaver
- 输入：[事实] 图片文件、粒子参数、动画参数、视频参数。
- 输出：[事实] 视频 blob URL 下载。
- 依赖：[事实] `geminiService`, `starDetectionService`, browser `MediaRecorder/canvas`。
- 被谁调用：[事实] `App.tsx` 首页切换后挂载。
- 调用谁：[事实] `identifyNebulaFromImage`, `analyzeNebulaImage`, `detectStarsFromImage`。

### M2 Photo Framer
- 输入：[事实] 本地图片集合 + frame/image edit config。
- 输出：[事实] JPG 文件或 ZIP 包。
- 依赖：[事实] `renderFrame(req)` + `JSZip`。
- 调用谁：[事实] `framerWorker.renderFrame`。

### M3 Model Studio
- 输入：[事实] 模型文件（glb/gltf/obj/stl/fbx）或 primitive 参数。
- 输出：[事实] 合成 GLB 下载。
- 依赖：[事实] three loaders/exporter。
- 调用谁：[事实] `load3DModel/analyzeModel/buildSceneTree/exportToGLB`。

### M4 Photo Shrink
- 输入：[事实] 图片文件 + 目标体积 + 输出格式。
- 输出：[事实] 压缩结果 blob。
- 依赖：[事实] `compressImageToTarget`（Canvas 转码）。

## C. 内部层次与关键构件
### M1 关键构件
- `NebulaTool`（编排层）：上传队列、批量分析、参数面板。
- `NebulaCanvas`（渲染层）：帧绘制、播放控制、录制导出。
- `geminiService`（外部 AI 适配层）：命名与分析。
- `starDetectionService`（本地算法层）：星点检测。

### M2 关键构件
- `PhotoFramerTool`（编排/UI层）：批处理调度、进度、取消、错误汇总。
- `renderFrame`（渲染引擎层）：旋转翻转、裁切、背景玻璃化、前景装裱、导出。

### M3 关键构件
- `ModelStudioTool`（业务编排层）：图层状态、导入策略、导出策略。
- `ModelViewer3D`（渲染展示层）：场景、灯光、controls、图层注入。
- `threeService`（模型能力层）：加载器、分析器、导出器。

### M4 关键构件
- `PhotoCompressorTool`（编排层）：批处理状态、参数输入、结果下载。
- `compressImageToTarget`（算法层）：质量二分 + 降尺寸兜底。

## D. 核心调用链
### 链路1：Nebula 分析与生成
1. [事实] `handleImageUpload` 写入 `batchItems`（`App.tsx:89`）。
2. [事实] `handleBatchAnalysis` 循环调用 AI 与星点检测（`App.tsx:116-141`）。
3. [事实] `NebulaCanvas` 根据 `detectedParticles` 或 procedural 生成粒子（`NebulaCanvas.tsx:205-245`）。
4. [事实] `drawFrame` 每帧合成背景+粒子+衍射尖刺（`NebulaCanvas.tsx:248-435`）。
5. [事实] 录制时 `captureStream + MediaRecorder` 导出（`NebulaCanvas.tsx:511-579`）。

### 链路2：Photo Framer 批量导出
1. [事实] 上传后为每图创建 `FramedImage` 和 `previewUrl`（`PhotoFramerTool.tsx:133-157`）。
2. [事实] 预览 useEffect 调 `renderFrame(quality=preview)`（`PhotoFramerTool.tsx:88-129`）。
3. [事实] 导出循环按图调 `renderFrame(quality=full)`（`PhotoFramerTool.tsx:193-305`）。
4. [事实] 根据 `shouldZip` 走逐个下载或 JSZip 汇总。

### 链路3：Model Studio 资产导入到导出
1. [事实] `handleImportRequest` 决定 `new/append`（`ModelStudioTool.tsx:98-105`）。
2. [事实] `processImport` 创建图层项并逐个 `loadLayer`（`107-153`）。
3. [事实] `loadLayer` -> `load3DModel/analyzeModel/buildSceneTree`（`169-183`）。
4. [事实] `ModelViewer3D` useEffect 将 layerObjects 注入 scene（`ModelViewer3D.tsx:111-170`）。
5. [事实] `handleExport` 合并 clone 后 `exportToGLB`（`ModelStudioTool.tsx:238-258`）。

### 链路4：Photo Shrink 批量压缩
1. [事实] `handleFiles` 入列图片（`PhotoCompressorTool.tsx:59-68`）。
2. [事实] `startCompression` 顺序调用 `compressImageToTarget`（`85-126`）。
3. [事实] service 执行质量二分，不达标时降尺寸循环（`compressorService.ts:33-71`）。
4. [事实] `downloadAll` 逐个下载结果（`PhotoCompressorTool.tsx:129-142`）。

## E. 数据/状态流
- [事实] 各工具内部状态独立，未形成全局 store。
- [推断] 优点是隔离简单；缺点是跨工具能力复用弱。
- M1 状态对象：`BatchItem` + `particleConfig` + `animationConfig` + `videoConfig`。
- M2 状态对象：`images` + `config` + `debouncedConfig` + `isExporting/exportProgress/errorLog`。
- M3 状态对象：`layers` + `layerObjects(Map)` + `viewerConfig`。
- M4 状态对象：`items` + `settings` + `isProcessing`。

## F. 设计取舍与原因
- [事实] 大量采用浏览器原生 API，避免后端依赖与服务成本。
- [推断] 设计偏“本地即用”，适合离线素材处理（除 Gemini）。
- [事实] M2/M4 都采用顺序批处理而非并发，优先稳定与 UI 可控。
- [推断] M3 采用 `layers + layerObjects` 双结构，折中 UI 状态与 three 对象生命周期。

## G. 风险与坑点
1. [事实] Nebula 导出文件名固定 `.mp4`，可能与实际录制 MIME 不一致（`App.tsx:261`, `NebulaCanvas.tsx:526-533`）。
2. [事实] `previewTrigger` 仅声明传递，未见触发更新（`App.tsx:48,262`）。
3. [事实] `onImageReady` 在 `NebulaCanvas` 定义但无上层传入（`NebulaCanvas.tsx:17,142`）。
4. [事实] `exportService` 两个导出函数未接入业务路径。
5. [事实] `viewerConfig.environment` 未被 `ModelViewer3D` 消费。
6. [事实] `CompressionSettings.preserveMetadata/maintainAspectRatio` 当前未参与压缩实现。
7. [推断] M3 删除单层时未 revoke 其 URL，存在内存占用累积风险（`deleteLayer` 未处理 URL）。

## H. 优化建议
### 低风险
- [事实] 修复 Nebula 下载扩展名与实际 MIME 对齐。
- [事实] 删除或接通 `previewTrigger/onImageReady`，避免死状态。
- [事实] 为未使用配置字段加注释或补实现（`environment/preserveMetadata/...`）。

### 中风险
- [推断] Photo Framer 导出改为可配置并发（2-3 路）+ 背压，缩短大批量耗时。
- [推断] ModelStudio 引入统一对象释放函数，覆盖删除图层与会话切换。

### 高收益高风险
- [推断] 抽象共享“批处理任务引擎”（进度/取消/错误统一），减少 3 个工具重复实现。

## I. 接手建议
- 新人阅读顺序：
  1. `App.tsx`（系统入口）
  2. `types.ts`（领域对象）
  3. 按目标功能进入对应工具组件
  4. 最后读 service 层
- 改需求优先关注：
  - Nebula：`App.tsx` NebulaTool + `NebulaCanvas.tsx`
  - Framer：`PhotoFramerTool.tsx` + `framerWorker.ts`
  - Model：`ModelStudioTool.tsx` + `ModelViewer3D.tsx` + `threeService.ts`
  - Shrink：`PhotoCompressorTool.tsx` + `compressorService.ts`
- 联调/排障抓手：
  - [事实] 当前主要依赖浏览器控制台日志（无统一埋点平台）。

## J. 证据不足项
- [NEEDS CLARIFICATION] `exportService` 是否未来 Roadmap 功能。
- [待验证] 线上浏览器矩阵与兼容性基线（尤其 iOS MediaRecorder）。
- [待验证] ModelStudio Pro 模式是否有产品级权限逻辑（当前仅 UI 开关）。

---

## K. 阶段摘要包（紧凑版）
- 四大模块均已完成职责/边界/链路重建。
- 关键断链：`exportService` 未接通、`previewTrigger`/`onImageReady` 残留、若干配置未生效。
- 主风险：Nebula 导出格式一致性、three 资源释放、主线程重负批处理。
- 接手入口：`App.tsx` + `types.ts` + 目标模块组件 + 对应 service。
- 下一阶段建议读取目标：`04_System_Flow_Analysis.md`。

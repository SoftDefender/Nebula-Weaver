# 系统级流转分析

## A. 全局流转总览
- [事实] 系统无后端主控，所有业务链路由前端组件状态驱动。
- [事实] 外部交互点仅 Gemini API；其余依赖浏览器 API 与本地文件输入输出。
- [推断] 系统行为关键开关集中在：`currentTool`、`isRecording`、`isExporting`、`isProcessing`、`viewerConfig`。

## B. 关键主链路一（Nebula：图片 -> AI/检测 -> 动画 -> 视频）
### 文字时序图
`用户上传` -> `NebulaTool.handleImageUpload` -> `batchItems`入队 -> `Run AI Analysis`
-> `identifyNebulaFromImage` + `analyzeNebulaImage` + `detectStarsFromImage`
-> `activeItem`更新 -> `NebulaCanvas.drawFrame`循环 -> `isGenerating=true`
-> `captureStream + MediaRecorder` -> `onRecordingComplete` -> 下载。

- 起点：[事实] `App.tsx:89,116`。
- 关键节点：[事实] `geminiService.ts`、`starDetectionService.ts`、`NebulaCanvas.tsx:248-592`。
- 终点：[事实] `App.tsx:261` 下载链接点击。
- 依赖：[事实] Gemini API、MediaRecorder 支持、Canvas 性能。
- 风险点：
  - [事实] 下载扩展名固定 mp4，与实际 MIME 可能不一致。
  - [待验证] 移动端长时导出稳定性。

## C. 关键主链路二（Photo Framer：批量渲染导出）
### 文字时序图
`用户上传多图` -> `images[]` 建立 + 维度异步加载
-> `预览 useEffect` 调 `renderFrame(preview)`
-> `导出开始` -> for 循环逐图 `renderFrame(full)`
-> `直接下载` 或 `JSZip聚合` -> 完成/错误汇总。

- 起点：[事实] `PhotoFramerTool.tsx:133`。
- 关键节点：[事实] `renderFrame(req)`、`AbortController` 取消控制。
- 终点：[事实] 单图下载或 ZIP 下载。
- 依赖：[事实] Canvas/OffscreenCanvas、JSZip、主线程可用时间片。
- 风险点：
  - [推断] 超大图 + 大批量下主线程可能卡顿。
  - [事实] 错误处理以弹窗和列表为主，无结构化遥测。

## D. 关键主链路三（Model Studio：导入 -> 场景注入 -> 组合导出）
### 文字时序图
`导入文件/原语` -> `processImport(new|append)` -> `loadLayer`
-> `threeService.load3DModel/analyzeModel/buildSceneTree`
-> `ModelViewer3D` 根据 `layers` 注入 scene 并应用属性
-> `Export` 构建组合 Group -> `exportToGLB` -> 下载。

- 起点：[事实] `ModelStudioTool.tsx:98-107`。
- 关键节点：[事实] `ModelViewer3D.tsx:111-170` 场景刷新逻辑。
- 终点：[事实] `ModelStudioTool.tsx:238-258`。
- 依赖：[事实] three loaders/exporter、WebGL 能力。
- 风险点：
  - [推断] 对象与 URL 释放路径不统一，长会话可能累积内存。
  - [事实] `environment` 参数未驱动渲染环境变化。

## E. 状态与生命周期分析
- 初始化
  - [事实] `index.tsx` 挂载 `App`；各工具首次进入时初始化局部 state。
- 运行时
  - [事实] 所有链路由用户事件驱动（上传、按钮、滑杆、导出）。
- 更新
  - [事实] useState/useEffect 驱动重渲染；Nebula 动画以 RAF 循环驱动。
- 销毁/清理
  - [事实] 部分模块有 URL revoke/canvas cleanup；`ModelViewer3D` 在卸载时 `renderer.dispose()`。
  - [待验证] 图层删除、异常中断路径的资源释放完整性。

## F. 配置与部署流分析
- 配置流
  - [事实] 构建期 `loadEnv` 读取 `GEMINI_API_KEY` 注入前端变量。
  - [事实] 运行时 UI 配置均存内存，不持久化（无 localStorage）。
- 构建流
  - [事实] `vite build` -> `dist` 静态资源。
  - [事实] 构建警告：chunk > 500k。
- 部署流
  - [事实] 仓库内缺少 CI/CD/平台配置文件。
  - [待验证] 真实生产部署与环境变量管理位置。

## G. 错误处理与观测性分析
- 错误传播
  - [事实] 多数服务在本地 `try/catch`，错误吞吐后写默认值或状态 `error`。
- 统一处理
  - [事实] 无统一错误中间件/上报通道。
- 日志
  - [事实] 主要 `console.error/warn/log`。
- 埋点/监控
  - [事实] 无埋点、无监控、无性能指标采集。
- 调试入口
  - [事实] 依赖浏览器开发者工具 + UI 状态反馈。

## H. 全局风险点
1. [事实] 关键行为开关分散在各组件，缺乏统一任务编排层。
2. [事实] 观测性薄弱，线上问题难回放。
3. [事实] 构建体积大，首屏/弱网体验风险。
4. [推断] 图形与媒体处理集中主线程，复杂任务下卡顿概率高。
5. [事实] 自动化验证缺失，回归风险高。

---

## I. 阶段摘要包（紧凑版）
- 主链路：
  1. Nebula（上传->AI/检测->动画->录制下载）
  2. Framer（上传->预览渲染->批量导出）
  3. Model（导入->场景注入->GLB导出）
- 生命周期：[事实] 事件驱动 + 局部状态，清理逻辑存在但不统一。
- 配置关键开关：[事实] `currentTool/isRecording/isExporting/isProcessing/viewerConfig`。
- 观测性现状：[事实] 控制台级日志，无统一监控。
- 下一阶段建议读取目标：`05_TechDebt_Risk_Optimization.md`。

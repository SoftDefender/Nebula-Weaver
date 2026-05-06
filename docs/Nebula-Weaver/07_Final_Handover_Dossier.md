# Nebula-Weaver 最终交付文档（接手与迭代开发版）

## 1. 项目概览
- [事实] Nebula-Weaver 当前实现是一个前端单仓库多工具工作台，含 4 个子系统：Nebula Weaver、Model Studio、Photo Shrink、Photo Framer。
- [事实] 入口位于 `index.tsx -> App.tsx`，通过 `currentTool` 在子工具间切换。

## 2. 系统目标与边界
- [事实] 目标：在浏览器中完成图像/3D/视频相关处理并直接导出结果。
- [事实] 边界：无后端业务层；仅 Nebula AI 分析依赖 Gemini API。
- [待验证] 生产环境部署平台（Vercel/其他）及密钥注入链路。

## 3. 技术栈与基础设施
- [事实] React 19 + TypeScript + Vite 6。
- [事实] UI 使用 Tailwind CDN（`index.html`）与主题变量。
- [事实] 图形/媒体：three.js、Canvas2D、MediaRecorder、OffscreenCanvas fallback。
- [事实] 外部 SDK：`@google/genai`、`jszip`。
- [事实] 工程现状：无测试、无 CI、无内置监控。

## 4. 目录结构与模块分层
- `App.tsx`：应用壳、工具切换、NebulaTool 编排。
- `components/`：四个工具主组件 + 3D 查看器 + NebulaCanvas。
- `services/`：AI、图像压缩、3D加载/导出、星点检测、装裱渲染、MotionPhoto导出。
- `types.ts`：跨模块数据结构定义。
- [推断] 组织方式为 feature-based + shared services。

## 5. 核心业务能力
1. [事实] Nebula 图片分析与星场动画视频导出。
2. [事实] Photo Framer 批量装裱、导出单图或 ZIP。
3. [事实] Model Studio 多格式 3D 导入、图层编辑、GLB 导出。
4. [事实] Photo Shrink 目标体积压缩与批量下载。

## 6. 核心架构设计
- [事实] 前端单体 + 功能岛（各工具局部状态自治）。
- [事实] 任务编排以组件内部循环和状态机（processing/success/error）实现。
- [推断] 该结构降低初期开发成本，但中长期需要统一任务编排与观测层。

## 7. 关键模块详解
### Nebula Weaver
- [事实] `handleBatchAnalysis` 串行调用 AI 分析与星点检测。
- [事实] `NebulaCanvas.drawFrame` 合成背景、粒子、衍射尖刺；录制走 `captureStream + MediaRecorder`。
- [风险] [事实] 下载名固定 `.mp4` 与实际编码容器可能不一致。

### Photo Framer
- [事实] 预览与导出均复用 `renderFrame`；导出支持取消与错误汇总。
- [推断] 大批量场景仍受主线程渲染瓶颈影响。

### Model Studio
- [事实] 导入后通过 `threeService` 完成加载/分析/树构建，Viewer 按层属性注入场景。
- [风险] [推断] URL/对象释放路径不完全统一，长会话需关注内存。

### Photo Shrink
- [事实] 核心算法为质量二分 + 降尺寸兜底。
- [风险] [事实] `preserveMetadata/maintainAspectRatio` 当前未进入服务逻辑。

## 8. 关键数据流 / 控制流 / 生命周期
- 数据流
  - [事实] 输入为本地文件，输出为下载 blob；Nebula 额外调用 Gemini。
- 控制流
  - [事实] 事件驱动（上传/按钮）+ useEffect/RAF 驱动渲染与处理。
- 生命周期
  - [事实] 组件进入初始化状态；处理中更新进度；卸载时部分资源释放。
  - [待验证] 异常路径资源释放一致性。

## 9. 配置、构建、部署与运行机制
- [事实] `npm run dev/build/preview` 为唯一脚本。
- [事实] `vite.config.ts` 通过 `loadEnv` 注入 Gemini Key。
- [事实] `npm run build` 已通过，但提示 chunk > 500k。
- [待验证] 生产部署平台、域名与环境变量治理策略。

## 10. 外部依赖与集成点
- [事实] Gemini API：`services/geminiService.ts`。
- [事实] 浏览器媒体/图形 API：MediaRecorder、Canvas、WebGL、FileReader。
- [事实] 压缩打包：JSZip。

## 11. 风险、技术债与历史包袱
- [事实] 无测试与 CI，回归风险高。
- [事实] 大包体影响冷启动。
- [事实] 存在未接通能力与残留状态字段（`exportService`, `previewTrigger`, `onImageReady`）。
- [事实] 若前端直接持有 API Key，公网发布存在暴露风险。

## 12. 优化建议与演进路线
- 立即可做
  1. [事实] 修复导出扩展名与 MIME 一致性。
  2. [事实] 清理或接通未生效配置/残留状态。
  3. [事实] 加入最小质量门禁（lint/typecheck/smoke）。
- 中期可做
  1. [推断] 按工具拆包 + 懒加载。
  2. [推断] 抽象统一批处理任务引擎。
  3. [推断] 统一资源释放注册表。
- 长期演进
  1. [推断] 引入后端代理收敛 AI key。
  2. [推断] 接入观测性平台。

## 13. 接手阅读路径
1. `types.ts`（领域对象）
2. `App.tsx`（入口与工具编排）
3. 按目标工具阅读对应 `components/*Tool.tsx`
4. 下钻对应 `services/*.ts`
5. 最后看 `vite.config.ts` / `index.html` / `package.json`

## 14. 修改需求时的影响评估建议
- 修改导出逻辑：优先检查文件名、MIME、下载方式、移动端兼容。
- 修改批处理策略：评估 UI 响应、取消机制、错误汇总一致性。
- 修改 3D 层级逻辑：重点验证父子绑定、scene 注入、导出结构。
- 修改压缩策略：验证不同格式在目标体积下的达成率。

## 15. 排障建议
- Nebula 导出失败：先看 `MediaRecorder` 支持与 `console.error`，再看分辨率/FPS/bitrate。
- Framer 卡顿：先看图片分辨率、批量数量、浏览器内存占用。
- Model 显示异常：检查 loader 成功状态、layer visible/opacity/parentId。
- Shrink 未达目标：检查输出格式（PNG 天然受限）与降尺寸兜底路径。

## 16. 待确认事项与后续补完建议
- [NEEDS CLARIFICATION] 生产部署平台与环境变量治理。
- [待验证] `exportService` 是否纳入正式功能。
- [待验证] 未生效配置字段的业务诉求（环境/元数据/比例等）。
- [待验证] 目标浏览器兼容矩阵（尤其移动端录制）。

---

## 附录A：项目术语表
- BatchItem：Nebula 批处理项。
- Active Layer：Model Studio 当前编辑图层。
- Pro Mode：Model Studio 高级显示/绑定开关（当前无权限系统）。
- RenderRequest：Photo Framer 渲染请求对象。
- targetSizeInKB：Photo Shrink 统一目标体积换算值。

## 附录B：证据索引（模块 -> 关键文件/目录 -> 说明）
- 应用壳
  - `index.tsx`：React 根挂载。
  - `App.tsx`：主页与四工具路由切换。
- Nebula
  - `App.tsx`（NebulaTool）：上传、分析、配置、导出触发。
  - `components/NebulaCanvas.tsx`：动画绘制与录制核心。
  - `services/geminiService.ts`：AI 命名与分析。
  - `services/starDetectionService.ts`：星点检测算法。
  - `services/exportService.ts`：Motion/Live Photo 生成函数（当前未接通）。
- Photo Framer
  - `components/PhotoFramerTool.tsx`：批处理流程、取消、错误汇总。
  - `services/framerWorker.ts`：相框渲染算法与尺寸保护。
- Model Studio
  - `components/ModelStudioTool.tsx`：导入策略、图层状态、导出。
  - `components/ModelViewer3D.tsx`：three 场景生命周期。
  - `services/threeService.ts`：加载器/分析器/导出器。
- Photo Shrink
  - `components/PhotoCompressorTool.tsx`：队列、参数、批处理。
  - `services/compressorService.ts`：压缩求解实现。
- 工程配置
  - `package.json`：脚本与依赖。
  - `vite.config.ts`：env 注入。
  - `index.html`：Tailwind CDN 与主题配置。
  - `tsconfig.json`：TS 编译策略。
- 流程资产（spec-kit）
  - `.specify/`：模板与脚本。
  - `.agents/skills/speckit-*`：技能化流程资产。

---

## 阶段摘要包（终版）
- 项目实态：[事实] 前端多工具工作台（四子系统）。
- 主链路：[事实] 各工具均已形成上传/处理/导出闭环。
- 高风险：[事实] 无自动化质量门禁、观测性薄弱、部分能力断链。
- 接手重点：[事实] 优先修复导出一致性与死配置，再补质量基线。
- 可继续迭代输入：`08_Compact_Context_Pack.md`。

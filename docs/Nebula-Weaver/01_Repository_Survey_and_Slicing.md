# 仓库普查与切片阶段（Nebula-Weaver）

## A. 仓库概览
- [事实] 仓库类型：前端单仓库（SPA），非 Monorepo；核心形态是“多工具聚合控制台”（Nebula/Photo Framer/Model Studio/Photo Shrink）。
  - 证据：`App.tsx:401-407` 多工具路由状态切换；`package.json` 单包结构。
- [事实] 运行模式：纯浏览器端处理 + 外部 Gemini API 调用；无自建后端代码目录。
  - 证据：`services/geminiService.ts:5`；仓库无 `server/`、无 Node 服务入口。
- [推断] 项目来自 AI Studio 模板迁移到 Vite 本地开发。
  - 证据：`README.md` 指向 AI Studio 链接；`index.html` 含 importmap + tailwind CDN；`vite.config.ts` 本地注入 env。

## B. 技术栈清单
- 语言
  - [事实] TypeScript + React JSX（`tsconfig.json`, `*.tsx`）。
- 框架
  - [事实] React 19（`package.json`）。
- 构建工具
  - [事实] Vite 6（`package.json` scripts, `vite.config.ts`）。
- 包管理
  - [事实] npm（存在 `package-lock.json`，脚本为 npm）。
- UI/CSS
  - [事实] Tailwind CDN（运行时注入）+ 少量全局 CSS（`index.html`）。
- 图形/媒体
  - [事实] three.js（3D）+ Canvas2D + MediaRecorder（视频导出）+ OffscreenCanvas fallback（`NebulaCanvas.tsx`, `ModelViewer3D.tsx`, `framerWorker.ts`）。
- AI 与外部服务
  - [事实] `@google/genai`（Gemini 图像识别/分析，`geminiService.ts`）。
- 部署方式
  - [事实] 当前仅见静态前端构建产物 `dist/`；无仓库内平台专用部署配置。
  - [待验证] 是否通过 Vercel Git 同步部署（仓库内无 `vercel.json`，需外部平台项目设置确认）。
- CI/CD
  - [事实] 未发现 `.github/workflows` 等 CI 配置。
- 配置体系
  - [事实] `vite.config.ts` 将 `GEMINI_API_KEY` 注入 `process.env.API_KEY` 与 `process.env.GEMINI_API_KEY`。

## C. 入口与运行链路
- 开发入口
  - [事实] `npm run dev` -> `vite`（`package.json`）。
- 构建入口
  - [事实] `npm run build` -> `vite build`；本地验证成功。
- 生产预览入口
  - [事实] `npm run preview` -> `vite preview`。
- 页面/服务启动入口
  - [事实] `index.tsx` 挂载 `<App />`；`App.tsx` 用 `currentTool` 切换四个工具子系统。
- 主运行链路（高层）
  1. [事实] 用户在首页点击 ToolCard -> `setCurrentTool` -> 渲染对应工具。
  2. [事实] 工具内部以 React state + browser API 驱动（上传、处理、导出）。
  3. [事实] Nebula 场景会调用 Gemini 与星点检测本地算法并驱动 Canvas 渲染。

## D. 目录结构与模块切片

### 切片S1：应用壳与导航编排
- 关注目标：识别系统总入口、子系统挂载方式、全局状态边界。
- 涉及目录/文件：`App.tsx`, `index.tsx`, `types.ts`。
- 重要性：高（所有功能的统一入口）。
- 风险：工具间状态隔离依赖局部状态，后续扩展可能出现跨工具复用成本高。
- 推荐阶段：阶段1/2优先。

### 切片S2：Nebula Weaver（AI + 星场动画 + 视频导出）
- 关注目标：上传->分析->粒子生成->实时渲染->录制导出链路。
- 涉及目录/文件：`App.tsx`(NebulaTool), `components/NebulaCanvas.tsx`, `services/geminiService.ts`, `services/starDetectionService.ts`, `services/exportService.ts`。
- 重要性：最高（项目命名核心能力）。
- 风险：移动端录制稳定性、导出格式一致性、AI依赖可用性。
- 推荐阶段：阶段2/3优先。

### 切片S3：Photo Framer（批量相框渲染）
- 关注目标：预览渲染与批量导出流程、取消机制、内存安全。
- 涉及目录/文件：`components/PhotoFramerTool.tsx`, `services/framerWorker.ts`。
- 重要性：高（批处理路径复杂）。
- 风险：主线程重负、大图 OOM、取消时状态一致性。
- 推荐阶段：阶段3。

### 切片S4：Model Studio（3D 导入/编辑/导出）
- 关注目标：多格式加载、图层属性同步、场景装配、GLB 导出。
- 涉及目录/文件：`components/ModelStudioTool.tsx`, `components/ModelViewer3D.tsx`, `services/threeService.ts`。
- 重要性：高（复杂交互 + three 资源管理）。
- 风险：资源释放不足、层级绑定副作用、大模型性能。
- 推荐阶段：阶段3/4。

### 切片S5：Photo Shrink（批量压缩）
- 关注目标：目标体积求解策略、格式行为、批量下载稳定性。
- 涉及目录/文件：`components/PhotoCompressorTool.tsx`, `services/compressorService.ts`。
- 重要性：中高（常用批处理工具）。
- 风险：PNG/原格式策略偏差、大批量下载体验、元数据语义不一致。
- 推荐阶段：阶段4。

### 切片S6：工程与交付配置
- 关注目标：环境变量、构建策略、部署线索、质量保障缺口。
- 涉及目录/文件：`package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `README.md`, `.gitignore`。
- 重要性：高（决定可维护性与可部署性）。
- 风险：无测试/无CI/大包体预警。
- 推荐阶段：阶段1/4。

## E. 关键配置与部署线索
- [事实] `vite.config.ts`
  - 开发端口 `3000`，host `0.0.0.0`。
  - `GEMINI_API_KEY` 注入为 `process.env.API_KEY` 等。
- [事实] `index.html`
  - 通过 `cdn.tailwindcss.com` 动态配置主题色；非本地 Tailwind 编译链。
- [事实] `package.json`
  - 仅 `dev/build/preview`，无 `test/lint`。
- [事实] `npm run build` 产出单大 chunk：`assets/index-*.js` 约 1.4MB（含 >500k 警告）。
- [待验证] 线上托管平台（Vercel/Netlify）配置不在仓库内。

## F. 初步架构判断
- [事实] 组织方式主要是 feature-based（按工具组件划分）+ shared services。
- [推断] 不属于典型分层后端架构；更接近“前端工具工作台 + 功能岛”。
- [事实] 状态管理主要为组件内 `useState`，无 Redux/Zustand。
- [推断] 该组织方式利于快速迭代单工具 UI，但跨工具能力复用需手动抽象。

## G. 后续分析优先级
1. Nebula 主链路（AI分析、粒子计算、录制导出）
2. Model Studio 的 three 资源生命周期与层级绑定
3. Photo Framer 批量导出稳定性与取消机制
4. Photo Shrink 压缩策略准确性与配置语义
5. 工程化缺口（测试、CI、部署可观测）

---

## H. 阶段摘要包（紧凑版）
- 项目类型：[事实] 前端单仓库 SPA，多工具控制台。
- 技术栈：[事实] React19 + TS + Vite + Tailwind CDN + three + JSZip + Gemini SDK。
- 目录切片：S1应用壳、S2Nebula、S3PhotoFramer、S4ModelStudio、S5PhotoShrink、S6工程配置。
- 核心入口：[事实] `index.tsx -> App.tsx -> currentTool -> 各工具组件`。
- 关键配置：[事实] `vite.config.ts` 注入 Gemini key；`index.html` 内置 Tailwind 配置。
- 优先模块：Nebula > ModelStudio > PhotoFramer > PhotoShrink > 工程化。
- 已知风险：
  - [事实] 无测试/无CI。
  - [事实] 构建包体大于警戒线。
  - [待验证] 实际生产部署平台与运行约束。
- 下一阶段建议读取目标：`02_System_Spec_Reconstruction.md`。

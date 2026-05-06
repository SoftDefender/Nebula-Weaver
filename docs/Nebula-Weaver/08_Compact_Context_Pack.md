# 超紧凑版项目摘要（会话续接投喂版）

## 1) 项目一句话
- [事实] Nebula-Weaver 是一个 React+Vite 前端单仓库“多媒体工具工作台”，包含 Nebula 动画、Photo Framer、Model Studio、Photo Shrink 四个子系统。

## 2) 入口与主结构
- [事实] 启动链：`index.tsx -> App.tsx -> currentTool -> 各 Tool 组件`。
- [事实] 目录核心：`components/`（业务工具）+ `services/`（算法/外部适配）+ `types.ts`（域模型）。
- [推断] 架构形态：feature-based 功能岛 + 共享 service。

## 3) 四大能力（当前代码实态）
- Nebula：[事实] 图片上传 -> Gemini识别/分析 + 本地星点检测 -> Canvas动画 -> MediaRecorder 导出。
- Framer：[事实] 批量图片装裱，预览/导出共用 `renderFrame`，支持 ZIP 与取消。
- Model：[事实] 多格式 3D 导入、图层属性编辑、组合导出 GLB。
- Shrink：[事实] 目标体积压缩（质量二分+降尺寸兜底）。

## 4) 关键外部依赖
- [事实] `@google/genai`（Gemini API）。
- [事实] 浏览器 API：Canvas/WebGL/MediaRecorder/FileReader/Blob URL。
- [事实] `three`, `jszip`。

## 5) 已核实的重要事实
- [事实] `npm run build` 可通过，但存在 >500k chunk 警告（实际约 1.4MB）。
- [事实] 仓库无测试、无 CI、无统一观测。
- [事实] `exportService`（Motion/Live Photo）当前未接入调用链。
- [事实] `previewTrigger`/`onImageReady`/`environment`/`preserveMetadata` 等有未生效或残留点。
- [事实] Nebula 下载文件名固定 `.mp4`，可能与实际 MIME 不一致。

## 6) 高价值风险（接手优先）
1. [高] 无质量门禁（测试/CI缺失）。
2. [高] 观测性薄弱（仅 console）。
3. [中] 导出格式一致性缺陷（Nebula）。
4. [中] 配置与代码断链（未接通能力/残留字段）。
5. [中] 图形与批处理主线程压力（大图/大批量场景）。

## 7) 建议执行顺序
- 立即（低风险）
  1. 修复 Nebula 导出扩展名与 MIME 映射。
  2. 清理或接通残留字段与未生效配置。
  3. 加最小 `lint + typecheck + smoke`。
- 中期
  1. 工具级懒加载分包。
  2. 抽象统一批处理任务引擎（进度/取消/错误）。
  3. 统一资源释放路径。
- 长期
  1. AI key 走服务端代理。
  2. 建立前端观测体系。

## 8) 接手阅读最短路径
1. `types.ts`
2. `App.tsx`
3. 目标工具组件（`components/*Tool.tsx`）
4. 对应服务层（`services/*.ts`）
5. `vite.config.ts` / `index.html` / `package.json`

## 9) 当前待确认项
- [NEEDS CLARIFICATION] 线上部署平台与 env 管理（Vercel/其他）。
- [待验证] `exportService` 是否纳入正式 roadmap。
- [待验证] 目标浏览器兼容矩阵（移动端录制尤需确认）。

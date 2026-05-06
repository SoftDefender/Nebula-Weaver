# Nebula-Weaver 性能与架构优化审计（2026-04-13）

## 1. 工作流基线（three-man-team + spec-kit）

- Architect 阶段（Spec）
  - 目标：降低首屏负担、降低渲染热路径开销、保持功能一致性。
  - 约束：不回退现有业务功能；保持现有 `npm test / build / audit:full` 可通过。
- Builder 阶段（Plan + Implement）
  - 执行：按“低风险高收益 -> 中风险重构”顺序落地。
  - 门禁：每步改动后执行最小回归，阶段结束执行全量回归。
- Reviewer 阶段（Analyze + Checklist）
  - 验证：单测、构建、审计脚本、输出包体对比、关键链路稳定性。

---

## 2. 代码事实与痛点

### [事实] 构建包体和首屏负担
- 改造前构建输出存在单大包：`dist/assets/index-*.js` 约 1.2MB（未 gzip）。
- 首屏路由会同步包含多个重型工具与依赖，导致首页初始化成本偏高。

### [事实] Gemini SDK 加载路径
- `services/geminiService.ts` 之前静态 `import @google/genai`，即使未触发 AI 分析也会被打入主链路。

### [事实] NebulaCanvas 渲染热点
- 预览状态每帧 `setPlaybackProgress`，导致 React 高频 re-render。
- 粒子循环中每粒子频繁调用星芒 sprite 生成/查询逻辑，存在额外调用和字符串缓存键开销。

### [事实] ModelViewer3D GPU 压力点
- 渲染器像素比直接使用 `window.devicePixelRatio`，高 DPI 设备负担高。
- 图层更新 effect 依赖较宽，配置变更会触发较重的图层遍历逻辑。

### [推断] 用户体感问题来源
- 首屏慢 + 部分操作卡顿，主要来自“重依赖预加载 + 渲染循环状态更新过频 + 高 DPI GPU 压力”。

---

## 3. 本次优化方案（已执行）

### A. 架构/加载链路优化
1. 工具页面按需懒加载（`React.lazy + Suspense`）
   - `PhotoFramerTool` / `ModelStudioTool` / `PhotoCompressorTool` 改为按需加载。
2. Gemini SDK 延迟加载
   - `geminiService` 改为动态 `import('@google/genai')`，仅在存在 key 且真正调用 AI 时加载。
3. Vite 手工分包
   - `three`、`@google/genai`、`jszip` 分离 vendor chunk，提升缓存与按需加载收益。

### B. 渲染/计算路径优化
1. NebulaCanvas 预览循环降重渲染
   - 预览进度从“每帧状态更新”改为“ref 驱动 + 节流提交 UI 状态”，降低 React 提交频率。
2. NebulaCanvas 粒子绘制优化
   - 默认 sprite 复用；颜色 sprite 使用帧内缓存，减少循环内重复调用与缓存键计算。

### C. 3D 渲染器优化
1. 像素比上限
   - `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`，避免高 DPI 过载。
2. 配置流与图层流分离
   - 将图层重建与配置更新逻辑拆分，减少无关配置变更引发的重成本路径。

---

## 4. 改动覆盖面与风险评估

### 涉及文件
- `App.tsx`
- `services/geminiService.ts`
- `components/NebulaCanvas.tsx`
- `components/ModelViewer3D.tsx`
- `vite.config.ts`

### 风险点
- 懒加载引入异步边界：已通过 `Suspense` fallback 缓释。
- 预览进度节流后 UI 时间轴刷新频率降低：对交互准确性无影响，主要改善性能。
- 手工分包策略需要持续观察未来新增依赖：已保持最小规则集（three/genai/jszip）。

---

## 5. 回归验证

### 执行结果
- `npm run test`：11 files / 37 tests 全通过。
- `npm run build`：通过，产物按 chunk 拆分。
- `npm run audit:full`：6/6 步骤全通过（phase2/4/5 + test + typecheck + build）。

### 关键链路结果
- 首页 -> 各工具页切换正常。
- Nebula 导出链路回归通过（审计脚本中默认导出/降级兼容/故障恢复均通过）。
- Model Studio 压测与层级操作链路通过。

---

## 6. 包体对比（关键指标）

### [事实] 改造前
- 主包约 `1,202.54 kB`（单一主 chunk）。

### [事实] 改造后
- 主入口 `index-*.js` 约 `249.51 kB`。
- 大依赖分离为独立 chunk：
  - `vendor-three` ~725.39 kB
  - `vendor-genai` ~284.75 kB
  - `vendor-jszip` ~97.15 kB

### [推断] 结果意义
- 首页主链路负载显著下降，首屏解析/执行压力明显降低。
- 非当前工具不再同步阻塞初始化，工具切换时按需加载。

---

## 7. 后续建议（下一轮）

### 低风险
1. 对 `NebulaCanvas` 增加“每帧耗时采样开关”日志（仅开发态）。
2. 为 `geminiService` 增加“动态加载成功/失败”单测桩。

### 中风险
1. 将 `NebulaTool` 从 `App.tsx` 进一步拆分为独立路由模块，实现首页更彻底瘦身。
2. 对 `starDetectionService` 引入 Worker 化，降低主线程阻塞。

### 高风险（需专项验证）
1. 视频导出链路做离屏/分段编码实验（兼容差异较大，需要独立回归矩阵）。

---

## 8. 审计结论

- [事实] 本轮改造实现了首屏包体和加载路径优化、渲染循环降频优化、3D 渲染器压力优化。
- [事实] 自动化回归（test/build/audit）均通过，无新增明显功能回归。
- [推断] 当前版本在“可读性、加载性能、渲染性能、架构合理性”上较改造前有实质提升。
- [待验证] 大尺寸真实素材在不同 GPU/浏览器下的导出极限表现，建议补充专项矩阵测试。

---

## 9. 第二阶段增量优化（NebulaTool 懒加载 + StarDetection Worker）

### [事实] 结构优化
- `NebulaTool` 已从 `App.tsx` 拆分到 `components/NebulaTool.tsx`，首页只保留导航壳层。
- `App` 现在对四个工具都使用 `React.lazy`，实现统一按需加载。

### [事实] Star Detection Worker 化
- 将星点检测核心算法抽离到 `services/starDetectionCore.ts`（纯计算函数）。
- 新增 `services/starDetectionWorker.ts` 承载 worker 端计算。
- `services/starDetectionService.ts` 改为：
  - 主线程负责图像解码与像素帧构建；
  - worker 执行重型像素循环；
  - worker 异常/超时自动回退到主线程纯函数计算；
  - 保留原行为一致性（阈值、局部极值、颜色映射、粒子生成规则）。

### [事实] 新增测试
- 新增 `tests/starDetectionCore.spec.ts`，覆盖：
  - 非法尺寸空结果；
  - 局部极亮点识别与归一化坐标；
  - RGB -> Hex 映射正确性。

### [事实] 构建表现
- 构建产物新增独立 worker chunk：`starDetectionWorker-*.js`。
- 首页入口继续瘦身（本轮构建中 `index-*.js` 约 206k）。

### [事实] 回归结果
- `npm run test`：12 files / 40 tests 通过。
- `npx tsc --noEmit`：通过。
- `npm run build`：通过。
- `npm run audit:full`：6/6 全通过。

### [推断] 增益
- Nebula 复杂逻辑不再阻塞首页加载链路。
- 星点检测的主线程阻塞显著下降，交互流畅性在中高分辨率素材下更稳。

### [待验证]
- 不同浏览器对 Worker 与主线程回退路径的耗时差异仍建议补一轮实际设备矩阵（Windows + macOS + Android）。

## 10. 第三阶段增量优化（核心循环降本 + 运行时调参 + 基准审计）

### [事实] 核心循环优化
- `starDetectionCore` 新增可调参接口 `StarDetectionTuning`，并保持默认参数与原行为兼容。
- 关键热路径改动：
  - 将 `Math.floor(x / blockSize)` 与 `Math.floor(y / blockSize)` 改为预计算查找表（`gxByX/gyByY`）；
  - 扫描与背景估计循环中复用行偏移，减少重复乘法和索引计算。

### [事实] 运行时配置能力
- 新增 `starDetectionConfig`：支持默认值、URL 查询参数覆盖、`localStorage` 持久覆盖。
- 支持参数：
  - `analysisWidth`
  - `workerTimeoutMs`
  - `forceMainThread`
  - `telemetry`
  - `blockSize/backgroundStride/scanStep/thresholdSigma/sampleStep`
- `starDetectionService` 已接入配置，并在 `telemetry=true` 时输出结构化性能日志。

### [事实] Worker 协议升级
- worker 请求新增 `tuning` 字段，主线程可将调参方案直接下发给 worker。

### [事实] 可执行性能基准
- 新增 `vitest bench` 基准：`tests/starDetectionCore.bench.ts`
- 新增脚本：
  - `npm run perf:star-detection`
  - `npm run audit:phase9`

### [事实] 本地基准结果（本次运行）
- default tuning：约 `115.43 hz`，mean `8.6632 ms`
- aggressive tuning：约 `147.33 hz`，mean `6.7873 ms`
- 相对结果：`aggressive ~1.28x faster`

### [事实] 回归结果
- `npm run test`：13 files / 42 tests 通过。
- `npx tsc --noEmit`：通过。
- `npm run build`：通过。
- `npm run audit:full`：6/6 全通过。

### [推断]
- 在不改变系统主业务链路的前提下，星点检测模块已具备“按场景调参 + Worker 优先 + 回退兜底 + 可量化基准”能力，后续可持续迭代优化而不依赖一次性重构。

### [待验证]
- Aggressive tuning 对极暗噪声图/超高动态范围图的误检率影响需做样本集对照。

## 11. 第四阶段增量优化（Phase9 自动化接入 Audit Full）

### [事实] 自动化能力补齐
- 新增 `scripts/audit/phase9-star-detection-perf.mjs`：
  - 自动执行 `npm run perf:star-detection`
  - 默认执行 3 轮采样（可通过 `AUDIT_PHASE9_RUNS` 覆盖）
  - 解析 benchmark 结果（default/aggressive 的 hz/min/max/mean）
  - 解析 `x faster` 速度比
  - 产出工件：`audit_phase9_star_detection_perf.json`（包含 runs + aggregated）
- `package.json` 中 `audit:phase9` 已切换为上述脚本，`perf:star-detection` 保留为独立基准入口。
- `scripts/audit/run-full-audit.mjs` 已纳入 `audit:phase9` 步骤，并把 `phase9` 工件写入 `artifacts`。

### [事实] 全链路验证结果
- `audit:phase9` 单独执行通过，性能指标可解析并落盘。
- `audit:full` 执行通过，步骤从 6 项提升为 7 项（新增 phase9），总报告包含 phase9 工件。
- 当前口径使用 `medianSpeedupFactor` 作为聚合值，降低单次抖动影响。

### [推断]
- 现在性能优化已从“人工跑命令”升级到“可重复、可归档、可并入总门禁”的工程化流程，便于后续版本做横向对比。

### [待验证]
- CI 环境中（不同 CPU 频率策略）bench 波动较大时，需引入 rolling median 或多轮均值聚合规则，避免误判。

## 12. 第五阶段增量优化（ModelStudio 10+层长期压力审计）

### [事实] phase5 覆盖面扩展
- `scripts/audit/phase5-stability-stress.mjs` 新增 `modelStudioLargeHierarchyLongRun` 检查：
  - 默认 12 层（可通过 `AUDIT_MODEL_LAYERS` 调整）
  - 默认 60 次组合操作（可通过 `AUDIT_MODEL_OPS` 调整）
  - 断言项：父引用有效、无自指、无环、操作时延阈值
- 时延阈值支持环境变量：
  - `AUDIT_MODEL_OP_MEAN_MAX_MS`（默认 900）
  - `AUDIT_MODEL_OP_P95_MAX_MS`（默认 1800）

### [事实] 本轮验证结果
- `npm run audit:phase5`：通过  
  `operationsExecuted=60`, `meanOpMs=362.53`, `p95OpMs=605`, `acyclic=true`, `ok=true`
- `npm run audit:full`：通过（7/7），并已聚合新的 phase5 检查结果。

### [推断]
- ModelStudio 在中高复杂度层级下已具备“长期操作一致性 + 基础时延门禁”的可复验能力，回归质量由“功能可用”提升为“语义+性能双约束”。

### [待验证]
- 真实重模型（非 primitive）在 10+ 层场景下的时延曲线与内存曲线，需补充素材级压力基准。

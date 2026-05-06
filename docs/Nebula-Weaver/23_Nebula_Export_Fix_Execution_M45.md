# 23 - Nebula 导出修复执行记录（M45 场景）

## 目标
将 M45 大图导出异常根因方案落地到代码，并完成本地编译与回归验证。

## 一、执行修复

### 1) 主根因修复：移除 timeslice 录制
- 文件：`components/NebulaCanvas.tsx`
- 变更：`MediaRecorder.start(200)` -> `MediaRecorder.start()`
- 目的：避免 WebM duration 元数据异常（infinite）导致播放器识别/时长错误。

### 2) 高像素 MP4 稳定性修复
- 文件：`services/nebulaRecording.ts`
- 新增：
  - `chooseEffectiveExportFormat`：`mp4 + 高像素` 自动降级为 `webm`
  - `applyHighPixelRecordingTuning`：高像素场景自动收敛到更稳的 fps/bitrate（24fps / 8Mbps 上限）
- 文件：`components/NebulaCanvas.tsx`
- 集成以上策略并输出日志（兼容性降级与稳定性调优）。

### 3) 默认导出策略优化
- 文件：`App.tsx`
- 变更：默认导出分辨率 `original` -> `1080p`
- 目的：大图用户默认导出稳定性优先。

### 4) 测试增强
- 文件：`tests/nebulaRecording.spec.ts`
- 新增 4 个测试：
  - 高像素 mp4 降级策略
  - 高像素参数调优策略

## 二、验证结果

### A. M45 实测自动化验证（`H:\ExportIMG\M45-8h.jpg`）
1. `default_export`（默认 1080p/webm）：
- 下载成功
- MIME: `video/webm;codecs=vp9`
- duration: `finite`（约 6.46s）

2. `original_webm`：
- 下载成功
- duration: `finite`（约 6.30s）

3. `original_mp4_selected`：
- 下载成功
- 自动安全回退为 `webm` 产物
- duration: `finite`（约 6.27s）

### B. 编译与测试
- `npm run test -- tests/nebulaRecording.spec.ts`：通过（15 tests）
- `npm run build`：通过
- 本地部署检查：`npm run dev -- --host 127.0.0.1 --port 4173 --strictPort` 可正常监听 4173 端口
- `npm run audit:phase4`：通过
- `npm run audit:phase5`：通过
- `npm test`：通过（39 tests）
- `npm run audit:full`：通过（phase2/4/5 + test + typecheck + build）

## 三、结论
- M45 场景下，“导出 2s / 识别异常 / 黑屏”主链路已被命中修复。
- 高像素 `mp4` 场景已增加自动稳定性降级，避免导出链直接失败。
- 当前修复优先保证“可播放、可识别、稳定导出”，格式偏好由稳定性策略兜底。

## 四、后续建议
- 若后续要强制保障 `mp4 original`，需引入更重编码方案（WebCodecs/muxer 或服务端编码），不建议在当前轻量前端链路直接承诺。

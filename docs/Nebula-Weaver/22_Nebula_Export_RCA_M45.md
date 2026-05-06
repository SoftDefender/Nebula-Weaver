# 22 - Nebula 导出异常（M45-8h.jpg）RCA 与修复方案评估

## A. 本轮目标
基于用户实测文件 `H:\ExportIMG\M45-8h.jpg`（4732x3593）复现并定位导出异常（2s/不可播放/卡顿/黑屏/无法识别），产出可执行修复方案与改动覆盖面评估。

## B. 复现与证据采集方式
1. [事实] 本地图像元数据采集（PowerShell）
2. [事实] Playwright 自动化导出场景复现（`original/1080p/4k + webm/mp4`）
3. [事实] 浏览器内导出 Blob 可解码性检查（`video.onloadedmetadata + seek + 帧采样`）
4. [事实] 定向 A/B 验证：
   - `MediaRecorder.start(200)`（当前实现）
   - `MediaRecorder.start()`（去掉 timeslice）

## C. 关键事实
### C1 图像输入事实
- [事实] 文件大小：`7,461,810 bytes`
- [事实] 分辨率：`4732 x 3593`（约 17MP）

### C2 多场景导出复现（当前代码）
- [事实] `original + webm + 30fps + 12Mbps`：可下载，Blob 可解码，**duration 非有限值（infinite）**。
- [事实] `1080p + webm + 30fps + 12Mbps`：可下载，Blob 可解码，**duration 非有限值（infinite）**。
- [事实] `4k + webm + 30fps + 12Mbps`：可下载，Blob 可解码，**duration 非有限值（infinite）**。
- [事实] `original + mp4 + 30fps + 12Mbps`：导出失败，浏览器控制台出现 `MediaRecorder Error: ErrorEvent`，无下载。
- [事实] `1080p + mp4 + 24fps + 6Mbps`：可下载，duration 有限（约 6.49s）。

### C3 决定性对照实验
- [事实] 在相同 webm 场景下：
  - 使用 `MediaRecorder.start(200)`：video duration 为 infinite（非有限）。
  - 使用 `MediaRecorder.start()`：video duration 为 finite（约 6.41s）。
- [推断] 你反馈的“导出 2s/无法识别/播放器异常”与 webm duration 元数据异常高度相关。

## D. 根因递归分析
### 根因 R1（主根因）：WebM 录制开启方式导致 duration 元数据异常
- 现象：导出文件在部分播放器中显示 2s、时长异常或识别异常。
- 直接原因：[事实] 当前实现调用 `recorder.start(200)`（timeslice），在 Chromium 环境下容易生成 duration 非有限值的 WebM。
- 深层原因：[推断] 该实现为“频繁 flush 分片”的稳定性优化而引入，但对容器元数据完整性产生副作用。
- 根因结论：[事实] `start(200)` 是当前异常的可复现根因。

### 根因 R2（高概率次根因）：MP4 在高分辨率原图导出不稳定
- 现象：mp4 导出失败、无文件或生成异常文件。
- 直接原因：[事实] `original(4732x3593) + mp4` 直接触发 MediaRecorder runtime error。
- 深层原因：[推断] `isTypeSupported(mp4)` 通过不等于“在该分辨率/码率组合下稳定编码”。
- 根因结论：[事实] mp4 在高分辨率导出链路缺少可靠性降级机制。

### 根因 R3（体验放大因子）：默认使用 original 分辨率导出高像素输入
- 现象：卡顿、导出不稳定概率上升。
- 直接原因：[事实] 大图输入时默认保留原始分辨率录制。
- 深层原因：[推断] 对高像素输入缺少“稳定优先”的默认策略（分辨率/帧率/码率约束）。
- 根因结论：[推断] 该策略会放大 R1/R2 的外显故障概率。

## E. 方案候选与覆盖面评估

### 方案 A（建议立即执行，低风险）
1. 将 `MediaRecorder.start(200)` 改为 `MediaRecorder.start()`。
2. 保留现有 `ondataavailable` 收集逻辑，停止时统一封装 Blob。
3. 对导出完成后增加 duration 有限性检查（在浏览器可行范围内）。

覆盖面：
- 组件：`components/NebulaCanvas.tsx`
- 服务：`services/nebulaRecording.ts`（可增加“输出完整性检查”辅助）
- 测试：新增 Playwright 回归（验证 duration finite）

风险：
- [推断] 内存占用相对 timeslice 模式上升（但当前默认 6s 时长可控）。

预期收益：
- [推断] 直接消除 webm 时长异常，显著降低“2s/不可识别”问题。

### 方案 B（建议近期执行，中风险）
1. 引入“导出前可行性降级策略”：
   - 当 `format=mp4 && resolution=original && 像素>8MP`，自动降级到 `1080p` 并提示。
2. 在 mp4 运行时 error 后自动 fallback 到 webm（同参数或降级参数）。
3. 记录导出失败原因到 UI（toast/log panel），避免静默失败。

覆盖面：
- `App.tsx`（UI 与提示）
- `components/NebulaCanvas.tsx`（fallback 状态机）
- `services/nebulaRecording.ts`（降级决策）

风险：
- [推断] 自动降级会改变用户预期输出（清晰度/格式）。
- [推断] 需要明确提示与文件命名一致性。

预期收益：
- [推断] 显著降低 mp4 高分辨率导出失败率。

### 方案 C（可选长期演进，高成本）
1. 对 WebM 注入准确 duration 元数据（引入 webm 元数据修复库）。
2. 或引入更稳定编码链（WebCodecs + muxer / wasm 编码）。

覆盖面：
- 新增依赖 + 导出管线重构 + 回归矩阵扩展。

风险：
- [推断] 包体积、复杂度、浏览器兼容维护成本显著上升。

## F. 推荐实施路径（合理方案）
### Phase 1（立即）
- 落地方案 A：去掉 timeslice，修复 webm duration 元数据异常主因。
- 回归门禁：
  - `M45-8h.jpg` 导出 webm，duration 必须为 finite；
  - 文件可在浏览器完成 metadata + seek 解码；
  - `audit:phase4`、`audit:phase5` 通过。

### Phase 2（近期）
- 落地方案 B：mp4 高分辨率自动降级 + runtime fallback + 错误可视化。
- 回归门禁：
  - `original+mp4` 在大图输入不再静默失败；
  - fallback 后一定有可播放产物。

### Phase 3（评估后）
- 若仍有播放器兼容投诉，再评估方案 C。

## G. 仍需确认项
- [待验证] 用户本地“无法识别”的具体播放器（Windows 电影与电视 / VLC / PR / 剪映），不同解码器行为不同。
- [待验证] 长时长（>20s）导出在 `start()` 模式下的内存边界。
- [待验证] 用户设备 GPU/CPU 型号对 `original+mp4` 的失败阈值。

## H. 结论
- [事实] 当前导出异常存在明确根因，不是单一“前端 UI”问题。
- [事实] 主根因为 WebM 录制使用 `start(200)` 触发 duration 元数据异常；次根因为 mp4 在高分辨率原图下运行时不稳定。
- [推断] 按“先 A 后 B”的分阶段修复可在较低风险下显著改善你反馈的问题，并保持可回归验证。

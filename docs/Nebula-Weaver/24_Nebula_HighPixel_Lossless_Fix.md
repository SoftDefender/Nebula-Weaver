# 24 - Nebula 高像素无损约束修复执行记录

## 背景
在上一轮稳定性修复基础上，新增约束：高像素场景必须保证画质无损（不降分辨率）与码率无损（不自动降码率）。

## 本轮修复项

### 1) 取消高像素自动码率改写
- 变更文件：`services/nebulaRecording.ts`
- 动作：移除高像素码率强制改写逻辑（不再自动将 bitrate 提升/重写到固定值）。
- 结果：导出使用用户配置码率（桌面端不再自动降码率）。

### 2) 保留原始像素尺寸（不再偶数向下取整）
- 变更文件：`components/NebulaCanvas.tsx`
- 动作：尺寸归整从 `Math.floor(.../2)*2` 改为 `Math.round`（最小 2），避免高像素图被 1px 裁切。
- 结果：`4732x3593` 这类输入导出保持原尺寸。

### 3) 保留主根因修复
- 继续保持 `MediaRecorder.start()`（无 timeslice），避免 WebM duration 异常。

### 4) 测试同步
- 变更文件：`tests/nebulaRecording.spec.ts`
- 更新：删除不再存在的高像素码率改写测试，保留并强化“桌面不自动降码率”断言。

## 实测验证（M45-8h.jpg）
输入：`H:\ExportIMG\M45-8h.jpg`（4732x3593）

- `original_webm`：
  - 导出成功
  - 输出分辨率：`4732x3593`（原始像素保留）
  - duration：finite（约 6.38s）
  - 录制 options bitsPerSecond：`40000000`（无自动降码率）

- `original_mp4_selected`：
  - 导出成功（高像素 mp4 自动回退到 webm 容器，但不降分辨率/码率）
  - 输出分辨率：`4732x3593`
  - duration：finite（约 6.30s）
  - 录制 options bitsPerSecond：`40000000`

## 构建与回归
- `npm run test -- tests/nebulaRecording.spec.ts`：通过（13 tests）
- `npm run build`：通过
- `npm run audit:phase4`：通过
- `npm run audit:phase5`：通过
- `npm test`：通过（37 tests）
- `npm run audit:full`：通过
- 本地部署检查：`npm run dev -- --host 127.0.0.1 --port 4173 --strictPort` 监听成功

## 结论
当前版本已满足“高像素无损优先”约束：
1. 不自动降分辨率（保持原始像素输出）
2. 不自动降码率（保持用户/策略设置码率）
3. 保留无 timeslice 录制，规避 duration 元数据异常

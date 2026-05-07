# Neon Ridge GP — 進階改善設計

**日期：** 2026-05-07
**定位：** 個人 Indie Web Game，純樂趣與技術探索，無商業化需求

---

## 目標

令遊戲從 MVP 進化成有深度、可反覆遊玩的完整作品，分四個里程碑交付，每個里程碑獨立可玩。

---

## 架構原則

- `CarEntity` interface 在整個計劃中保持不變，`game.ts` 的 game loop 零修改
- Ghost 和 AI 共用同一個 `DriverInterface`（輸出 position / heading / speed），令兩者能用相同渲染邏輯
- 賽道資料抽成 `TrackConfig` object，加賽道只需換 config，不動渲染代碼

```
DriverInterface
  ├─ RapierCar      (玩家，M1)
  ├─ GhostCar       (回放錄影，M2)
  └─ AIDriver       (電腦對手，M3)
```

---

## M1：Rapier 動態車體物理

### 問題

現有 `PrimitiveCar` 直接積分速度與航向，`resolveTrackBoundary()` 用幾何投影硬推車回賽道。操控感偏假，撞牆無物理反應。

### 設計

`src/entities/car.ts` 內部換成 `RapierCar`，外部 `CarEntity` interface 不變。

**結構：**
```
RapierCar
  ├─ RAPIER.RigidBody（dynamic）      — 車身物理體
  ├─ DynamicRayCastVehicleController — Rapier 內建懸掛 + 輪子
  └─ CarVisual（沿用現有 Three.js mesh）
```

**每幀流程：**
1. 玩家 input → `engineForce` / `steeringAngle` → controller
2. `world.step()` 後讀取 `rigidBody.translation()` + `rigidBody.rotation()`
3. 同步至 Three.js group position / quaternion

**懸掛參數（四輪）：**
- 懸掛靜止長度：0.55m
- 剛性：22，阻尼：2.4
- 後輪驅動，前輪最大轉向角：±0.52 rad
- 最高引擎力：1800N，制動力：2400N

### 飄移系統

飄移是核心操控爽快感，透過降低後輪側向摩擦實現：

**物理：**
- 後輪側向摩擦係數正常：1.0，飄移中：0.28
- 按住 `Space`（手煞車）觸發飄移：後輪摩擦瞬降，前輪保持抓地
- 放開手煞車後摩擦以 lerp 速率 4.0 回復，避免突兀接地感

**視覺回饋：**
- 飄移中：現有 `speedStreaks` 擴大 + 顏色轉橙紅
- 輪胎煙霧：`MeshBasicMaterial` 半透明白色方塊，從後輪位置向後漂移消散（粒子數 ≤ 12，效能優先）
- 飄移角度 > 25°時 HUD 閃 `DRIFT!`（橙色）

**按鍵：** `Space` = 手煞車，與現有 WASD 組合使用

**移除：** `resolveTrackBoundary()` 及 `constrainToTrack()`——改由 Rapier wall colliders 負責邊界。

**唯一對外改動：** `createCar(world: RAPIER.World)`，`game.ts` 傳入 `physics.world`。

---

## M2：Ghost Lap + 本機排行榜

### Ghost 錄製

- 每幀錄 `{ x, z, heading, t }`（t = 本圈秒數）
- 圈完成後壓縮（每 3 幀取 1 樣）
- 只保留最佳圈，存入 `localStorage` key `neon-ridge.ghost`

### Ghost 回放

- `GhostCar` 實作 `DriverInterface`，按時間戳線性插值 position / heading
- 驅動半透明版本的現有 car mesh（opacity 0.45，neon 藍色調）
- Ghost 不參與 Rapier 物理，純視覺

### 本機排行榜

- `localStorage` key `neon-ridge.leaderboard`，存最多 10 筆（圈速 + 日期）
- HUD 新增可摺疊側邊面板，按 `Tab` 鍵切換顯示 / 隱藏

---

## M3：AI 對手

### 路徑追蹤

- 沿用 track `centerLine` 的 Catmull-Rom 曲線（已有 `buildTrackSamples()`）
- Pure pursuit：AI 取車前方 8m 的曲線目標點作為轉向目標
- 轉向輸出 clamp 至 ±1（映射到 `InputState.steerLeft / steerRight`）

### 速度控制（Rubber-band）

- 玩家領先 > 5m：AI 速度倍率 1.10
- 玩家落後 > 5m：AI 速度倍率 0.85
- 其他：1.00
- 倍率透過調整 `engineForce` 實現

### 實作

- `AIDriver` 實作 `DriverInterface`，輸出 `InputState` 給 `RapierCar`
- AI 車與玩家車使用完全相同的 `RapierCar` 物理，確保公平
- 同場最多 2 台 AI（效能考量）
- 出發位置：玩家後方 8m / 16m

---

## M4：第二賽道 + 音效

### 賽道系統重構

**新增 `TrackConfig`：**
```ts
interface TrackConfig {
  readonly name: string;
  readonly centerLine: readonly Vector2[];
  readonly roadWidth: number;
  readonly unlocked: boolean;
}
```

- `createTrack(config: TrackConfig)` 接受任意 config
- 第二賽道：城市街道主題，較窄（roadWidth 22），更多急彎（10 個 centerLine 點）
- 解鎖條件：在第一賽道完成任意一圈（`localStorage` 有圈速記錄即解鎖）
- 主選單畫面：賽道選擇 + 各賽道最佳圈速顯示

### 音效

純 Web Audio API 合成，零音頻資產：

| 音效 | 實作 |
|------|------|
| 引擎聲 | `OscillatorNode`（sawtooth），頻率 = 80 + speed × 3.2 Hz |
| 輪胎摩擦 / 飄移 | `OscillatorNode`（白噪音），飄移中 gain 大幅拉高，形成刺耳尖叫聲 |
| 撞牆 | 白噪音短促 burst（80ms） |
| 過 checkpoint | 短促上升音調（200ms） |

---

## 里程碑交付順序

```
M1（物理）→ M2（Ghost + 排行榜）→ M3（AI）→ M4（賽道 + 音效）
```

每個里程碑 commit 一次，確保 git history 清晰。

---

## 不在範圍內

- 後端 / Supabase（本機 localStorage 已足夠個人使用）
- 付費 / 廣告 / 帳號系統
- 行動裝置觸控操控
- 多人連線

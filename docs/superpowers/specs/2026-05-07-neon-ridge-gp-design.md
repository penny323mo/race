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
- `Vector2 {x, z}` 升級為 `TrackPoint {x, y, z}`，讓 centerLine 支援高低差；車輛位置仍用 `Vector2`（只需 XZ 平面定位）

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

- 每幀錄 `{ x, y, z, heading, t }`（t = 本圈秒數，y 支援高低差賽道回放）
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

**類型升級（`src/types.ts`）：**
```ts
// 新增，用於賽道 centerLine
export interface TrackPoint {
  readonly x: number;
  readonly y: number;   // 高度，平地賽道全填 0
  readonly z: number;
}

// TrackConfig 取代舊的 centerLine: Vector2[]
interface TrackConfig {
  readonly name: string;
  readonly centerLine: readonly TrackPoint[];
  readonly roadWidth: number;
  readonly unlockCondition: 'always' | 'complete-track-1';
}
```

**`buildTrackSamples()` 升級：**
- `new THREE.Vector3(p.x, p.y, p.z)` — Y 值直接傳入，CatmullRomCurve3 自動平滑插值高低差
- 賽道 ribbon 頂點的 Y 跟隨 spline 的 Y，而非固定 0

**地面 collider 升級（M1 先用平地）：**
- M1：在 Rapier world 加一個靜態平面 collider（`ColliderDesc.halfspace`），支撐車輛懸掛射線
- M4 有坡度賽道：從 track ribbon mesh 的頂點建立 `TriMeshCollider`，精確貼合賽道表面

**兩條賽道設計：**

| | Neon Ridge（原有，飄移化改造） | Canyon Run（新賽道） |
|---|---|---|
| 主題 | 夜間賽道，大幅加寬 | 山谷峽谷，明顯高低差 |
| roadWidth | 34m（原 28m → +6m 增加飄移空間） | 30m |
| centerLine 點數 | 8（重新調整彎道形狀） | 11 |
| 高低差 | 全平（y=0） | -4m 至 +10m |
| 飄移特性 | 長掃彎 × 3、髮夾彎 × 1、長直路 × 2 | 下坡掃彎 × 2、山頂髮夾、谷底長彎 |
| 解鎖條件 | 始終開放 | 完成 Neon Ridge 任意一圈 |

**Canyon Run centerLine（草稿，可調整）：**
```
{ x:  0,  y:  0, z: 70 }   ← 起點（平地）
{ x: 50,  y:  2, z: 52 }   ← 右掃彎入口，微升
{ x: 78,  y:  8, z: 10 }   ← 上坡直路頂
{ x: 72,  y: 10, z:-30 }   ← 山頂髮夾彎
{ x: 38,  y:  7, z:-58 }   ← 下坡右彎
{ x: -8,  y:  2, z:-72 }   ← 谷底入口
{ x:-50,  y: -4, z:-55 }   ← 最低點長彎
{ x:-76,  y: -1, z:-12 }   ← 谷底出口，左掃彎
{ x:-68,  y:  3, z: 28 }   ← 上坡回程
{ x:-32,  y:  1, z: 58 }   ← 最後掃彎
{ x: -8,  y:  0, z: 70 }   ← 接回起點
```

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

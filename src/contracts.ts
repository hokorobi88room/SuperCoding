/**
 * =====================================================================
 *  『原初の海 (Primordial Sea)』 — 共有契約ファイル
 * =====================================================================
 *  全モジュールが従う型定義・定数・GPUバッファレイアウト。
 *  ここを変更する場合は統合担当(main)の承認が必要。
 *  各実装エージェントはこのファイルを「読むだけ」で、編集しないこと。
 * =====================================================================
 */

// ---------------------------------------------------------------------
// ワールド定数
// ---------------------------------------------------------------------

/** シミュレーション空間の幅(ワールド単位) */
export const WORLD_W = 1600;
/** シミュレーション空間の高さ(ワールド単位) */
export const WORLD_H = 900;

/** エージェント最大数(バッファは常にこのサイズで確保) */
export const MAX_AGENTS = 131072;

/** 空間ハッシュグリッドのセルサイズ(ワールド単位) */
export const CELL_SIZE = 12.5;
export const GRID_W = 128; // WORLD_W / CELL_SIZE
export const GRID_H = 72;  // WORLD_H / CELL_SIZE
export const NUM_CELLS = GRID_W * GRID_H; // 9216
/** 1セルに格納できるエージェント数の上限(溢れた分は近傍探索から漏れるが許容) */
export const CELL_CAPACITY = 48;

/** コンピュートシェーダのワークグループサイズ(全パス共通) */
export const WORKGROUP_SIZE = 256;

// ワールドはトーラス(上下左右ラップ)。距離計算は必ず wrapDelta を使うこと。

// ---------------------------------------------------------------------
// 種 (Species)
// ---------------------------------------------------------------------

export const SPECIES_ALGAE = 0; // 藻(食料。漂い、光合成で増える)
export const SPECIES_PREY = 1;  // 小魚(被食者。群泳し藻を食べる)
export const SPECIES_PRED = 2;  // 捕食魚(小魚を狩る)
export const NUM_SPECIES = 3;

// ---------------------------------------------------------------------
// GPUバッファレイアウト
// ---------------------------------------------------------------------
//
// ◆ agentData (storage, ping-pong で2本 / 各 MAX_AGENTS * 48 bytes)
//    WGSL:
//      struct Agent {
//        pos    : vec2f,  // offset 0
//        vel    : vec2f,  // offset 8
//        genes  : vec4f,  // offset 16  (x:speed y:vision z:size w:wariness / 各0..1)
//        energy : f32,    // offset 32
//        age    : f32,    // offset 36
//        species: u32,    // offset 40
//        seed   : u32,    // offset 44  (個体別乱数シード)
//      };
//    stride = 48 bytes
//
// ◆ aliveFlags (storage / MAX_AGENTS * 4 bytes, array<atomic<u32>>)
//      0 = 空きスロット(フリーリスト管理下)
//      1 = 生存
//      2 = 今フレーム死亡(deathパスがフリーリストへ回収して0にする)
//
// ◆ freeList (storage / MAX_AGENTS * 4 bytes, array<u32>)
//      空きスロットのインデックススタック。freeTop は counters[0]。
//      pop: idx = atomicSub(freeTop,1)-1 … idx<0 なら atomicAdd で戻して失敗扱い
//      push: freeList[atomicAdd(freeTop,1)] = slot
//
// ◆ counters (storage / COUNTERS_U32 * 4 bytes, array<atomic<u32>>)
//      レイアウトは CounterSlot 参照。遺伝子合計は固定小数点(×1024)で加算。
//
// ◆ grid.cellCount (storage / NUM_CELLS * 4, array<atomic<u32>>)
// ◆ grid.cellAgents (storage / NUM_CELLS * CELL_CAPACITY * 4, array<u32>)
//
// ◆ spawnRequests (storage / 16 + MAX_SPAWN_REQUESTS*32 bytes)
//      struct SpawnReq { pos: vec2f, species: u32, count: u32,
//                        spread: f32, energy: f32, pad: vec2f };  // 32 bytes
//      先頭16バイト: { count: u32, pad: vec3<u32> }
//      CPUが書き、spawnパスが消費、CPUが毎フレーム先頭countを0に戻す。
//
// ◆ simParams (uniform) — レイアウトは packSimParams() (gpu/buffers.ts) が唯一の実装
//      グローバル16バイト + 種ごとに SPECIES_PARAM_VEC4S 個の vec4f × 3種
//
// ◆ interaction (uniform / 32 bytes)
//      { mouse: vec2f, radius: f32, strength: f32, tool: u32, isDown: u32, pad: vec2f }
//      mouse はワールド座標。
//
// ◆ obstacleTex : r8unorm 512x288  (1=障害物, 0=なし; 線形サンプリング)
// ◆ flowTex    : rgba8unorm 256x144 (xy: 流向 dir*0.5+0.5, z: 強さ0..1, w:未使用)
//
// ---------------------------------------------------------------------

export const AGENT_STRIDE_BYTES = 48;
export const AGENT_STRIDE_F32 = 12;

export const OBSTACLE_TEX_W = 512;
export const OBSTACLE_TEX_H = 288;
export const FLOW_TEX_W = 256;
export const FLOW_TEX_H = 144;

export const MAX_SPAWN_REQUESTS = 16;
export const SPAWN_REQ_STRIDE_BYTES = 32;
export const SPAWN_HEADER_BYTES = 16;

/** counters バッファの u32 スロット割当 */
export const CounterSlot = {
  FREE_TOP: 0,
  POP_ALGAE: 1,
  POP_PREY: 2,
  POP_PRED: 3,
  BIRTHS: 4,   // 累積(CPUがリードバック時に差分を取る)
  DEATHS: 5,
  EATS: 6,
  // 7 予約
  GENE_SUM_BASE: 8, // species*4 + geneIndex → 8..19 (固定小数点 ×1024)
} as const;
export const COUNTERS_U32 = 32;
export const GENE_FIXED_POINT = 1024;

/** 種ごとのGPUパラメータは vec4f × この数で simParams uniform に詰める */
export const SPECIES_PARAM_VEC4S = 5;

// ---------------------------------------------------------------------
// パラメータ(JS側の正)
// ---------------------------------------------------------------------

/** 種ごとの調整可能パラメータ。GPUへのパック順は gpu/buffers.ts の packSimParams が正。 */
export interface SpeciesParams {
  maxSpeed: number;      // 最高速度 (world unit/s)
  accel: number;         // 操舵加速度
  vision: number;        // 視野半径 (world unit)
  separation: number;    // 分離の重み
  alignment: number;     // 整列の重み
  cohesion: number;      // 結合の重み
  flee: number;          // 逃走の重み(被食者→捕食者 / 恐怖ツール)
  seek: number;          // 探索の重み(小魚→藻、捕食魚→小魚)
  eatRadius: number;     // 捕食判定半径
  eatGain: number;       // 捕食時のエネルギー獲得量
  metabolism: number;    // エネルギー消費速度 (/s, 速度遺伝子の2乗で増幅)
  reproThreshold: number;// 繁殖に必要なエネルギー
  reproCost: number;     // 繁殖時に子へ渡すエネルギー
  reproChance: number;   // 閾値超過時の繁殖確率 (/s)
  mutation: number;      // 突然変異の強さ (0..1)
  maxAge: number;        // 寿命 (s)
  photoRate: number;     // [藻のみ] 光合成のエネルギー獲得速度 (/s)
  crowdLimit: number;    // 近傍同種数がこれを超えると繁殖抑制(環境収容力)
}

export interface SimParams {
  /** シミュレーション速度倍率 0.25..4 */
  speed: number;
  paused: boolean;
  species: [SpeciesParams, SpeciesParams, SpeciesParams];
}

/** UIスライダー生成用メタデータ。key は SpeciesParams のフィールド名と一致させる。 */
export interface ParamMeta {
  key: keyof SpeciesParams;
  min: number;
  max: number;
  step: number;
  /** この種にのみ表示 (undefined なら全種) */
  onlySpecies?: number[];
}

export const PARAM_META: ParamMeta[] = [
  { key: "maxSpeed", min: 10, max: 200, step: 1 },
  { key: "accel", min: 10, max: 600, step: 5 },
  { key: "vision", min: 4, max: 60, step: 0.5 },
  { key: "separation", min: 0, max: 4, step: 0.05 },
  { key: "alignment", min: 0, max: 4, step: 0.05, onlySpecies: [SPECIES_PREY, SPECIES_PRED] },
  { key: "cohesion", min: 0, max: 4, step: 0.05, onlySpecies: [SPECIES_PREY, SPECIES_PRED] },
  { key: "flee", min: 0, max: 6, step: 0.05, onlySpecies: [SPECIES_PREY] },
  { key: "seek", min: 0, max: 6, step: 0.05, onlySpecies: [SPECIES_PREY, SPECIES_PRED] },
  { key: "eatRadius", min: 1, max: 15, step: 0.25, onlySpecies: [SPECIES_PREY, SPECIES_PRED] },
  { key: "eatGain", min: 0, max: 100, step: 1, onlySpecies: [SPECIES_PREY, SPECIES_PRED] },
  { key: "metabolism", min: 0, max: 20, step: 0.1 },
  { key: "reproThreshold", min: 10, max: 200, step: 1 },
  { key: "reproCost", min: 5, max: 100, step: 1 },
  { key: "reproChance", min: 0, max: 3, step: 0.02 },
  { key: "mutation", min: 0, max: 0.5, step: 0.01, onlySpecies: [SPECIES_PREY, SPECIES_PRED] },
  { key: "maxAge", min: 5, max: 300, step: 1 },
  { key: "photoRate", min: 0, max: 30, step: 0.2, onlySpecies: [SPECIES_ALGAE] },
  { key: "crowdLimit", min: 1, max: 40, step: 1 },
];

// ---------------------------------------------------------------------
// ツール
// ---------------------------------------------------------------------

export const Tool = {
  NONE: 0,
  FOOD: 1,     // 餌まき(藻スポーン) — CPU側で spawnRequests を発行
  ATTRACT: 2,  // 引力 — シェーダが interaction uniform を読む
  REPEL: 3,    // 斥力
  VORTEX: 4,   // 渦
  FEAR: 5,     // 恐怖(小魚が仮想捕食者として回避)
  OBSTACLE: 6, // 障害物ペイント — CPU側で obstacleTex を描画
  ERASE: 7,    // 障害物消しゴム
  CURRENT: 8,  // 海流ペイント — CPU側で flowTex にドラッグ方向を描画
} as const;
export type ToolId = (typeof Tool)[keyof typeof Tool];

// ---------------------------------------------------------------------
// 統計
// ---------------------------------------------------------------------

export interface SimStats {
  /** 種ごとの生存数 [藻, 小魚, 捕食魚] */
  populations: [number, number, number];
  /** 直近読み取り区間の毎秒レート */
  birthsPerSec: number;
  deathsPerSec: number;
  eatsPerSec: number;
  /** 種ごとの平均遺伝子 [speed, vision, size, wariness] (0..1) */
  avgGenes: [number[], number[], number[]];
  /** シミュレーション経過時間 (s) */
  simTime: number;
}

// ---------------------------------------------------------------------
// シード(初期配置)
// ---------------------------------------------------------------------

export interface SeedSpec {
  algae: number;
  prey: number;
  predators: number;
  /** 群れの塊の数 (1 = 全体に分散) */
  clusters: number;
  /** 遺伝子の初期ばらつき 0..0.5 (中央値0.5からの範囲) */
  geneSpread: number;
}

export interface SpawnRequest {
  x: number; // ワールド座標
  y: number;
  species: number;
  count: number;  // 1リクエストで湧かせる数 (最大 64)
  spread: number; // 散布半径
  energy: number; // 初期エネルギー
}

// ---------------------------------------------------------------------
// モジュール間インターフェース
// ---------------------------------------------------------------------

/** gpu/buffers.ts の createSimBuffers() が生成する共有GPU資源一式 */
export interface SimBuffers {
  /** ping-pong: tick ごとに読み書きが入れ替わる */
  agentData: [GPUBuffer, GPUBuffer];
  aliveFlags: GPUBuffer;
  freeList: GPUBuffer;
  counters: GPUBuffer;
  cellCount: GPUBuffer;
  cellAgents: GPUBuffer;
  spawnRequests: GPUBuffer;
  simParams: GPUBuffer;      // uniform
  interaction: GPUBuffer;    // uniform
  obstacleTex: GPUTexture;   // r8unorm 512x288
  flowTex: GPUTexture;       // rgba8unorm 256x144
  /** counters リードバック用ステージング(コピー先) */
  countersStaging: GPUBuffer;
}

/** sim/simulation.ts が実装 */
export interface ISimulation {
  /** 現在「読み側」の agentData(描画はこれを使う)。tick() のたびに入れ替わる。 */
  readonly currentAgents: GPUBuffer;
  /** 最新の統計(未取得なら初期値)。 */
  readonly stats: SimStats;
  /** 初期配置をやり直す(バッファをCPUから再シード)。 */
  reset(seed: SeedSpec): void;
  /** JSパラメータをGPU uniformへ書き込む(毎フレーム呼んでよい)。 */
  setParams(p: SimParams): void;
  /** 1シミュレーションステップ分のコンピュートパスをエンコード。 */
  tick(encoder: GPUCommandEncoder, dt: number): void;
  /** queue.submit() の後に毎フレーム呼ぶ。数フレームおきに counters を非同期読取して stats を更新する。 */
  afterSubmit(): void;
  /** CPU発のスポーン要求を次 tick で消費させる。 */
  requestSpawns(reqs: SpawnRequest[]): void;
}

/** render/renderer.ts が実装 */
export interface IRenderer {
  resize(width: number, height: number, dpr: number): void;
  /**
   * 1フレーム描画。agents には simulation.currentAgents を渡す。
   * time: 演出用経過秒, dt: フレーム時間
   */
  render(
    encoder: GPUCommandEncoder,
    target: GPUTextureView,
    agents: GPUBuffer,
    time: number,
    dt: number,
  ): void;
}

/** interaction/tools.ts が実装。マウス入力・ペイント・uniform/テクスチャ更新を担う。 */
export interface IInteraction {
  readonly tool: ToolId;
  readonly brushRadius: number; // ワールド単位
  readonly strength: number;    // 0..1
  setTool(t: ToolId): void;
  setBrushRadius(r: number): void;
  setStrength(s: number): void;
  /** 毎フレーム呼ぶ。interaction uniform / obstacleTex / flowTex を必要に応じ更新し、
   *  FOODツールのドラッグ中は SpawnRequest 配列を返す(なければ空配列)。 */
  update(dt: number): SpawnRequest[];
  /** 障害物・海流ペイントを全消去 */
  clearPaint(): void;
}

/** audio/soundscape.ts が実装 */
export interface ISoundscape {
  readonly enabled: boolean;
  /** 初回はユーザー操作イベント内から呼ぶこと(autoplay制限) */
  toggle(): Promise<boolean>;
  setVolume(v: number): void; // 0..1
  /** 毎フレーム呼ぶ(内部で間引いてよい) */
  update(stats: SimStats, dt: number): void;
}

/** main.ts が UI に渡すコールバック集 */
export interface UIController {
  getParams(): SimParams;
  /** speciesIdx: 0..2, key: SpeciesParams のフィールド */
  setSpeciesParam(speciesIdx: number, key: keyof SpeciesParams, value: number): void;
  setSpeed(mul: number): void;
  togglePause(): boolean;      // 戻り値: 現在 paused か
  applyPreset(presetId: string): void;
  resetWorld(): void;
  setTool(t: ToolId): void;
  setBrushRadius(r: number): void;
  setStrength(s: number): void;
  toggleSound(): Promise<boolean>;
  setVolume(v: number): void;
}

/** ui/panel.ts の createUI() が返す */
export interface IUI {
  /** 毎フレーム呼ぶ(内部で間引いてよい)。fps は移動平均済みの値。 */
  update(stats: SimStats, fps: number): void;
  /** ツール変更などを外部(キーボードショートカット等)から反映 */
  syncToolSelection(t: ToolId): void;
}

// ---------------------------------------------------------------------
// コンテンツ(content/ モジュールが提供)
// ---------------------------------------------------------------------

export interface SpeciesDef {
  name: string;        // 例: 「小魚」
  nameEn: string;      // 例: "Prey"
  description: string; // パネル表示用の短文
  /** 基本色 (HDR係数を含む線形RGB。描画側で遺伝子により変調) */
  baseColor: [number, number, number];
  params: SpeciesParams;
}

export interface Preset {
  id: string;
  name: string;        // 日本語名 例:「狩りの時間」
  description: string; // 1行説明
  seed: SeedSpec;
  /** DEFAULT_SPECIES からの上書き差分 (species index → 部分パラメータ) */
  overrides: Partial<Record<number, Partial<SpeciesParams>>>;
}

/** content/text.ts が export する全UI文言。キー追加は自由、削除は不可。 */
export interface UIText {
  title: string;
  subtitle: string;
  loading: string;
  webgpuUnsupported: string;
  webgpuHint: string;
  toolNames: Record<number, string>;   // ToolId → 表示名
  toolHints: Record<number, string>;   // ToolId → 1行説明
  paramLabels: Record<string, string>; // SpeciesParams のキー → 日本語ラベル
  paramSection: string;    // 「環境パラメータ」等
  presetSection: string;
  statsSection: string;
  speciesTab: [string, string, string];
  population: string;
  generationInfo: string;  // 遺伝子表示の見出し
  geneNames: [string, string, string, string]; // speed/vision/size/wariness
  pause: string;
  resume: string;
  reset: string;
  speed: string;
  sound: string;
  soundOn: string;
  soundOff: string;
  volume: string;
  brushRadius: string;
  brushStrength: string;
  clearPaint: string;
  fps: string;
  extinction: string;      // 絶滅時のトースト文言 (種名を {name} で埋め込み)
  bloomLabel: string;
}

// ---------------------------------------------------------------------
// ユーティリティ(実装は gpu/coords.ts)
// ---------------------------------------------------------------------

export interface ViewTransform {
  /** キャンバスCSSピクセル座標 → ワールド座標(アスペクト比保持レターボックス) */
  clientToWorld(x: number, y: number): [number, number];
  /** ワールド → クリップ空間変換係数 (シェーダ uniform 用) scale/offset */
  worldToClip(): { scale: [number, number]; offset: [number, number] };
}

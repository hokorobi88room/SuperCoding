/**
 * =====================================================================
 *  『神の観察 (Deus Ex Vita)』 — v2 共有契約
 * =====================================================================
 *  神経進化する生命・信号フェロモン場・ミーム文化を GPU で駆動する
 *  人工生命シミュレータの、全モジュール共通の型・定数・バッファレイアウト。
 *
 *  v1(原初の海)との違い:
 *   - 固定ルールの boids を廃し、各個体が小さなニューラルネットの「脳」を持つ。
 *     繁殖時に重みを突然変異させることで、行動そのものが世代を経て進化する。
 *   - パラメータ調整UIは廃止。人間は「神」として御業ツールで介入し観察する。
 *   - 信号フェロモン場とミームベクトルで、群れ文化・方言・縄張りが創発する。
 *
 *  このファイルと DESIGN_V2.md、buffers2.ts が全実装の正。編集は統合担当のみ。
 * =====================================================================
 */

// ---------------------------------------------------------------------
// ワールド
// ---------------------------------------------------------------------
export const WORLD_W = 1600;
export const WORLD_H = 900;

/**
 * 個体スロット上限。脳の重み(408 float)を別バッファで持つため、
 * これを大きくするとVRAMを食う。テスト機(iGPU)では seedGenesis の
 * 実個体数を絞って動かし、Mac mini では引き上げる想定。
 */
export const MAX_CREATURES = 32768;

// 空間ハッシュグリッド
export const CELL_SIZE = 25;
export const GRID_W = 64; // 1600 / 25
export const GRID_H = 36; // 900 / 25
export const NUM_CELLS = GRID_W * GRID_H; // 2304
export const CELL_CAPACITY = 64;

export const WORKGROUP_SIZE = 256;

// トーラス。距離は必ずラップ距離を使う: d -= round(d/WORLD)*WORLD。

// ---------------------------------------------------------------------
// 役割(role)
// ---------------------------------------------------------------------
export const ROLE_FOOD = 0;     // 受動。漂い、光合成で増える。脳なし。
export const ROLE_CREATURE = 1; // 神経進化する生命。脳を持つ。
export const NUM_ROLES = 2;

// ---------------------------------------------------------------------
// ニューラルネット脳(固定トポロジ MLP)
// ---------------------------------------------------------------------
// 入力ベクトル(NIN=16) — sim/wgsl の buildSenses が組み立てる:
//   0  energy     (0..1)           自分のエネルギー
//   1  age        (0..1)           寿命に対する年齢
//   2  foodDx      (-1..1)         最寄り食料への単位方向 x
//   3  foodDy      (-1..1)         最寄り食料への単位方向 y
//   4  foodProx    (0..1)          最寄り食料の近さ(1=接触)
//   5  creatDx     (-1..1)         最寄り他個体への方向 x
//   6  creatDy     (-1..1)         方向 y
//   7  creatProx   (0..1)          近さ
//   8  kinship     (0..1)          最寄り個体との遺伝+ミーム類似度(血縁認識)
//   9  density     (0..1)          近傍の同role密度
//   10 flockDx     (-1..1)         近傍平均進行方向 x
//   11 flockDy     (-1..1)         近傍平均進行方向 y
//   12 sigCulture  (0..1)          信号場: 文化フェロモン強度
//   13 sigDanger   (0..1)          信号場: 危険(死・捕食)痕跡
//   14 bias        (=1)            バイアス入力
//   15 clock       (-1..1)         個体固有位相の内部時計 sin(age*k+seed)
//
// 出力ベクトル(NOUT=8) — 各 tanh(-1..1):
//   0  turnX      操舵加速 x
//   1  turnY      操舵加速 y
//   2  eat        >0.2 で捕食/採餌を試みる
//   3  reproduce  >0.4 かつ energy 十分で繁殖
//   4  attack     >0.3 で他個体への攻撃(肉食)を許可
//   5  emit       信号場への文化フェロモン放出強度(0..1にrelu)
//   6  memeShift  ミーム自己変調(内部文化ドリフト)
//   7  speedMod   最高速度の変調(0.5..1.5)
//
// 構成: h = tanh(W1·x + B1); o = tanh(W2·h + B2)
export const NIN = 16;
export const NHID = 16;
export const NOUT = 8;
// 重みレイアウト(brainWeights[slot*BRAIN_STRIDE + offset]):
//   W1: NHID*NIN            = 256   offset 0
//   B1: NHID                = 16    offset 256
//   W2: NOUT*NHID           = 128   offset 272
//   B2: NOUT                = 8     offset 400
//   合計 BRAIN_STRIDE       = 408
export const W1_OFF = 0;
export const B1_OFF = W1_OFF + NHID * NIN; // 256
export const W2_OFF = B1_OFF + NHID;       // 272
export const B2_OFF = W2_OFF + NOUT * NHID; // 400
export const BRAIN_STRIDE = B2_OFF + NOUT; // 408

// ---------------------------------------------------------------------
// GPUバッファレイアウト
// ---------------------------------------------------------------------
//
// ◆ creatureData (storage, ping-pong ×2 / 各 MAX_CREATURES*64 bytes)
//   struct Creature {
//     pos      : vec2f,  // 0
//     vel      : vec2f,  // 8
//     energy   : f32,    // 16
//     age      : f32,    // 20
//     diet     : f32,    // 24  0=草食 .. 1=肉食(進化する食性)
//     size     : f32,    // 28  体格遺伝子 0..1
//     meme     : vec4f,  // 32  文化ベクトル(伝播・変異する)
//     signalMem: f32,    // 48  前フレームの自己信号(内部状態)
//     lineage  : f32,    // 52  始祖色相(系譜の可視化用, 0..1, 繁殖で微小ドリフト)
//     role     : u32,    // 56  ROLE_FOOD / ROLE_CREATURE
//     seed     : u32,    // 60  個体乱数
//   };  stride = 64
//
// ◆ brainWeights (storage / MAX_CREATURES*BRAIN_STRIDE*4 bytes, array<f32>)
//   単一バッファ(ping-pongしない)。繁殖パスが子スロットへ書き込む。
//
// ◆ aliveFlags (storage / MAX_CREATURES*4, array<atomic<u32>>)
//   0=空き / 1=生存 / 2=今フレーム死亡(死パスが回収)
//
// ◆ freeList (storage / MAX_CREATURES*4, array<u32>) freeTop=counters[0]
//
// ◆ counters (storage / COUNTERS_U32*4, array<atomic<u32>>) — CounterSlot 参照
//
// ◆ grid.cellCount (storage / NUM_CELLS*4, atomic) / cellAgents (NUM_CELLS*CELL_CAP*4)
//
// ◆ signalField (storage texture, ping-pong ×2 / rgba16float SIG_W×SIG_H)
//   r: 文化フェロモン(emit出力を堆積) / g: 食料の匂い / b: 危険痕跡(死・捕食)
//   a: 予備。毎tick 拡散+減衰。creature が沈着し、buildSenses が参照。
//
// ◆ signalAccum (storage / SIG_W*SIG_H*4 * 4bytes, array<atomic<u32>>)
//   信号沈着の集約先。creature が behavior で atomicAdd(固定小数点×1024)。
//   signalBake パスが field へ焼き込み、accum をゼロクリアする。チャンネル順 rgba。
//
// ◆ structureGrid (storage texture / r32float STRUCT_W×STRUCT_H)
//   永続的な建造物の密度。文明ステージで build 行動が堆積させる(緩やかに減衰)。
//
// ◆ structAccum (storage / STRUCT_W*STRUCT_H * 4bytes, array<atomic<u32>>)
//   建造沈着の集約先(固定小数点×1024)。structBake が structureGrid へ焼き込む。
//
// ◆ spawnRequests (storage) 神の「恵み(食料)」等を CPU が積む — v1 と同形式
//
// ◆ config (uniform) — packConfig() が唯一の実装
// ◆ interaction (uniform / 32 bytes) — v1 と同形式(神の御業ツール)
//
// ---------------------------------------------------------------------

export const CREATURE_STRIDE_BYTES = 64;
export const CREATURE_STRIDE_F32 = 16;

export const SIG_W = 256;
export const SIG_H = 144;
export const STRUCT_W = 256;
export const STRUCT_H = 144;

export const MAX_SPAWN_REQUESTS = 16;
export const SPAWN_REQ_STRIDE_BYTES = 32;
export const SPAWN_HEADER_BYTES = 16;

/** counters バッファの u32 スロット割当 */
export const CounterSlot = {
  FREE_TOP: 0,
  POP_FOOD: 1,
  POP_CREATURE: 2,
  BIRTHS: 3,     // 累積
  DEATHS: 4,
  EATS: 5,       // 採餌(草食行動)
  KILLS: 6,      // 捕食(肉食行動)
  BUILDS: 7,     // 建造イベント
  // 集計(固定小数点 ×1024)
  SUM_DIET: 8,      // Σ diet
  SUM_AGGR: 9,      // Σ attack出力の正値(攻撃性)
  SUM_SOCIAL: 10,   // Σ 近傍密度(社会性)
  SUM_SPEED: 11,    // Σ 速度
  SUM_EMIT: 12,     // Σ 信号放出(文化活動)
  SUM_SIZE: 13,     // Σ size
  // 14,15 予備
} as const;
export const COUNTERS_U32 = 24;
export const FIXED_POINT = 1024;

// ---------------------------------------------------------------------
// 内部設定(UIには出さない。神は数値を弄らない)
// ---------------------------------------------------------------------
export interface WorldConfig {
  /** シミュ速度倍率 0=停止, 0.25..4 */
  speed: number;
  paused: boolean;
  /** 文明ステージ有効化(建造行動を許可)。段階的解放。 */
  civilization: boolean;
  /** 突然変異強度(神経+遺伝) 0..1 */
  mutation: number;
  /** 信号場の減衰(毎秒 exp係数) */
  signalDecay: number;
}

export function defaultConfig(): WorldConfig {
  return {
    speed: 1,
    paused: false,
    civilization: false,
    mutation: 0.12,
    signalDecay: 1.4,
  };
}

// ---------------------------------------------------------------------
// 神の御業ツール(旧toolsを神視点に再構成)
// ---------------------------------------------------------------------
export const Divine = {
  OBSERVE: 0,   // 観察(介入なし)
  BLESS: 1,     // 恵み — 食料を降らせる
  SMITE: 2,     // 天罰 — 範囲の生命を滅する
  BECKON: 3,    // 誘い — 引力
  REPEL: 4,     // 忌避 — 斥力
  MAELSTROM: 5, // 渦
  BARRIER: 6,   // 障壁を描く(障害物)
  ERASE: 7,     // 障壁を消す
  CURRENT: 8,   // 潮流を描く
} as const;
export type DivineTool = (typeof Divine)[keyof typeof Divine];

// ---------------------------------------------------------------------
// 統計と年代記
// ---------------------------------------------------------------------
export interface WorldStats {
  populations: [number, number];  // [食料, 生命]
  birthsPerSec: number;
  deathsPerSec: number;
  eatsPerSec: number;
  killsPerSec: number;
  buildsPerSec: number;
  /** 生命の平均形質(0..1): diet, aggression, social, speed, emit(文化), size */
  avgDiet: number;
  avgAggression: number;
  avgSocial: number;
  avgSpeed: number;
  avgCulture: number;
  avgSize: number;
  /** CPUがサンプリングして推定した部族(ミームクラスタ)数 */
  tribes: number;
  /** 世代の目安(累積誕生数から推定) */
  epoch: number;
  simTime: number;
}

export type ChronicleKind =
  | "genesis"      // 創世
  | "bloom"        // 繁栄
  | "crash"        // 大量死
  | "extinction"   // 絶滅の危機
  | "carnivore"    // 肉食への進化台頭
  | "herbivore"    // 草食回帰
  | "tribe"        // 部族(文化)の誕生
  | "civilization" // 建造の始まり
  | "divine";      // 神の介入

export interface ChronicleEvent {
  kind: ChronicleKind;
  /** 表示文(日本語。{n} 等はイベント側で埋め済み) */
  text: string;
  /** イベント時点の simTime */
  time: number;
}

// ---------------------------------------------------------------------
// 初期世界
// ---------------------------------------------------------------------
export interface GenesisSpec {
  food: number;
  creatures: number;
  /** 初期の群れの塊数 */
  clusters: number;
}

export interface SpawnRequest {
  x: number;
  y: number;
  role: number;
  count: number;
  spread: number;
  energy: number;
}

// ---------------------------------------------------------------------
// 共有GPU資源(buffers2.ts の createSimBuffers2 が生成)
// ---------------------------------------------------------------------
export interface SimBuffers2 {
  creatureData: [GPUBuffer, GPUBuffer];
  brainWeights: GPUBuffer;
  aliveFlags: GPUBuffer;
  freeList: GPUBuffer;
  counters: GPUBuffer;
  cellCount: GPUBuffer;
  cellAgents: GPUBuffer;
  signalField: [GPUTexture, GPUTexture]; // rgba16float, ping-pong
  signalAccum: GPUBuffer;                // array<atomic<u32>> SIG_W*SIG_H*4
  structureGrid: GPUTexture;             // r32float 永続
  structAccum: GPUBuffer;                // array<atomic<u32>> STRUCT_W*STRUCT_H
  obstacleTex: GPUTexture;               // r8unorm(障壁)
  flowTex: GPUTexture;                   // rgba8unorm(潮流)
  spawnRequests: GPUBuffer;
  config: GPUBuffer;      // uniform
  interaction: GPUBuffer; // uniform
  countersStaging: GPUBuffer;
  /** ミーム/系譜のCPUサンプリング用(creature の meme+lineage を少数読み戻す) */
  sampleStaging: GPUBuffer;
}

// signalField / structureGrid のテクスチャフォーマット
export const SIGNAL_FORMAT: GPUTextureFormat = "rgba16float";
export const STRUCT_FORMAT: GPUTextureFormat = "r32float";

// ---------------------------------------------------------------------
// モジュールインターフェース
// ---------------------------------------------------------------------

/** sim2/simulation2.ts が実装 */
export interface ISimulation2 {
  readonly currentCreatures: GPUBuffer;
  readonly currentSignal: GPUTexture;
  readonly structureGrid: GPUTexture;
  readonly stats: WorldStats;
  reset(g: GenesisSpec): void;
  setConfig(c: WorldConfig): void;
  tick(encoder: GPUCommandEncoder, dt: number): void;
  afterSubmit(): void;
  requestSpawns(reqs: SpawnRequest[]): void;
}

/** render2/renderer2.ts が実装 */
export interface IRenderer2 {
  resize(width: number, height: number, dpr: number): void;
  render(
    encoder: GPUCommandEncoder,
    target: GPUTextureView,
    creatures: GPUBuffer,
    signal: GPUTexture,
    structures: GPUTexture,
    time: number,
    dt: number,
  ): void;
  /** 描画品質 0=軽量 1=標準 2=高画質 */
  setQuality(q: 0 | 1 | 2): void;
}

/** interaction2/divine.ts が実装(神の御業) */
export interface IDivine {
  readonly tool: DivineTool;
  readonly radius: number;
  readonly strength: number;
  setTool(t: DivineTool): void;
  setRadius(r: number): void;
  setStrength(s: number): void;
  update(dt: number): SpawnRequest[];
  clearPaint(): void;
}

/** ui2/observatory.ts が実装(神視点UI) */
export interface IObservatory {
  update(stats: WorldStats, fps: number): void;
  /** 新しい年代記イベントを追記表示 */
  pushEvents(events: ChronicleEvent[]): void;
  syncTool(t: DivineTool): void;
}

/** chronicle2/chronicle.ts が実装(統計差分からイベントを検出) */
export interface IChronicler {
  /** afterSubmit 後に毎回呼ぶ。新規イベント配列を返す(なければ空)。 */
  observe(stats: WorldStats): ChronicleEvent[];
  reset(): void;
}

/** main2 が UI に渡すコントローラ */
export interface GodController {
  getConfig(): WorldConfig;
  setSpeed(mul: number): void;
  togglePause(): boolean;
  toggleCivilization(): boolean;
  genesis(): void; // 世界を作り直す(創世)
  setTool(t: DivineTool): void;
  setRadius(r: number): void;
  setStrength(s: number): void;
  setQuality(q: 0 | 1 | 2): void;
  getQuality(): 0 | 1 | 2;
  toggleSound(): Promise<boolean>;
  setVolume(v: number): void;
}

// ---------------------------------------------------------------------
// UI文言(content2/text2.ts が実装)
// ---------------------------------------------------------------------
export interface UIText2 {
  title: string;
  subtitle: string;
  loading: string;
  webgpuUnsupported: string;
  webgpuHint: string;
  toolNames: Record<number, string>;
  toolHints: Record<number, string>;
  chronicleTitle: string;
  lineageTitle: string;
  traitNames: {
    diet: string; aggression: string; social: string;
    speed: string; culture: string; size: string;
  };
  dietPoles: [string, string]; // [草食, 肉食]
  population: string;
  foodName: string;
  creatureName: string;
  tribes: string;
  epoch: string;
  pause: string; resume: string; genesis: string;
  speed: string;
  civilization: string; civOn: string; civOff: string;
  quality: string; qualityNames: [string, string, string];
  sound: string; soundOn: string; soundOff: string; volume: string;
  radius: string; strength: string;
  fps: string;
  /** 年代記テンプレ。{n}/{t} を chronicler が置換。 */
  chronicle: Record<ChronicleKind, string[]>;
}

export interface ViewTransform2 {
  clientToWorld(x: number, y: number): [number, number];
  worldToClip(): { scale: [number, number]; offset: [number, number] };
}

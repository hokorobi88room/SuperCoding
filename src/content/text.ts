/**
 * 全UI文言(日本語)。UIText 型の全キーを定義する。
 * 各モジュールは文言をここから取得し、ハードコードしない。
 */
import { Tool, type UIText } from "../contracts";

export const TEXT: UIText = {
  title: "原初の海",
  subtitle: "Primordial Sea — 進化する深海の生態系",
  loading: "海を満たしています…",
  webgpuUnsupported: "お使いのブラウザは WebGPU に対応していません。",
  webgpuHint: "Chrome または Edge の最新版でお試しください。",

  // ツール全9種(NONE=観察 … CURRENT=海流)
  toolNames: {
    [Tool.NONE]: "観察",
    [Tool.FOOD]: "餌まき",
    [Tool.ATTRACT]: "引き寄せ",
    [Tool.REPEL]: "押し出し",
    [Tool.VORTEX]: "渦",
    [Tool.FEAR]: "恐怖",
    [Tool.OBSTACLE]: "岩",
    [Tool.ERASE]: "消しゴム",
    [Tool.CURRENT]: "海流",
  },
  toolHints: {
    [Tool.NONE]: "ただ静かに海を眺める。",
    [Tool.FOOD]: "ドラッグして藻の胞子をまき、いのちを育む。",
    [Tool.ATTRACT]: "触れた生き物をカーソルへ引き寄せる。",
    [Tool.REPEL]: "生き物をカーソルから押し離す。",
    [Tool.VORTEX]: "渦を起こして群れを巻き込む。",
    [Tool.FEAR]: "小魚に恐怖を与え、逃げ惑わせる。",
    [Tool.OBSTACLE]: "岩を描いて海の地形をつくる。",
    [Tool.ERASE]: "描いた岩や海流を消し去る。",
    [Tool.CURRENT]: "ドラッグした向きへ海流を描く。",
  },

  // SpeciesParams 全18キーの日本語ラベル
  paramLabels: {
    maxSpeed: "最高速度",
    accel: "加速力",
    vision: "視野",
    separation: "分離",
    alignment: "整列",
    cohesion: "結合",
    flee: "逃走",
    seek: "探索",
    eatRadius: "捕食半径",
    eatGain: "捕食の糧",
    metabolism: "代謝",
    reproThreshold: "繁殖の閾値",
    reproCost: "繁殖コスト",
    reproChance: "繁殖確率",
    mutation: "突然変異",
    maxAge: "寿命",
    photoRate: "光合成速度",
    crowdLimit: "環境収容力",
  },

  paramSection: "生態パラメータ",
  presetSection: "プリセット",
  statsSection: "生態系の記録",
  speciesTab: ["光藻", "銀鱗", "紅牙"],
  population: "個体数",
  generationInfo: "平均遺伝子",
  geneNames: ["速さ", "視野", "体格", "警戒心"],
  pause: "一時停止",
  resume: "再開",
  reset: "リセット",
  speed: "速度",
  sound: "サウンド",
  soundOn: "オン",
  soundOff: "オフ",
  volume: "音量",
  brushRadius: "ブラシ半径",
  brushStrength: "ブラシ強度",
  clearPaint: "地形を消去",
  fps: "FPS",
  extinction: "{name} が絶滅しました…",
  bloomLabel: "ブルーム",
};

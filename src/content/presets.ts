/**
 * プリセット定義。seed(初期配置)と overrides(既定パラメータからの差分)で
 * 生態系の「気分」を切り替える。
 * overrides のキーは種 index(0=藻 / 1=小魚 / 2=捕食魚)。
 * どのプリセットも即崩壊しないよう、食料基盤と初期個体数を確保している。
 * 初期総個体数はいずれも MAX_AGENTS(131072)未満で、繁殖用の空きスロットを残す。
 */
import { type Preset, SPECIES_ALGAE, SPECIES_PRED, SPECIES_PREY } from "../contracts";

export const PRESETS: Preset[] = [
  // 均衡の取れた「はじまりの海」。最初に読み込む既定世界に最適。
  {
    id: "genesis",
    name: "始まりの海",
    description: "藻・小魚・捕食魚が穏やかに均衡する、いのちの起点。",
    seed: { algae: 26000, prey: 12000, predators: 350, clusters: 6, geneSpread: 0.12 },
    overrides: {},
  },

  // 捕食者のいない海で小魚が奔流をなす。群れの結合・整列を強める。
  {
    id: "migration",
    name: "大群泳",
    description: "捕食者なき海で、無数の小魚が銀の奔流となって渦巻く。",
    seed: { algae: 30000, prey: 60000, predators: 0, clusters: 16, geneSpread: 0.1 },
    overrides: {
      [SPECIES_ALGAE]: { photoRate: 8, crowdLimit: 12 },
      [SPECIES_PREY]: { separation: 1.1, alignment: 1.6, cohesion: 1.3, crowdLimit: 30 },
    },
  },

  // 三栄養段階の均衡を眺める本命シナリオ。捕食800体。
  {
    id: "hunt",
    name: "狩りの時間",
    description: "藻・小魚・捕食魚の三つ巴。狩る者と狩られる者の均衡を見つめる。",
    seed: { algae: 30000, prey: 25000, predators: 800, clusters: 8, geneSpread: 0.12 },
    overrides: {
      [SPECIES_PRED]: { vision: 26, seek: 2.6 },
    },
  },

  // 激しい突然変異と広い初期遺伝子ばらつきで、進化を観察する小さな海。
  {
    id: "garden",
    name: "進化の箱庭",
    description: "激しい突然変異が渦巻く小さな海。遺伝子は世代ごとに姿を変える。",
    seed: { algae: 24000, prey: 16000, predators: 500, clusters: 5, geneSpread: 0.42 },
    overrides: {
      [SPECIES_ALGAE]: { mutation: 0.08 },
      [SPECIES_PREY]: { mutation: 0.22 },
      [SPECIES_PRED]: { mutation: 0.22 },
    },
  },

  // 藻が果てなく増殖する静謐な楽園。捕食者はいない。
  {
    id: "algae-paradise",
    name: "藻の楽園",
    description: "光を浴びた藻が果てなく増え、海一面を翠に染める楽園。",
    seed: { algae: 65000, prey: 6000, predators: 0, clusters: 2, geneSpread: 0.1 },
    overrides: {
      [SPECIES_ALGAE]: { photoRate: 10, crowdLimit: 18, maxAge: 100, reproChance: 0.7 },
    },
  },

  // 捕食者が溢れ、小魚が狩り尽くされる緊張のシナリオ。即滅はしない。
  {
    id: "extinction",
    name: "絶滅の淵",
    description: "捕食者が溢れかえる海。小魚は狩り尽くされ、静寂だけが残るのか。",
    seed: { algae: 32000, prey: 22000, predators: 3500, clusters: 5, geneSpread: 0.12 },
    overrides: {
      [SPECIES_PREY]: { vision: 16, flee: 4.0 },
      [SPECIES_PRED]: { vision: 26, metabolism: 2.6, reproChance: 0.5 },
    },
  },

  // 全種が高速・高加速で駆け抜ける混沌の海。潮も速い。
  {
    id: "storm",
    name: "嵐の海",
    description: "荒れ狂う潮流の中、すべての生き物が高速で駆け抜ける混沌の海。",
    seed: { algae: 30000, prey: 24000, predators: 700, clusters: 12, geneSpread: 0.15 },
    overrides: {
      [SPECIES_ALGAE]: { maxSpeed: 14, accel: 45 },
      [SPECIES_PREY]: { maxSpeed: 145, accel: 500, separation: 1.8, alignment: 0.7, cohesion: 0.5 },
      [SPECIES_PRED]: { maxSpeed: 165, accel: 470, separation: 2.2 },
    },
  },
];

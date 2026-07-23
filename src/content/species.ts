/**
 * 種の定義(名前・説明・基本色・既定パラメータ)。
 * baseColor は HDR係数を含む線形RGB。描画側が遺伝子で変調する。
 * params は DESIGN.md「コンテンツ仕様」の既定表を出発点に、
 * 生態系が数分間安定振動するよう調整した値。
 */
import type { SpeciesDef } from "../contracts";

// 藻(食料):光を食んで漂う原初の緑。翠緑系の発光色。
const ALGAE: SpeciesDef = {
  name: "光藻",
  nameEn: "Glowmoss",
  description: "光を食んで漂う原初の緑。海のすべての命の礎。",
  baseColor: [0.14, 1.25, 0.52],
  params: {
    maxSpeed: 6,
    accel: 20,
    vision: 8,
    separation: 0.3,
    alignment: 0,
    cohesion: 0,
    flee: 0,
    seek: 0,
    eatRadius: 0,
    eatGain: 0,
    metabolism: 0.4,
    reproThreshold: 30,
    reproCost: 12,
    reproChance: 0.85,
    mutation: 0.02,
    maxAge: 60,
    photoRate: 7,
    crowdLimit: 9,
  },
};

// 小魚(被食者):群れをなす銀の舞い。藻を食み、牙から逃げる。シアン系。
const PREY: SpeciesDef = {
  name: "銀鱗",
  nameEn: "Silverscale",
  description: "群れをなして舞う銀の小魚。藻を食み、紅い牙から逃げまどう。",
  baseColor: [0.32, 1.55, 2.25],
  params: {
    maxSpeed: 85,
    accel: 260,
    vision: 14,
    separation: 1.4,
    alignment: 1.0,
    cohesion: 0.8,
    flee: 3.2,
    seek: 1.2,
    eatRadius: 3.5,
    eatGain: 10,
    metabolism: 1.4,
    reproThreshold: 66,
    reproCost: 28,
    reproChance: 0.6,
    mutation: 0.08,
    maxAge: 72,
    photoRate: 0,
    crowdLimit: 16,
  },
};

// 捕食魚:深海を統べる紅の狩人。群れを裂いて小魚を狩る。深紅系。
const PRED: SpeciesDef = {
  name: "紅牙",
  nameEn: "Crimsonfang",
  description: "深海を統べる紅の狩人。銀の群れを裂いて小魚を狩る。",
  baseColor: [2.6, 0.38, 0.3],
  params: {
    maxSpeed: 93,
    accel: 210,
    vision: 24,
    separation: 1.8,
    alignment: 0.3,
    cohesion: 0.2,
    flee: 0,
    seek: 2.4,
    eatRadius: 5,
    eatGain: 19,
    metabolism: 4.2,
    reproThreshold: 205,
    reproCost: 92,
    reproChance: 0.22,
    mutation: 0.08,
    maxAge: 110,
    photoRate: 0,
    crowdLimit: 6,
  },
};

/** 種定義 [藻, 小魚, 捕食魚]。配列 index は SPECIES_ALGAE(0)/SPECIES_PREY(1)/SPECIES_PRED(2) に対応。 */
export const SPECIES: [SpeciesDef, SpeciesDef, SpeciesDef] = [ALGAE, PREY, PRED];

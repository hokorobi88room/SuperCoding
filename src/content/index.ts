/**
 * content モジュールの公開エントリ。
 * 種定義・プリセット・UI文言を re-export し、
 * SimParams を生成する 2 つのファクトリ関数を提供する。
 */
import type { Preset, SimParams, SpeciesParams } from "../contracts";
import { SPECIES } from "./species";

export { SPECIES } from "./species";
export { PRESETS } from "./presets";
export { TEXT } from "./text";

/** SpeciesParams は数値のみのフラットなオブジェクトなので浅いコピーで十分。 */
function cloneSpeciesParams(p: SpeciesParams): SpeciesParams {
  return { ...p };
}

/**
 * 既定の SimParams を生成する。
 * SPECIES[].params を deep copy し、speed=1 / paused=false を付与する。
 * 返り値は毎回新しいオブジェクトなので、呼び出し側が自由に書き換えてよい。
 */
export function defaultParams(): SimParams {
  return {
    speed: 1,
    paused: false,
    species: [
      cloneSpeciesParams(SPECIES[0].params),
      cloneSpeciesParams(SPECIES[1].params),
      cloneSpeciesParams(SPECIES[2].params),
    ],
  };
}

/**
 * プリセットの overrides を defaultParams() へ deep merge した SimParams を返す。
 * overrides のキーは種 index(0..2)、値は差分パラメータ。
 */
export function presetParams(p: Preset): SimParams {
  const params = defaultParams();
  for (const key of Object.keys(p.overrides)) {
    const idx = Number(key);
    const ov = p.overrides[idx];
    if (!ov) continue;
    if (idx >= 0 && idx < params.species.length) {
      params.species[idx] = { ...params.species[idx], ...ov };
    }
  }
  return params;
}

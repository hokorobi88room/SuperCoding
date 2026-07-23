/**
 * 契約レイアウトの整合性テスト(GPU不要の純粋部分のみ)。
 * 実行: deno task test
 */
import {
  AGENT_STRIDE_BYTES,
  AGENT_STRIDE_F32,
  CELL_SIZE,
  COUNTERS_U32,
  CounterSlot,
  GRID_H,
  GRID_W,
  MAX_AGENTS,
  NUM_CELLS,
  SPECIES_PARAM_VEC4S,
  type SimParams,
  type SpeciesParams,
  WORLD_H,
  WORLD_W,
} from "../src/contracts.ts";
import { packSimParams, SIM_PARAMS_BYTES } from "../src/gpu/buffers.ts";

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

Deno.test("グリッド定数がワールドと整合", () => {
  assertEq(GRID_W * CELL_SIZE, WORLD_W, "GRID_W*CELL_SIZE");
  assertEq(GRID_H * CELL_SIZE, WORLD_H, "GRID_H*CELL_SIZE");
  assertEq(NUM_CELLS, GRID_W * GRID_H, "NUM_CELLS");
  assertEq(AGENT_STRIDE_F32 * 4, AGENT_STRIDE_BYTES, "stride");
  assertEq(MAX_AGENTS % 256, 0, "MAX_AGENTS % WORKGROUP");
  if (CounterSlot.GENE_SUM_BASE + 12 > COUNTERS_U32) {
    throw new Error("counters バッファが遺伝子合計に足りない");
  }
});

function mkSpecies(seed: number): SpeciesParams {
  return {
    maxSpeed: seed + 1,
    accel: seed + 2,
    vision: seed + 3,
    separation: seed + 4,
    alignment: seed + 5,
    cohesion: seed + 6,
    flee: seed + 7,
    seek: seed + 8,
    eatRadius: seed + 9,
    eatGain: seed + 10,
    metabolism: seed + 11,
    reproThreshold: seed + 12,
    reproCost: seed + 13,
    reproChance: seed + 14,
    mutation: seed + 15,
    maxAge: seed + 16,
    photoRate: seed + 17,
    crowdLimit: seed + 18,
  };
}

Deno.test("packSimParams のレイアウト", () => {
  const p: SimParams = {
    speed: 2.5,
    paused: false,
    species: [mkSpecies(100), mkSpecies(200), mkSpecies(300)],
  };
  const buf = packSimParams(p, 0.016, 12.5, 42);
  assertEq(buf.byteLength, SIM_PARAMS_BYTES, "byteLength");
  assertEq(SIM_PARAMS_BYTES, 32 + 3 * SPECIES_PARAM_VEC4S * 16, "expected size");
  const f = new Float32Array(buf);
  const u = new Uint32Array(buf);
  assertEq(Math.abs(f[0] - 0.016) < 1e-6, true, "dt");
  assertEq(f[1], 12.5, "time");
  assertEq(f[2], 2.5, "speedMul");
  assertEq(u[4], 42, "frame");
  // 種2 (seed=300) の先頭 = maxSpeed=301 が正しい位置にあるか
  const o2 = 8 + 2 * SPECIES_PARAM_VEC4S * 4;
  assertEq(f[o2], 301, "species2 maxSpeed");
  assertEq(f[o2 + 15], 316, "species2 maxAge");
  assertEq(f[o2 + 17], 318, "species2 crowdLimit");
  // 種1 の photoRate (v4 先頭)
  const o1 = 8 + 1 * SPECIES_PARAM_VEC4S * 4;
  assertEq(f[o1 + 16], 217, "species1 photoRate");
});

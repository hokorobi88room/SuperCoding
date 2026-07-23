/**
 * 共有GPU資源の生成・初期シード・uniformパック。
 * バッファレイアウトの「唯一の正」。contracts.ts のコメントと常に一致させる。
 * 所有: 統合担当(main)。実装エージェントは読むだけで編集しないこと。
 */
import {
  AGENT_STRIDE_BYTES,
  AGENT_STRIDE_F32,
  CELL_CAPACITY,
  COUNTERS_U32,
  CounterSlot,
  FLOW_TEX_H,
  FLOW_TEX_W,
  MAX_AGENTS,
  MAX_SPAWN_REQUESTS,
  NUM_CELLS,
  OBSTACLE_TEX_H,
  OBSTACLE_TEX_W,
  SPAWN_HEADER_BYTES,
  SPAWN_REQ_STRIDE_BYTES,
  SPECIES_PARAM_VEC4S,
  type SeedSpec,
  type SimBuffers,
  type SimParams,
  WORLD_H,
  WORLD_W,
} from "../contracts";

export const SIM_PARAMS_BYTES = 32 + 3 * SPECIES_PARAM_VEC4S * 16; // 272
export const INTERACTION_BYTES = 32;
export const SPAWN_BUF_BYTES = SPAWN_HEADER_BYTES + MAX_SPAWN_REQUESTS * SPAWN_REQ_STRIDE_BYTES;

export function createSimBuffers(device: GPUDevice): SimBuffers {
  const sb = (size: number, extra: GPUBufferUsageFlags = 0) =>
    device.createBuffer({
      size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | extra,
    });

  return {
    agentData: [
      sb(MAX_AGENTS * AGENT_STRIDE_BYTES),
      sb(MAX_AGENTS * AGENT_STRIDE_BYTES),
    ],
    aliveFlags: sb(MAX_AGENTS * 4),
    freeList: sb(MAX_AGENTS * 4),
    counters: sb(COUNTERS_U32 * 4, GPUBufferUsage.COPY_SRC),
    cellCount: sb(NUM_CELLS * 4),
    cellAgents: sb(NUM_CELLS * CELL_CAPACITY * 4),
    spawnRequests: sb(SPAWN_BUF_BYTES),
    simParams: device.createBuffer({
      size: SIM_PARAMS_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }),
    interaction: device.createBuffer({
      size: INTERACTION_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }),
    obstacleTex: device.createTexture({
      size: [OBSTACLE_TEX_W, OBSTACLE_TEX_H],
      format: "r8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    }),
    flowTex: device.createTexture({
      size: [FLOW_TEX_W, FLOW_TEX_H],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    }),
    countersStaging: device.createBuffer({
      size: COUNTERS_U32 * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    }),
  };
}

/** 種ごとの初期エネルギー [藻, 小魚, 捕食魚] */
export const INITIAL_ENERGY: [number, number, number] = [20, 45, 80];

/**
 * ワールドを初期化してGPUへ書き込む。reset() からも使う。
 * agentData は buffers.agentData[0] に書く(シミュレーションは必ず index0 を
 * 読み側に戻してから呼ぶこと)。
 */
export function seedWorld(
  device: GPUDevice,
  buffers: SimBuffers,
  spec: SeedSpec,
): void {
  const total = Math.min(spec.algae + spec.prey + spec.predators, MAX_AGENTS);
  const agents = new Float32Array(MAX_AGENTS * AGENT_STRIDE_F32);
  const agentsU32 = new Uint32Array(agents.buffer);
  const flags = new Uint32Array(MAX_AGENTS);
  const freeList = new Uint32Array(MAX_AGENTS);
  const counters = new Uint32Array(COUNTERS_U32);

  // 群れの中心をつくる
  const clusters = Math.max(1, spec.clusters | 0);
  const centers: [number, number][] = [];
  for (let i = 0; i < clusters; i++) {
    centers.push([Math.random() * WORLD_W, Math.random() * WORLD_H]);
  }

  const counts = [spec.algae, spec.prey, spec.predators];
  let slot = 0;
  for (let sp = 0; sp < 3; sp++) {
    for (let i = 0; i < counts[sp] && slot < MAX_AGENTS; i++, slot++) {
      const base = slot * AGENT_STRIDE_F32;
      let x: number, y: number;
      if (sp === 0 || clusters <= 1) {
        // 藻は全体に分散
        x = Math.random() * WORLD_W;
        y = Math.random() * WORLD_H;
      } else {
        const c = centers[(i + sp * 7) % clusters];
        const r = Math.abs(gauss()) * 90 + 5;
        const th = Math.random() * Math.PI * 2;
        x = wrap(c[0] + Math.cos(th) * r, WORLD_W);
        y = wrap(c[1] + Math.sin(th) * r, WORLD_H);
      }
      const sp0 = Math.random() * Math.PI * 2;
      const v = sp === 0 ? 2 : 20;
      agents[base + 0] = x;
      agents[base + 1] = y;
      agents[base + 2] = Math.cos(sp0) * v;
      agents[base + 3] = Math.sin(sp0) * v;
      // genes: 中央0.5 ± spread
      for (let g = 0; g < 4; g++) {
        agents[base + 4 + g] = clamp01(
          0.5 + (Math.random() * 2 - 1) * spec.geneSpread,
        );
      }
      agents[base + 8] = INITIAL_ENERGY[sp] * (0.7 + Math.random() * 0.6);
      agents[base + 9] = Math.random() * 5; // age をばらす
      agentsU32[base + 10] = sp;
      agentsU32[base + 11] = (Math.random() * 0xffffffff) >>> 0;
      flags[slot] = 1;
    }
  }

  // フリーリスト: 未使用スロットを積む
  let top = 0;
  for (let i = MAX_AGENTS - 1; i >= total; i--) freeList[top++] = i;
  counters[CounterSlot.FREE_TOP] = top;
  counters[CounterSlot.POP_ALGAE] = counts[0];
  counters[CounterSlot.POP_PREY] = counts[1];
  counters[CounterSlot.POP_PRED] = counts[2];

  device.queue.writeBuffer(buffers.agentData[0], 0, agents);
  device.queue.writeBuffer(buffers.agentData[1], 0, agents);
  device.queue.writeBuffer(buffers.aliveFlags, 0, flags);
  device.queue.writeBuffer(buffers.freeList, 0, freeList);
  device.queue.writeBuffer(buffers.counters, 0, counters);
  device.queue.writeBuffer(
    buffers.spawnRequests,
    0,
    new Uint32Array(SPAWN_BUF_BYTES / 4),
  );
  // 流れ場は「ゼロベクトル」= (128,128,0,0)
  const flow = new Uint8Array(FLOW_TEX_W * FLOW_TEX_H * 4);
  for (let i = 0; i < flow.length; i += 4) {
    flow[i] = 128;
    flow[i + 1] = 128;
  }
  device.queue.writeTexture(
    { texture: buffers.flowTex },
    flow,
    { bytesPerRow: FLOW_TEX_W * 4 },
    [FLOW_TEX_W, FLOW_TEX_H],
  );
  device.queue.writeTexture(
    { texture: buffers.obstacleTex },
    new Uint8Array(OBSTACLE_TEX_W * OBSTACLE_TEX_H),
    { bytesPerRow: OBSTACLE_TEX_W },
    [OBSTACLE_TEX_W, OBSTACLE_TEX_H],
  );
}

/**
 * SimParams を uniform 用にパックする。
 * レイアウト:
 *   offset 0  : vec4f  (dt, time, speedMul, 0)
 *   offset 16 : vec4u  (frame, 0, 0, 0)
 *   offset 32 : 種ごとに vec4f × SPECIES_PARAM_VEC4S、種順 [藻, 小魚, 捕食魚]
 *     v0: maxSpeed, accel, vision, separation
 *     v1: alignment, cohesion, flee, seek
 *     v2: eatRadius, eatGain, metabolism, reproThreshold
 *     v3: reproCost, reproChance, mutation, maxAge
 *     v4: photoRate, crowdLimit, 0, 0
 */
export function packSimParams(
  p: SimParams,
  dt: number,
  time: number,
  frame: number,
): ArrayBuffer {
  const buf = new ArrayBuffer(SIM_PARAMS_BYTES);
  const f = new Float32Array(buf);
  const u = new Uint32Array(buf);
  f[0] = dt;
  f[1] = time;
  f[2] = p.speed;
  u[4] = frame >>> 0;
  for (let sp = 0; sp < 3; sp++) {
    const s = p.species[sp];
    const o = 8 + sp * SPECIES_PARAM_VEC4S * 4;
    f[o + 0] = s.maxSpeed;
    f[o + 1] = s.accel;
    f[o + 2] = s.vision;
    f[o + 3] = s.separation;
    f[o + 4] = s.alignment;
    f[o + 5] = s.cohesion;
    f[o + 6] = s.flee;
    f[o + 7] = s.seek;
    f[o + 8] = s.eatRadius;
    f[o + 9] = s.eatGain;
    f[o + 10] = s.metabolism;
    f[o + 11] = s.reproThreshold;
    f[o + 12] = s.reproCost;
    f[o + 13] = s.reproChance;
    f[o + 14] = s.mutation;
    f[o + 15] = s.maxAge;
    f[o + 16] = s.photoRate;
    f[o + 17] = s.crowdLimit;
  }
  return buf;
}

function gauss(): number {
  let s = 0;
  for (let i = 0; i < 4; i++) s += Math.random();
  return (s - 2) / 1.0;
}
function wrap(v: number, m: number): number {
  return ((v % m) + m) % m;
}
function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

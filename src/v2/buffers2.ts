/**
 * v2 共有GPU資源の生成・創世シード・uniformパック。
 * バッファレイアウトの「唯一の正」。contracts2.ts のコメントと常に一致させる。
 * 所有: 統合担当(Fable)。実装エージェントは読むだけ。
 */
import {
  BRAIN_STRIDE,
  CELL_CAPACITY,
  COUNTERS_U32,
  CounterSlot,
  CREATURE_STRIDE_BYTES,
  CREATURE_STRIDE_F32,
  type GenesisSpec,
  MAX_CREATURES,
  MAX_SPAWN_REQUESTS,
  NUM_CELLS,
  ROLE_CREATURE,
  ROLE_FOOD,
  SIG_H,
  SIG_W,
  SIGNAL_FORMAT,
  SPAWN_HEADER_BYTES,
  SPAWN_REQ_STRIDE_BYTES,
  STRUCT_FORMAT,
  STRUCT_H,
  STRUCT_W,
  type SimBuffers2,
  type WorldConfig,
  WORLD_H,
  WORLD_W,
} from "./contracts2";

export const CONFIG_BYTES = 48;
export const INTERACTION_BYTES = 32;
export const SPAWN_BUF_BYTES =
  SPAWN_HEADER_BYTES + MAX_SPAWN_REQUESTS * SPAWN_REQ_STRIDE_BYTES;

/** 初期エネルギー */
export const FOOD_ENERGY = 16;
export const CREATURE_ENERGY = 60;
/** CPUサンプリングする個体数(ミーム/系譜のクラスタ推定用) */
export const SAMPLE_COUNT = 1024;
export const SAMPLE_STRIDE_F32 = 8; // meme(4)+lineage+diet+energy+role

const OBS_W = 512;
const OBS_H = 288;

export function createSimBuffers2(device: GPUDevice): SimBuffers2 {
  const sb = (size: number, extra: GPUBufferUsageFlags = 0) =>
    device.createBuffer({
      size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | extra,
    });

  const sigTex = () =>
    device.createTexture({
      size: [SIG_W, SIG_H],
      format: SIGNAL_FORMAT,
      usage:
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST,
    });

  return {
    creatureData: [
      sb(MAX_CREATURES * CREATURE_STRIDE_BYTES, GPUBufferUsage.COPY_SRC),
      sb(MAX_CREATURES * CREATURE_STRIDE_BYTES, GPUBufferUsage.COPY_SRC),
    ],
    brainWeights: sb(MAX_CREATURES * BRAIN_STRIDE * 4),
    aliveFlags: sb(MAX_CREATURES * 4),
    freeList: sb(MAX_CREATURES * 4),
    counters: sb(COUNTERS_U32 * 4, GPUBufferUsage.COPY_SRC),
    cellCount: sb(NUM_CELLS * 4),
    cellAgents: sb(NUM_CELLS * CELL_CAPACITY * 4),
    signalField: [sigTex(), sigTex()],
    signalAccum: sb(SIG_W * SIG_H * 4 * 4),
    structAccum: sb(STRUCT_W * STRUCT_H * 4),
    structureGrid: device.createTexture({
      size: [STRUCT_W, STRUCT_H],
      format: STRUCT_FORMAT,
      usage:
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST,
    }),
    obstacleTex: device.createTexture({
      size: [OBS_W, OBS_H],
      format: "r8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    }),
    flowTex: device.createTexture({
      size: [SIG_W, SIG_H],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    }),
    spawnRequests: sb(SPAWN_BUF_BYTES),
    config: device.createBuffer({
      size: CONFIG_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }),
    interaction: device.createBuffer({
      size: INTERACTION_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }),
    countersStaging: device.createBuffer({
      size: COUNTERS_U32 * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    }),
    sampleStaging: device.createBuffer({
      size: SAMPLE_COUNT * SAMPLE_STRIDE_F32 * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    }),
  };
}

/**
 * 世界を創世する。creatureData[0] に書き、脳の重みをランダム初期化。
 * simulation2 は reset() 時に ping-pong を index0 読み側へ戻すこと。
 */
export function seedGenesis(
  device: GPUDevice,
  buffers: SimBuffers2,
  g: GenesisSpec,
): void {
  const creatures = Math.min(g.creatures, MAX_CREATURES);
  const food = Math.min(g.food, MAX_CREATURES - creatures);
  const total = creatures + food;

  const data = new Float32Array(total * CREATURE_STRIDE_F32);
  const dataU = new Uint32Array(data.buffer);
  const flags = new Uint32Array(MAX_CREATURES);
  const freeList = new Uint32Array(MAX_CREATURES);
  const counters = new Uint32Array(COUNTERS_U32);
  const brains = new Float32Array(creatures * BRAIN_STRIDE);

  const clusters = Math.max(1, g.clusters | 0);
  const centers: [number, number][] = [];
  for (let i = 0; i < clusters; i++) {
    centers.push([Math.random() * WORLD_W, Math.random() * WORLD_H]);
  }

  const writeAgent = (
    slot: number,
    role: number,
    x: number,
    y: number,
    energy: number,
  ) => {
    const b = slot * CREATURE_STRIDE_F32;
    const ang = Math.random() * Math.PI * 2;
    const v = role === ROLE_FOOD ? 3 : 24;
    data[b + 0] = x;
    data[b + 1] = y;
    data[b + 2] = Math.cos(ang) * v;
    data[b + 3] = Math.sin(ang) * v;
    data[b + 4] = energy * (0.7 + Math.random() * 0.6);
    data[b + 5] = Math.random() * 4; // age
    data[b + 6] = role === ROLE_FOOD ? 0 : 0.25 + Math.random() * 0.3; // diet(草食寄りから)
    data[b + 7] = 0.35 + Math.random() * 0.4; // size
    // meme(文化ベクトル)
    data[b + 8] = Math.random();
    data[b + 9] = Math.random();
    data[b + 10] = Math.random();
    data[b + 11] = Math.random();
    data[b + 12] = 0; // signalMem
    data[b + 13] = Math.random(); // lineage(始祖色相)
    dataU[b + 14] = role >>> 0;
    dataU[b + 15] = (Math.random() * 0xffffffff) >>> 0;
    flags[slot] = 1;
  };

  // 生命(脳あり)を低スロットへ
  let slot = 0;
  for (let i = 0; i < creatures; i++, slot++) {
    const c = centers[i % clusters];
    const r = Math.abs(gauss()) * 70 + 5;
    const th = Math.random() * Math.PI * 2;
    writeAgent(
      slot,
      ROLE_CREATURE,
      wrap(c[0] + Math.cos(th) * r, WORLD_W),
      wrap(c[1] + Math.sin(th) * r, WORLD_H),
      CREATURE_ENERGY,
    );
    // 脳の重みをランダム初期化(小さめのガウス)
    const bo = i * BRAIN_STRIDE;
    for (let w = 0; w < BRAIN_STRIDE; w++) brains[bo + w] = gauss() * 0.6;
  }
  // 食料(脳なし)を全体に散布
  for (let i = 0; i < food; i++, slot++) {
    writeAgent(
      slot,
      ROLE_FOOD,
      Math.random() * WORLD_W,
      Math.random() * WORLD_H,
      FOOD_ENERGY,
    );
  }

  // フリーリスト: 残りスロット
  let top = 0;
  for (let i = MAX_CREATURES - 1; i >= total; i--) freeList[top++] = i;
  counters[CounterSlot.FREE_TOP] = top;
  counters[CounterSlot.POP_FOOD] = food;
  counters[CounterSlot.POP_CREATURE] = creatures;

  device.queue.writeBuffer(buffers.creatureData[0], 0, data);
  device.queue.writeBuffer(buffers.creatureData[1], 0, data);
  device.queue.writeBuffer(buffers.brainWeights, 0, brains);
  device.queue.writeBuffer(buffers.aliveFlags, 0, flags);
  device.queue.writeBuffer(buffers.freeList, 0, freeList);
  device.queue.writeBuffer(buffers.counters, 0, counters);
  device.queue.writeBuffer(
    buffers.spawnRequests,
    0,
    new Uint32Array(SPAWN_BUF_BYTES / 4),
  );
  // 沈着アキュムレータをゼロクリア
  device.queue.writeBuffer(
    buffers.signalAccum,
    0,
    new Uint32Array(SIG_W * SIG_H * 4),
  );
  device.queue.writeBuffer(
    buffers.structAccum,
    0,
    new Uint32Array(STRUCT_W * STRUCT_H),
  );

  // テクスチャ初期化(ゼロ)
  const sigZero = new Uint16Array(SIG_W * SIG_H * 4); // rgba16float 0 = 0x0000
  for (const tex of buffers.signalField) {
    device.queue.writeTexture(
      { texture: tex },
      sigZero,
      { bytesPerRow: SIG_W * 8 },
      [SIG_W, SIG_H],
    );
  }
  device.queue.writeTexture(
    { texture: buffers.structureGrid },
    new Float32Array(STRUCT_W * STRUCT_H),
    { bytesPerRow: STRUCT_W * 4 },
    [STRUCT_W, STRUCT_H],
  );
  device.queue.writeTexture(
    { texture: buffers.obstacleTex },
    new Uint8Array(OBS_W * OBS_H),
    { bytesPerRow: OBS_W },
    [OBS_W, OBS_H],
  );
  const flow = new Uint8Array(SIG_W * SIG_H * 4);
  for (let i = 0; i < flow.length; i += 4) {
    flow[i] = 128;
    flow[i + 1] = 128;
  }
  device.queue.writeTexture(
    { texture: buffers.flowTex },
    flow,
    { bytesPerRow: SIG_W * 4 },
    [SIG_W, SIG_H],
  );
}

/**
 * config uniform をパック。
 *   f32 0: dt          1: time        2: speedMul   3: mutation
 *   f32 4: signalDecay 5: civ(0/1)    6: foodEnergy 7: creatureEnergy
 *   u32 8: frame       9..11: pad
 */
export function packConfig(
  c: WorldConfig,
  dt: number,
  time: number,
  frame: number,
): ArrayBuffer {
  const buf = new ArrayBuffer(CONFIG_BYTES);
  const f = new Float32Array(buf);
  const u = new Uint32Array(buf);
  f[0] = dt;
  f[1] = time;
  f[2] = c.speed;
  f[3] = c.mutation;
  f[4] = c.signalDecay;
  f[5] = c.civilization ? 1 : 0;
  f[6] = FOOD_ENERGY;
  f[7] = CREATURE_ENERGY;
  u[8] = frame >>> 0;
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

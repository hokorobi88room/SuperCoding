/**
 * 神経シミュレーションコア。
 * 各個体が MLP(NIN=16→NHID=16→NOUT=8, tanh)の脳を持ち、繁殖で重みを突然変異させて進化する。
 * tick パス順: spawn → clearGrid → buildGrid → behavior → signalBake → death → birth
 *              →(civ時)structBake → census →(10tickごと)sampleGather+統計コピー。
 * ping-pong は creatureData と signalField の両方。currentCreatures/currentSignal は直近の書き側。
 * バッファ/uniform レイアウトは contracts2.ts / buffers2.ts が正。
 */
import {
  B1_OFF,
  B2_OFF,
  BRAIN_STRIDE,
  CELL_CAPACITY,
  CELL_SIZE,
  COUNTERS_U32,
  CounterSlot,
  defaultConfig,
  Divine,
  FIXED_POINT,
  type GenesisSpec,
  GRID_H,
  GRID_W,
  type ISimulation2,
  MAX_CREATURES,
  MAX_SPAWN_REQUESTS,
  NIN,
  NHID,
  NOUT,
  NUM_CELLS,
  ROLE_CREATURE,
  ROLE_FOOD,
  SIG_H,
  SIG_W,
  type SimBuffers2,
  type SpawnRequest,
  STRUCT_H,
  STRUCT_W,
  W1_OFF,
  W2_OFF,
  type WorldConfig,
  WORKGROUP_SIZE,
  WORLD_H,
  WORLD_W,
  type WorldStats,
} from "../contracts2";
import {
  packConfig,
  SAMPLE_COUNT,
  SAMPLE_STRIDE_F32,
  seedGenesis,
  SPAWN_BUF_BYTES,
} from "../buffers2";
import simShaderSrc from "./wgsl/sim2.wgsl?raw";

// ---------------------------------------------------------------------
// WGSL 定数プレリュード(contracts2 の値を注入して drift を防ぐ)
// ---------------------------------------------------------------------
function wgslConsts(): string {
  const S = CounterSlot;
  return [
    `const WORLD = vec2f(${WORLD_W.toFixed(1)}, ${WORLD_H.toFixed(1)});`,
    `const MAXC = ${MAX_CREATURES}u;`,
    `const CELL_SIZE = ${CELL_SIZE.toFixed(1)};`,
    `const GRID_W = ${GRID_W};`,
    `const GRID_H = ${GRID_H};`,
    `const GRID_W_U = ${GRID_W}u;`,
    `const GRID_H_U = ${GRID_H}u;`,
    `const NUM_CELLS = ${NUM_CELLS}u;`,
    `const CELL_CAP = ${CELL_CAPACITY}u;`,
    `const MAX_SPAWN_REQ = ${MAX_SPAWN_REQUESTS}u;`,
    `const SIG_W_I = ${SIG_W};`,
    `const SIG_H_I = ${SIG_H};`,
    `const SIG_W_U = ${SIG_W}u;`,
    `const SIG_H_U = ${SIG_H}u;`,
    `const SIGWF = ${SIG_W.toFixed(1)};`,
    `const SIGHF = ${SIG_H.toFixed(1)};`,
    `const STR_W_U = ${STRUCT_W}u;`,
    `const STR_H_U = ${STRUCT_H}u;`,
    `const STRWF = ${STRUCT_W.toFixed(1)};`,
    `const STRHF = ${STRUCT_H.toFixed(1)};`,
    `const FP = ${FIXED_POINT.toFixed(1)};`,
    `const R_FOOD = ${ROLE_FOOD}u;`,
    `const R_CREATURE = ${ROLE_CREATURE}u;`,
    // 統合ストレージ構造体の固定配列長(baseline 8本に束ねるため)
    `const COUNTERS_LEN = ${COUNTERS_U32}u;`,
    `const CELL_AGENTS_LEN = ${NUM_CELLS * CELL_CAPACITY}u;`,
    `const SIG_ACCUM_LEN = ${SIG_W * SIG_H * 4}u;`,
    `const STRUCT_ACCUM_LEN = ${STRUCT_W * STRUCT_H}u;`,
    `const SAMPLE_LEN = ${SAMPLE_COUNT * SAMPLE_STRIDE_F32}u;`,
    `const NIN = ${NIN};`,
    `const NHID = ${NHID};`,
    `const NOUT = ${NOUT};`,
    `const NIN_U = ${NIN}u;`,
    `const NHID_U = ${NHID}u;`,
    `const NOUT_U = ${NOUT}u;`,
    `const W1_OFF = ${W1_OFF}u;`,
    `const B1_OFF = ${B1_OFF}u;`,
    `const W2_OFF = ${W2_OFF}u;`,
    `const B2_OFF = ${B2_OFF}u;`,
    `const BRAIN_STRIDE = ${BRAIN_STRIDE}u;`,
    `const C_FREE_TOP = ${S.FREE_TOP}u;`,
    `const C_POP_FOOD = ${S.POP_FOOD}u;`,
    `const C_POP_CREATURE = ${S.POP_CREATURE}u;`,
    `const C_BIRTHS = ${S.BIRTHS}u;`,
    `const C_DEATHS = ${S.DEATHS}u;`,
    `const C_EATS = ${S.EATS}u;`,
    `const C_KILLS = ${S.KILLS}u;`,
    `const C_BUILDS = ${S.BUILDS}u;`,
    `const C_SUM_DIET = ${S.SUM_DIET}u;`,
    `const C_SUM_AGGR = ${S.SUM_AGGR}u;`,
    `const C_SUM_SOCIAL = ${S.SUM_SOCIAL}u;`,
    `const C_SUM_SPEED = ${S.SUM_SPEED}u;`,
    `const C_SUM_EMIT = ${S.SUM_EMIT}u;`,
    `const C_SUM_SIZE = ${S.SUM_SIZE}u;`,
    `const SAMPLE_COUNT = ${SAMPLE_COUNT}u;`,
    `const SAMPLE_STRIDE = ${SAMPLE_STRIDE_F32}u;`,
    `const T_SMITE = ${Divine.SMITE}u;`,
    `const T_BECKON = ${Divine.BECKON}u;`,
    `const T_REPEL = ${Divine.REPEL}u;`,
    `const T_MAELSTROM = ${Divine.MAELSTROM}u;`,
    `const PI = 3.14159265;`,
    "",
  ].join("\n");
}

// dispatch のワークグループ数
const CREATURE_GROUPS = Math.ceil(MAX_CREATURES / WORKGROUP_SIZE);
const CLEAR_GROUPS = Math.ceil(NUM_CELLS / WORKGROUP_SIZE);
const SIG_GROUPS = Math.ceil((SIG_W * SIG_H) / WORKGROUP_SIZE);
const STRUCT_GROUPS = Math.ceil((STRUCT_W * STRUCT_H) / WORKGROUP_SIZE);
const SAMPLE_GROUPS = Math.ceil(SAMPLE_COUNT / WORKGROUP_SIZE);

// 統計を GPU から読み戻す間隔(tick)
const READBACK_INTERVAL = 10;

interface Pipelines {
  spawn: GPUComputePipeline;
  clearGrid: GPUComputePipeline;
  buildGrid: GPUComputePipeline;
  behavior: GPUComputePipeline;
  signalBake: GPUComputePipeline;
  death: GPUComputePipeline;
  birth: GPUComputePipeline;
  structBake: GPUComputePipeline;
  census: GPUComputePipeline;
  sampleGather: GPUComputePipeline;
}

function makeStats(): WorldStats {
  return {
    populations: [0, 0],
    birthsPerSec: 0,
    deathsPerSec: 0,
    eatsPerSec: 0,
    killsPerSec: 0,
    buildsPerSec: 0,
    avgDiet: 0.3,
    avgAggression: 0,
    avgSocial: 0,
    avgSpeed: 0,
    avgCulture: 0,
    avgSize: 0.5,
    tribes: 1,
    epoch: 0,
    simTime: 0,
  };
}

export function createSimulation2(
  device: GPUDevice,
  buffers: SimBuffers2,
): ISimulation2 {
  // --- シェーダ / パイプライン ---
  const module = device.createShaderModule({
    code: wgslConsts() + simShaderSrc,
  });

  // sampleGather の詰め先は aux.sample(統合バッファ aux 内)。
  // aux 先頭に SpawnBuf、その後ろに sample 配列が並ぶ(offset = SPAWN_BUF_BYTES)。

  const bufEntry = (
    binding: number,
    type: GPUBufferBindingType,
  ): GPUBindGroupLayoutEntry => ({
    binding,
    visibility: GPUShaderStage.COMPUTE,
    buffer: { type },
  });

  // storage buffer は binding 0..7 の 8 本(= WebGPU baseline 上限ちょうど)。
  // 上限引き上げ要求なしで動くよう、sim 専用の小バッファは構造体で束ねてある。
  const bgl = device.createBindGroupLayout({
    entries: [
      bufEntry(0, "storage"), // creatureA
      bufEntry(1, "storage"), // creatureB
      bufEntry(2, "storage"), // brain
      bufEntry(3, "storage"), // flags(aliveFlags)
      bufEntry(4, "storage"), // ctrl  = counters + freeList
      bufEntry(5, "storage"), // grid  = cellCount + cellAgents
      bufEntry(6, "storage"), // accum = signalAccum + structAccum
      bufEntry(7, "storage"), // aux   = spawn + sample
      bufEntry(8, "uniform"), // cfg
      bufEntry(9, "uniform"), // inter
      {
        binding: 10,
        visibility: GPUShaderStage.COMPUTE,
        texture: { sampleType: "float" },
      },
      {
        binding: 11,
        visibility: GPUShaderStage.COMPUTE,
        texture: { sampleType: "float" },
      },
      {
        binding: 12,
        visibility: GPUShaderStage.COMPUTE,
        sampler: { type: "filtering" },
      },
      {
        binding: 13,
        visibility: GPUShaderStage.COMPUTE,
        texture: { sampleType: "float" },
      },
      {
        binding: 14,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: { access: "write-only", format: "rgba16float" },
      },
      {
        binding: 15,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: { access: "read-write", format: "r32float" },
      },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bgl],
  });

  const mkPipe = (entryPoint: string): GPUComputePipeline =>
    device.createComputePipeline({
      layout: pipelineLayout,
      compute: { module, entryPoint },
    });

  const pipe: Pipelines = {
    spawn: mkPipe("spawn"),
    clearGrid: mkPipe("clearGrid"),
    buildGrid: mkPipe("buildGrid"),
    behavior: mkPipe("behavior"),
    signalBake: mkPipe("signalBake"),
    death: mkPipe("death"),
    birth: mkPipe("birth"),
    structBake: mkPipe("structBake"),
    census: mkPipe("census"),
    sampleGather: mkPipe("sampleGather"),
  };

  // --- サンプラー / テクスチャビュー ---
  const sampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
    addressModeU: "repeat",
    addressModeV: "repeat",
  });
  const obstacleView = buffers.obstacleTex.createView();
  const flowView = buffers.flowTex.createView();
  const sigView: [GPUTextureView, GPUTextureView] = [
    buffers.signalField[0].createView(),
    buffers.signalField[1].createView(),
  ];
  const structView = buffers.structureGrid.createView();

  // --- バインドグループ(ping-pong 用に 2 組)---
  const makeBG = (aIdx: number): GPUBindGroup =>
    device.createBindGroup({
      layout: bgl,
      entries: [
        { binding: 0, resource: { buffer: buffers.creatureData[aIdx] } },
        { binding: 1, resource: { buffer: buffers.creatureData[1 - aIdx] } },
        { binding: 2, resource: { buffer: buffers.brainWeights } },
        { binding: 3, resource: { buffer: buffers.aliveFlags } },
        { binding: 4, resource: { buffer: buffers.ctrl } },
        { binding: 5, resource: { buffer: buffers.grid } },
        { binding: 6, resource: { buffer: buffers.accum } },
        { binding: 7, resource: { buffer: buffers.aux } },
        { binding: 8, resource: { buffer: buffers.config } },
        { binding: 9, resource: { buffer: buffers.interaction } },
        { binding: 10, resource: obstacleView },
        { binding: 11, resource: flowView },
        { binding: 12, resource: sampler },
        { binding: 13, resource: sigView[aIdx] },
        { binding: 14, resource: sigView[1 - aIdx] },
        { binding: 15, resource: structView },
      ],
    });
  // bindGroups[readIdx] を使う: readIdx=0 のとき A=creatureData[0], sigRead=signalField[0]
  const bindGroups: [GPUBindGroup, GPUBindGroup] = [makeBG(0), makeBG(1)];

  // --- 内部状態 ---
  let config: WorldConfig = defaultConfig();
  const stats: WorldStats = makeStats();

  let readIdx = 0; // 現在の読み側 index
  let frame = 0;
  let tickIndex = 0;
  let simTime = 0;
  let initialCreatures = 1;

  // 統計差分の基準
  let prevBirths = 0;
  let prevDeaths = 0;
  let prevEats = 0;
  let prevKills = 0;
  let prevBuilds = 0;
  let prevReadTime = 0;
  let statsPrimed = false;

  // リードバック管理
  let copyRequested = false;
  let countersBusy = false;
  let sampleBusy = false;
  let resetGen = 0;

  const encodePass = (
    encoder: GPUCommandEncoder,
    pipeline: GPUComputePipeline,
    bg: GPUBindGroup,
    groups: number,
  ): void => {
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bg);
    pass.dispatchWorkgroups(groups);
    pass.end();
  };

  const updateStats = (data: Uint32Array): void => {
    const popFood = data[CounterSlot.POP_FOOD];
    const popCreat = data[CounterSlot.POP_CREATURE];
    const births = data[CounterSlot.BIRTHS];
    const deaths = data[CounterSlot.DEATHS];
    const eats = data[CounterSlot.EATS];
    const kills = data[CounterSlot.KILLS];
    const builds = data[CounterSlot.BUILDS];
    const now = simTime;

    if (statsPrimed) {
      const dtT = Math.max(1e-3, now - prevReadTime);
      const a = 0.4; // 指数移動平均係数
      const dB = (births - prevBirths) >>> 0;
      const dD = (deaths - prevDeaths) >>> 0;
      const dE = (eats - prevEats) >>> 0;
      const dK = (kills - prevKills) >>> 0;
      const dBu = (builds - prevBuilds) >>> 0;
      stats.birthsPerSec += (dB / dtT - stats.birthsPerSec) * a;
      stats.deathsPerSec += (dD / dtT - stats.deathsPerSec) * a;
      stats.eatsPerSec += (dE / dtT - stats.eatsPerSec) * a;
      stats.killsPerSec += (dK / dtT - stats.killsPerSec) * a;
      stats.buildsPerSec += (dBu / dtT - stats.buildsPerSec) * a;
    } else {
      statsPrimed = true;
      stats.birthsPerSec = 0;
      stats.deathsPerSec = 0;
      stats.eatsPerSec = 0;
      stats.killsPerSec = 0;
      stats.buildsPerSec = 0;
    }
    prevBirths = births;
    prevDeaths = deaths;
    prevEats = eats;
    prevKills = kills;
    prevBuilds = builds;
    prevReadTime = now;

    stats.populations = [popFood, popCreat];
    const inv = popCreat > 0 ? 1 / (FIXED_POINT * popCreat) : 0;
    stats.avgDiet = data[CounterSlot.SUM_DIET] * inv;
    stats.avgAggression = data[CounterSlot.SUM_AGGR] * inv;
    stats.avgSocial = data[CounterSlot.SUM_SOCIAL] * inv;
    stats.avgSpeed = data[CounterSlot.SUM_SPEED] * inv;
    stats.avgCulture = data[CounterSlot.SUM_EMIT] * inv;
    stats.avgSize = data[CounterSlot.SUM_SIZE] * inv;
    stats.epoch = Math.floor(births / Math.max(1, initialCreatures));
    stats.simTime = now;
  };

  // meme をグリッド量子化してユニークセル数で部族数を推定(上限32)
  const estimateTribes = (arr: Float32Array): number => {
    const seen = new Set<number>();
    for (let s = 0; s < SAMPLE_COUNT; s++) {
      const b = s * SAMPLE_STRIDE_F32;
      const role = arr[b + 7];
      if (role < 0.5) continue; // 生命(role=1)かつ生存のみ
      const q = (v: number): number => {
        const t = v < 0 ? 0 : v > 1 ? 1 : v;
        return Math.min(3, (t * 4) | 0);
      };
      const key =
        q(arr[b]) | (q(arr[b + 1]) << 2) | (q(arr[b + 2]) << 4) |
        (q(arr[b + 3]) << 6);
      seen.add(key);
    }
    return Math.max(1, Math.min(32, seen.size));
  };

  const sim: ISimulation2 = {
    get currentCreatures(): GPUBuffer {
      return buffers.creatureData[readIdx];
    },
    get currentSignal(): GPUTexture {
      return buffers.signalField[readIdx];
    },
    get structureGrid(): GPUTexture {
      return buffers.structureGrid;
    },
    get stats(): WorldStats {
      return stats;
    },

    reset(g: GenesisSpec): void {
      seedGenesis(device, buffers, g);
      readIdx = 0;
      frame = 0;
      tickIndex = 0;
      simTime = 0;
      initialCreatures = Math.max(1, Math.min(g.creatures, MAX_CREATURES));
      prevBirths = 0;
      prevDeaths = 0;
      prevEats = 0;
      prevKills = 0;
      prevBuilds = 0;
      prevReadTime = 0;
      statsPrimed = false;
      copyRequested = false;
      resetGen++;
      // 表示の暫定初期化
      stats.populations = [
        Math.min(g.food, MAX_CREATURES),
        initialCreatures,
      ];
      stats.birthsPerSec = 0;
      stats.deathsPerSec = 0;
      stats.eatsPerSec = 0;
      stats.killsPerSec = 0;
      stats.buildsPerSec = 0;
      stats.avgDiet = 0.3;
      stats.avgAggression = 0;
      stats.avgSocial = 0;
      stats.avgSpeed = 0;
      stats.avgCulture = 0;
      stats.avgSize = 0.5;
      stats.tribes = 1;
      stats.epoch = 0;
      stats.simTime = 0;
    },

    setConfig(c: WorldConfig): void {
      config = c;
    },

    tick(encoder: GPUCommandEncoder, dt: number): void {
      // config uniform を毎tick更新(dt/time/frame も同経路)
      device.queue.writeBuffer(
        buffers.config,
        0,
        packConfig(config, dt, simTime, frame),
      );

      const bg = bindGroups[readIdx];
      encodePass(encoder, pipe.spawn, bg, 1);
      encodePass(encoder, pipe.clearGrid, bg, CLEAR_GROUPS);
      encodePass(encoder, pipe.buildGrid, bg, CREATURE_GROUPS);
      encodePass(encoder, pipe.behavior, bg, CREATURE_GROUPS);
      encodePass(encoder, pipe.signalBake, bg, SIG_GROUPS);
      encodePass(encoder, pipe.death, bg, CREATURE_GROUPS);
      encodePass(encoder, pipe.birth, bg, CREATURE_GROUPS);
      if (config.civilization) {
        encodePass(encoder, pipe.structBake, bg, STRUCT_GROUPS);
      }
      encodePass(encoder, pipe.census, bg, CREATURE_GROUPS);

      tickIndex++;
      // 10tickごとに counters と sample を staging へコピー(マップ中はスキップ)
      if (
        tickIndex % READBACK_INTERVAL === 0 &&
        !countersBusy &&
        !sampleBusy &&
        !copyRequested
      ) {
        encodePass(encoder, pipe.sampleGather, bg, SAMPLE_GROUPS);
        // ctrl 先頭に counters(24 u32)が並ぶ → offset 0 から読み戻す。
        encoder.copyBufferToBuffer(
          buffers.ctrl,
          0,
          buffers.countersStaging,
          0,
          COUNTERS_U32 * 4,
        );
        // aux は [SpawnBuf | sample[]] なので sample は SPAWN_BUF_BYTES から。
        encoder.copyBufferToBuffer(
          buffers.aux,
          SPAWN_BUF_BYTES,
          buffers.sampleStaging,
          0,
          SAMPLE_COUNT * SAMPLE_STRIDE_F32 * 4,
        );
        copyRequested = true;
      }

      simTime += dt;
      frame = (frame + 1) >>> 0;
      readIdx = 1 - readIdx; // 書き側Bが次の読み側
    },

    afterSubmit(): void {
      if (!copyRequested) return;
      copyRequested = false;
      const gen = resetGen;

      if (!countersBusy) {
        countersBusy = true;
        const cs = buffers.countersStaging;
        cs
          .mapAsync(GPUMapMode.READ)
          .then(() => {
            const d = new Uint32Array(cs.getMappedRange().slice(0));
            cs.unmap();
            countersBusy = false;
            if (gen === resetGen) updateStats(d);
          })
          .catch(() => {
            countersBusy = false;
          });
      }

      if (!sampleBusy) {
        sampleBusy = true;
        const ss = buffers.sampleStaging;
        ss
          .mapAsync(GPUMapMode.READ)
          .then(() => {
            const d = new Float32Array(ss.getMappedRange().slice(0));
            ss.unmap();
            sampleBusy = false;
            if (gen === resetGen) stats.tribes = estimateTribes(d);
          })
          .catch(() => {
            sampleBusy = false;
          });
      }
    },

    requestSpawns(reqs: SpawnRequest[]): void {
      const n = Math.min(reqs.length, MAX_SPAWN_REQUESTS);
      const buf = new ArrayBuffer(SPAWN_BUF_BYTES);
      const u = new Uint32Array(buf);
      const f = new Float32Array(buf);
      u[0] = n; // ヘッダ: 有効リクエスト数
      // ヘッダ16B(u32×4) の後に SpawnReq(32B=8word)が並ぶ
      for (let k = 0; k < n; k++) {
        const r = reqs[k];
        const bf = 4 + k * 8;
        f[bf + 0] = r.x;
        f[bf + 1] = r.y;
        u[bf + 2] = r.role >>> 0;
        u[bf + 3] = Math.min(64, Math.max(0, r.count | 0));
        f[bf + 4] = r.spread;
        f[bf + 5] = r.energy;
        // pad(bf+6, bf+7) は 0
      }
      // aux 先頭が SpawnBuf なので offset 0 にそのまま書ける。
      device.queue.writeBuffer(buffers.aux, 0, buf);
    },
  };

  return sim;
}

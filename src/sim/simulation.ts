/**
 * シミュレーションコア。
 * WebGPUコンピュートで 10万体規模の進化生態系を駆動する。
 * tick のパス実行順: spawn → clearGrid → buildGrid → behavior → death → birth → census。
 * ping-pong: tick 開始時の読み側を A、書き側を B とし、tick 終了時に swap。
 * バッファ/uniform レイアウトは contracts.ts / gpu/buffers.ts が正。
 */
import {
  CELL_CAPACITY,
  CELL_SIZE,
  COUNTERS_U32,
  CounterSlot,
  GENE_FIXED_POINT,
  GRID_H,
  GRID_W,
  type ISimulation,
  MAX_AGENTS,
  MAX_SPAWN_REQUESTS,
  NUM_CELLS,
  type SeedSpec,
  type SimBuffers,
  type SimParams,
  type SimStats,
  SPAWN_HEADER_BYTES,
  SPAWN_REQ_STRIDE_BYTES,
  SPECIES_ALGAE,
  SPECIES_PRED,
  SPECIES_PREY,
  type SpawnRequest,
  Tool,
  WORKGROUP_SIZE,
  WORLD_H,
  WORLD_W,
} from "../contracts";
import { packSimParams, seedWorld } from "../gpu/buffers";
import simShaderSrc from "./wgsl/sim.wgsl?raw";

// ---------------------------------------------------------------------
// WGSL 定数プレリュード(contracts の値を注入して drift を防ぐ)
// ---------------------------------------------------------------------
function wgslConsts(): string {
  return [
    `const WORLD = vec2f(${WORLD_W.toFixed(1)}, ${WORLD_H.toFixed(1)});`,
    `const MAX_AGENTS = ${MAX_AGENTS}u;`,
    `const CELL_SIZE = ${CELL_SIZE};`,
    `const GRID_W = ${GRID_W};`,
    `const GRID_H = ${GRID_H};`,
    `const GRID_W_U = ${GRID_W}u;`,
    `const GRID_H_U = ${GRID_H}u;`,
    `const NUM_CELLS = ${NUM_CELLS}u;`,
    `const CELL_CAP = ${CELL_CAPACITY}u;`,
    `const MAX_SPAWN_REQ = ${MAX_SPAWN_REQUESTS}u;`,
    `const GENE_FP = ${GENE_FIXED_POINT.toFixed(1)};`,
    `const SP_ALGAE = ${SPECIES_ALGAE}u;`,
    `const SP_PREY = ${SPECIES_PREY}u;`,
    `const SP_PRED = ${SPECIES_PRED}u;`,
    `const C_FREE_TOP = ${CounterSlot.FREE_TOP}u;`,
    `const C_POP0 = ${CounterSlot.POP_ALGAE}u;`,
    `const C_BIRTHS = ${CounterSlot.BIRTHS}u;`,
    `const C_DEATHS = ${CounterSlot.DEATHS}u;`,
    `const C_EATS = ${CounterSlot.EATS}u;`,
    `const C_GENE_BASE = ${CounterSlot.GENE_SUM_BASE}u;`,
    `const T_ATTRACT = ${Tool.ATTRACT}u;`,
    `const T_REPEL = ${Tool.REPEL}u;`,
    `const T_VORTEX = ${Tool.VORTEX}u;`,
    `const T_FEAR = ${Tool.FEAR}u;`,
    `const PI = 3.14159265;`,
    "",
  ].join("\n");
}

// dispatch のワークグループ数
const AGENT_GROUPS = Math.ceil(MAX_AGENTS / WORKGROUP_SIZE);
const CLEAR_GROUPS = Math.ceil(NUM_CELLS / WORKGROUP_SIZE);

// 統計を GPU から読み戻す間隔(tick)
const READBACK_INTERVAL = 10;

interface Pipelines {
  spawn: GPUComputePipeline;
  clearGrid: GPUComputePipeline;
  buildGrid: GPUComputePipeline;
  behavior: GPUComputePipeline;
  death: GPUComputePipeline;
  birth: GPUComputePipeline;
  census: GPUComputePipeline;
}

// setParams 未呼び出しでも動くための内蔵デフォルト(DESIGN の初期値)。
function fallbackParams(): SimParams {
  const algae = {
    maxSpeed: 6, accel: 20, vision: 8, separation: 0.3, alignment: 0,
    cohesion: 0, flee: 0, seek: 0, eatRadius: 0, eatGain: 0, metabolism: 0.4,
    reproThreshold: 30, reproCost: 12, reproChance: 0.5, mutation: 0.02,
    maxAge: 80, photoRate: 6, crowdLimit: 10,
  };
  const prey = {
    maxSpeed: 85, accel: 260, vision: 14, separation: 1.4, alignment: 1.0,
    cohesion: 0.8, flee: 3.2, seek: 1.2, eatRadius: 3.5, eatGain: 14,
    metabolism: 2.2, reproThreshold: 70, reproCost: 30, reproChance: 0.8,
    mutation: 0.08, maxAge: 70, photoRate: 0, crowdLimit: 22,
  };
  const pred = {
    maxSpeed: 105, accel: 220, vision: 24, separation: 1.8, alignment: 0.3,
    cohesion: 0.2, flee: 0, seek: 2.4, eatRadius: 5, eatGain: 55,
    metabolism: 3.0, reproThreshold: 160, reproCost: 70, reproChance: 0.35,
    mutation: 0.08, maxAge: 110, photoRate: 0, crowdLimit: 6,
  };
  return { speed: 1, paused: false, species: [algae, prey, pred] };
}

function makeStats(): SimStats {
  return {
    populations: [0, 0, 0],
    birthsPerSec: 0,
    deathsPerSec: 0,
    eatsPerSec: 0,
    avgGenes: [
      [0.5, 0.5, 0.5, 0.5],
      [0.5, 0.5, 0.5, 0.5],
      [0.5, 0.5, 0.5, 0.5],
    ],
    simTime: 0,
  };
}

export function createSimulation(
  device: GPUDevice,
  buffers: SimBuffers,
): ISimulation {
  // --- シェーダ / パイプライン ---
  const module = device.createShaderModule({
    code: wgslConsts() + simShaderSrc,
  });

  const bufEntry = (
    binding: number,
    type: GPUBufferBindingType,
  ): GPUBindGroupLayoutEntry => ({
    binding,
    visibility: GPUShaderStage.COMPUTE,
    buffer: { type },
  });

  const bgl = device.createBindGroupLayout({
    entries: [
      bufEntry(0, "storage"),
      bufEntry(1, "storage"),
      bufEntry(2, "storage"),
      bufEntry(3, "storage"),
      bufEntry(4, "storage"),
      bufEntry(5, "storage"),
      bufEntry(6, "storage"),
      bufEntry(7, "storage"),
      bufEntry(8, "uniform"),
      bufEntry(9, "uniform"),
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
    death: mkPipe("death"),
    birth: mkPipe("birth"),
    census: mkPipe("census"),
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

  // --- バインドグループ(ping-pong 用に 2 組)---
  const makeBG = (aIdx: number): GPUBindGroup =>
    device.createBindGroup({
      layout: bgl,
      entries: [
        { binding: 0, resource: { buffer: buffers.agentData[aIdx] } },
        { binding: 1, resource: { buffer: buffers.agentData[1 - aIdx] } },
        { binding: 2, resource: { buffer: buffers.aliveFlags } },
        { binding: 3, resource: { buffer: buffers.freeList } },
        { binding: 4, resource: { buffer: buffers.counters } },
        { binding: 5, resource: { buffer: buffers.cellCount } },
        { binding: 6, resource: { buffer: buffers.cellAgents } },
        { binding: 7, resource: { buffer: buffers.spawnRequests } },
        { binding: 8, resource: { buffer: buffers.simParams } },
        { binding: 9, resource: { buffer: buffers.interaction } },
        { binding: 10, resource: obstacleView },
        { binding: 11, resource: flowView },
        { binding: 12, resource: sampler },
      ],
    });
  // bindGroups[readIdx] を使う: readIdx=0 のとき A=agentData[0]
  const bindGroups: [GPUBindGroup, GPUBindGroup] = [makeBG(0), makeBG(1)];

  // --- 内部状態 ---
  let params: SimParams = fallbackParams();
  const stats: SimStats = makeStats();

  let readIdx = 0; // 現在の読み側 index
  let frame = 0;
  let tickIndex = 0;
  let simTime = 0;

  // 統計差分の基準
  let prevBirths = 0;
  let prevDeaths = 0;
  let prevEats = 0;
  let prevReadTime = 0;
  let statsPrimed = false;

  // リードバック管理
  let copyRequested = false;
  let readbackBusy = false;
  let resetGen = 0;

  const encodePass = (
    encoder: GPUCommandEncoder,
    pipeline: GPUComputePipeline,
    bg: GPUBindGroup,
    groups: number,
  ): void => {
    // パスごとに分離(dispatch 間のメモリ可視性を WebGPU の自動バリアで保証)
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bg);
    pass.dispatchWorkgroups(groups);
    pass.end();
  };

  const updateStats = (data: Uint32Array): void => {
    const pop: [number, number, number] = [data[1], data[2], data[3]];
    const births = data[4];
    const deaths = data[5];
    const eats = data[6];
    const now = simTime;

    if (statsPrimed) {
      const dtT = Math.max(1e-3, now - prevReadTime);
      const dB = (births - prevBirths) >>> 0;
      const dD = (deaths - prevDeaths) >>> 0;
      const dE = (eats - prevEats) >>> 0;
      const a = 0.4; // 指数移動平均の係数
      stats.birthsPerSec += (dB / dtT - stats.birthsPerSec) * a;
      stats.deathsPerSec += (dD / dtT - stats.deathsPerSec) * a;
      stats.eatsPerSec += (dE / dtT - stats.eatsPerSec) * a;
    } else {
      statsPrimed = true;
      stats.birthsPerSec = 0;
      stats.deathsPerSec = 0;
      stats.eatsPerSec = 0;
    }
    prevBirths = births;
    prevDeaths = deaths;
    prevEats = eats;
    prevReadTime = now;

    stats.populations = pop;
    for (let sp = 0; sp < 3; sp++) {
      const g = stats.avgGenes[sp];
      const p = pop[sp];
      for (let gi = 0; gi < 4; gi++) {
        const sum = data[CounterSlot.GENE_SUM_BASE + sp * 4 + gi];
        g[gi] = p > 0 ? sum / GENE_FIXED_POINT / p : 0;
      }
    }
    stats.simTime = now;
  };

  const sim: ISimulation = {
    get currentAgents(): GPUBuffer {
      return buffers.agentData[readIdx];
    },
    get stats(): SimStats {
      return stats;
    },

    reset(seed: SeedSpec): void {
      seedWorld(device, buffers, seed);
      readIdx = 0;
      frame = 0;
      tickIndex = 0;
      simTime = 0;
      prevBirths = 0;
      prevDeaths = 0;
      prevEats = 0;
      prevReadTime = 0;
      statsPrimed = false;
      copyRequested = false;
      resetGen++;
      // 統計表示を初期化(次のリードバックまでの暫定値)
      stats.populations = [seed.algae, seed.prey, seed.predators];
      stats.birthsPerSec = 0;
      stats.deathsPerSec = 0;
      stats.eatsPerSec = 0;
      for (let sp = 0; sp < 3; sp++) {
        for (let gi = 0; gi < 4; gi++) stats.avgGenes[sp][gi] = 0.5;
      }
      stats.simTime = 0;
    },

    setParams(p: SimParams): void {
      params = p;
    },

    tick(encoder: GPUCommandEncoder, dt: number): void {
      // uniform を毎tick更新(dt/time/frame も同経路)
      const packed = packSimParams(params, dt, simTime, frame);
      device.queue.writeBuffer(buffers.simParams, 0, packed);

      const bg = bindGroups[readIdx];
      encodePass(encoder, pipe.spawn, bg, 1);
      encodePass(encoder, pipe.clearGrid, bg, CLEAR_GROUPS);
      encodePass(encoder, pipe.buildGrid, bg, AGENT_GROUPS);
      encodePass(encoder, pipe.behavior, bg, AGENT_GROUPS);
      encodePass(encoder, pipe.death, bg, AGENT_GROUPS);
      encodePass(encoder, pipe.birth, bg, AGENT_GROUPS);
      encodePass(encoder, pipe.census, bg, AGENT_GROUPS);

      tickIndex++;
      // 10tickごとに counters を staging へコピー(マップ中はスキップ)
      if (tickIndex % READBACK_INTERVAL === 0 && !readbackBusy && !copyRequested) {
        encoder.copyBufferToBuffer(
          buffers.counters,
          0,
          buffers.countersStaging,
          0,
          COUNTERS_U32 * 4,
        );
        copyRequested = true;
      }

      simTime += dt;
      frame = (frame + 1) >>> 0;
      readIdx = 1 - readIdx; // 書き側Bが次の読み側になる
    },

    afterSubmit(): void {
      if (!copyRequested || readbackBusy) return;
      copyRequested = false;
      readbackBusy = true;
      const gen = resetGen;
      const staging = buffers.countersStaging;
      staging
        .mapAsync(GPUMapMode.READ)
        .then(() => {
          const data = new Uint32Array(staging.getMappedRange().slice(0));
          staging.unmap();
          readbackBusy = false;
          // reset を跨いだ古い読み戻しは破棄
          if (gen === resetGen) updateStats(data);
        })
        .catch(() => {
          readbackBusy = false;
        });
    },

    requestSpawns(reqs: SpawnRequest[]): void {
      const n = Math.min(reqs.length, MAX_SPAWN_REQUESTS);
      const buf = new ArrayBuffer(SPAWN_HEADER_BYTES + n * SPAWN_REQ_STRIDE_BYTES);
      const u = new Uint32Array(buf);
      const f = new Float32Array(buf);
      u[0] = n; // ヘッダ: 有効リクエスト数
      for (let k = 0; k < n; k++) {
        const r = reqs[k];
        const bf = (SPAWN_HEADER_BYTES + k * SPAWN_REQ_STRIDE_BYTES) / 4;
        f[bf + 0] = r.x;
        f[bf + 1] = r.y;
        u[bf + 2] = r.species >>> 0;
        u[bf + 3] = Math.min(64, Math.max(0, r.count | 0));
        f[bf + 4] = r.spread;
        f[bf + 5] = r.energy;
        // pad(bf+6, bf+7) は 0
      }
      device.queue.writeBuffer(buffers.spawnRequests, 0, buf);
    },
  };

  return sim;
}

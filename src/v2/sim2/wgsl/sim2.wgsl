// =====================================================================
//  神経シミュレーション WGSL(全パス同一モジュール・単一バインドグループ)
//  先頭に simulation2.ts が contracts2 由来の const 群を注入して結合する。
//  ここでは注入定数(WORLD/MAXC/GRID_*/SIG_*/BRAIN_* 等)を前提に記述する。
//  ping-pong は creatureA/creatureB と sigRead/sigWrite の割当で行う。
// =====================================================================

// ---------------------------------------------------------------------
// 構造体(レイアウトは contracts2.ts / buffers2.ts と厳密一致 / stride 64)
// ---------------------------------------------------------------------
struct Creature {
  pos      : vec2f,   // 0
  vel      : vec2f,   // 8
  energy   : f32,     // 16
  age      : f32,     // 20
  diet     : f32,     // 24  0=草食 .. 1=肉食
  size     : f32,     // 28  体格 0..1
  meme     : vec4f,   // 32  文化ベクトル
  signalMem: f32,     // 48  繁殖意図の退避 / 内部状態
  lineage  : f32,     // 52  始祖色相 0..1
  role     : u32,     // 56  R_FOOD / R_CREATURE
  seed     : u32,     // 60  個体乱数
};                    // stride 64

struct Config {
  c0 : vec4f,  // dt, time, speedMul, mutation
  c1 : vec4f,  // signalDecay, civ, foodEnergy, creatureEnergy
  c2 : vec4u,  // frame, pad, pad, pad
};

struct Interaction {
  mouse    : vec2f,
  radius   : f32,
  strength : f32,
  tool     : u32,
  isDown   : u32,
  pad      : vec2f,
};

struct SpawnReq {
  pos     : vec2f,
  role    : u32,
  count   : u32,
  spread  : f32,
  energy  : f32,
  pad     : vec2f,
};

struct SpawnBuf {
  count : u32,
  p0    : u32,
  p1    : u32,
  p2    : u32,
  reqs  : array<SpawnReq, 16>,
};

// ---------------------------------------------------------------------
// バインディング
// ---------------------------------------------------------------------
@group(0) @binding(0)  var<storage, read_write> creatureA  : array<Creature>;      // 読み側A
@group(0) @binding(1)  var<storage, read_write> creatureB  : array<Creature>;      // 書き側B
@group(0) @binding(2)  var<storage, read_write> brain      : array<f32>;           // 脳の重み(非ping-pong)
@group(0) @binding(3)  var<storage, read_write> flags      : array<atomic<u32>>;   // 0空/1生/2死
@group(0) @binding(4)  var<storage, read_write> freeList   : array<u32>;
@group(0) @binding(5)  var<storage, read_write> counters   : array<atomic<u32>>;
@group(0) @binding(6)  var<storage, read_write> cellCount  : array<atomic<u32>>;
@group(0) @binding(7)  var<storage, read_write> cellAgents : array<u32>;
@group(0) @binding(8)  var<storage, read_write> sb         : SpawnBuf;
@group(0) @binding(9)  var<storage, read_write> sigAccum   : array<atomic<u32>>;   // 信号沈着(固定小数×1024, rgba)
@group(0) @binding(10) var<storage, read_write> structAccum: array<atomic<u32>>;   // 建造沈着
@group(0) @binding(11) var<uniform>             cfg        : Config;
@group(0) @binding(12) var<uniform>             inter      : Interaction;
@group(0) @binding(13) var obstacleTex : texture_2d<f32>;
@group(0) @binding(14) var flowTex     : texture_2d<f32>;
@group(0) @binding(15) var samp        : sampler;
@group(0) @binding(16) var sigRead     : texture_2d<f32>;                          // 信号場 読み(sampled)
@group(0) @binding(17) var sigWrite    : texture_storage_2d<rgba16float, write>;   // 信号場 書き
@group(0) @binding(18) var structGrid  : texture_storage_2d<r32float, read_write>; // 建造(永続)
@group(0) @binding(19) var<storage, read_write> sampleBuf : array<f32>;            // CPUサンプリング詰め先

// ---------------------------------------------------------------------
// 定数(挙動チューニング)
// ---------------------------------------------------------------------
const REPRO_TH   : f32 = 90.0;   // 繁殖エネルギー閾
const REPRO_COST : f32 = 45.0;   // 繁殖コスト(子の初期energy)
const ENERGY_CAP : f32 = 144.0;  // = REPRO_TH * 1.6
const ACCEL      : f32 = 260.0;  // 操舵加速
const FOOD_CAP   : f32 = 35.0;   // 食料の最大energy
const SENSE_R    : f32 = 75.0;   // 近さ入力の正規化半径(3セル分)

// ---------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------

// トーラス最短差分 a→b
fn wrapDelta(bpos: vec2f, apos: vec2f) -> vec2f {
  var d = bpos - apos;
  d = d - round(d / WORLD) * WORLD;
  return d;
}

fn wrapPos(p: vec2f) -> vec2f {
  return p - floor(p / WORLD) * WORLD;
}

fn nz(v: vec2f) -> vec2f {
  let l = length(v);
  if (l > 1e-6) { return v / l; }
  return vec2f(0.0, 0.0);
}

// PCG風 決定的乱数。seed を破壊的に前進させ [0,1) を返す。
fn nextRand(s: ptr<function, u32>) -> f32 {
  var x = (*s) * 747796405u + 2891336453u;
  *s = x;
  var w = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  w = (w >> 22u) ^ w;
  return f32(w) * (1.0 / 4294967296.0);
}

fn hash1(v: u32) -> u32 {
  var x = v * 747796405u + 2891336453u;
  var w = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  return (w >> 22u) ^ w;
}

// 近似ガウス(平均0, 標準偏差≈0.577)。seed 前進。
fn gaussRand(s: ptr<function, u32>) -> f32 {
  var acc = 0.0;
  for (var i = 0u; i < 4u; i = i + 1u) { acc = acc + nextRand(s); }
  return acc - 2.0;
}

fn cellOf(p: vec2f) -> u32 {
  var gx = i32(floor(p.x / CELL_SIZE));
  var gy = i32(floor(p.y / CELL_SIZE));
  gx = ((gx % GRID_W) + GRID_W) % GRID_W;
  gy = ((gy % GRID_H) + GRID_H) % GRID_H;
  return u32(gy) * GRID_W_U + u32(gx);
}

fn sampleObs(p: vec2f) -> f32 {
  return textureSampleLevel(obstacleTex, samp, p / WORLD, 0.0).r;
}

// xy: 流向(-1..1), z: 強さ(0..1)
fn sampleFlow(p: vec2f) -> vec3f {
  let f = textureSampleLevel(flowTex, samp, p / WORLD, 0.0);
  return vec3f(f.xy * 2.0 - vec2f(1.0), f.z);
}

// フリーリスト pop(空なら -1)。アンダーフロー時は atomicAdd で戻す。
fn popFree() -> i32 {
  let old = atomicSub(&counters[C_FREE_TOP], 1u);
  if (old == 0u) {
    atomicAdd(&counters[C_FREE_TOP], 1u);
    return -1;
  }
  return i32(freeList[old - 1u]);
}

fn pushFree(slot: u32) {
  let k = atomicAdd(&counters[C_FREE_TOP], 1u);
  freeList[k] = slot;
}

// 信号場テクセルへ沈着(固定小数×1024)。ch: 0=culture 1=food 2=danger
fn depositSignal(pos: vec2f, ch: u32, amt: f32) {
  if (amt <= 0.0) { return; }
  let sx = u32(clamp(floor(pos.x / WORLD.x * SIGWF), 0.0, SIGWF - 1.0));
  let sy = u32(clamp(floor(pos.y / WORLD.y * SIGHF), 0.0, SIGHF - 1.0));
  let idx = (sy * SIG_W_U + sx) * 4u + ch;
  atomicAdd(&sigAccum[idx], u32(amt * FP));
}

fn depositStruct(pos: vec2f, amt: f32) {
  if (amt <= 0.0) { return; }
  let sx = u32(clamp(floor(pos.x / WORLD.x * STRWF), 0.0, STRWF - 1.0));
  let sy = u32(clamp(floor(pos.y / WORLD.y * STRHF), 0.0, STRHF - 1.0));
  atomicAdd(&structAccum[sy * STR_W_U + sx], u32(amt * FP));
}

// 遺伝+ミーム類似度(0..1, 1=そっくり)
fn kinshipOf(ad: f32, asz: f32, am: vec4f, bd: f32, bsz: f32, bm: vec4f) -> f32 {
  let geneDiff = abs(ad - bd) + abs(asz - bsz);   // 0..2
  let memeDiff = length(am - bm);                 // 0..2
  return clamp(1.0 - (geneDiff + memeDiff) * 0.25, 0.0, 1.0);
}

// ---------------------------------------------------------------------
// 脳フォワード: h = tanh(W1·x + B1); o = tanh(W2·h + B2)
// ---------------------------------------------------------------------
fn brainForward(slot: u32, x: ptr<function, array<f32, NIN>>) -> array<f32, NOUT> {
  let base = slot * BRAIN_STRIDE;
  var h: array<f32, NHID>;
  for (var j = 0u; j < NHID_U; j = j + 1u) {
    var acc = brain[base + B1_OFF + j];
    for (var k = 0u; k < NIN_U; k = k + 1u) {
      acc = acc + brain[base + W1_OFF + j * NIN_U + k] * (*x)[k];
    }
    h[j] = tanh(acc);
  }
  var o: array<f32, NOUT>;
  for (var oi = 0u; oi < NOUT_U; oi = oi + 1u) {
    var acc = brain[base + B2_OFF + oi];
    for (var j = 0u; j < NHID_U; j = j + 1u) {
      acc = acc + brain[base + W2_OFF + oi * NHID_U + j] * h[j];
    }
    o[oi] = tanh(acc);
  }
  return o;
}

// ---------------------------------------------------------------------
// パス0: spawn — CPU発の湧き要求を処理して読み側Aへ書き込む(神の恵み=食料)
// ---------------------------------------------------------------------
@compute @workgroup_size(256)
fn spawn(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  let n = sb.count;
  if (i < n && i < MAX_SPAWN_REQ) {
    let req = sb.reqs[i];
    let baseSeed = (i + 1u) * 2654435761u + cfg.c2.x * 40503u + 2246822519u;
    var c = 0u;
    loop {
      if (c >= req.count) { break; }
      let slot = popFree();
      if (slot < 0) { break; }
      let su = u32(slot);
      var s = hash1(baseSeed + c * 7919u + su * 374761393u);
      let ang = nextRand(&s) * (2.0 * PI);
      let rad = nextRand(&s) * req.spread;
      var ag: Creature;
      ag.pos = wrapPos(req.pos + vec2f(cos(ang), sin(ang)) * rad);
      let va = nextRand(&s) * (2.0 * PI);
      let vsp = select(24.0, 3.0, req.role == R_FOOD);
      ag.vel = vec2f(cos(va), sin(va)) * vsp;
      ag.energy = req.energy;
      ag.age = 0.0;
      ag.diet = select(0.25 + nextRand(&s) * 0.3, 0.0, req.role == R_FOOD);
      ag.size = 0.35 + nextRand(&s) * 0.4;
      ag.meme = vec4f(nextRand(&s), nextRand(&s), nextRand(&s), nextRand(&s));
      ag.signalMem = 0.0;
      ag.lineage = nextRand(&s);
      ag.role = req.role;
      ag.seed = s;
      creatureA[su] = ag;
      // 生命なら脳をランダム初期化
      if (req.role == R_CREATURE) {
        let bo = su * BRAIN_STRIDE;
        for (var w = 0u; w < BRAIN_STRIDE; w = w + 1u) {
          brain[bo + w] = gaussRand(&s) * 0.6;
        }
      }
      atomicStore(&flags[su], 1u);
      c = c + 1u;
    }
  }
  workgroupBarrier();
  if (i == 0u) { sb.count = 0u; }
}

// ---------------------------------------------------------------------
// パス1: clearGrid — セル数リセット + POP/SUM を 0
// ---------------------------------------------------------------------
@compute @workgroup_size(256)
fn clearGrid(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i < NUM_CELLS) { atomicStore(&cellCount[i], 0u); }
  if (i == 0u) {
    atomicStore(&counters[C_POP_FOOD], 0u);
    atomicStore(&counters[C_POP_CREATURE], 0u);
    for (var g = C_SUM_DIET; g <= C_SUM_SIZE; g = g + 1u) {
      atomicStore(&counters[g], 0u);
    }
  }
}

// ---------------------------------------------------------------------
// パス2: buildGrid — 生存個体を空間ハッシュへ登録(読み側Aの座標)
// ---------------------------------------------------------------------
@compute @workgroup_size(256)
fn buildGrid(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= MAXC) { return; }
  if (atomicLoad(&flags[i]) != 1u) { return; }
  let cell = cellOf(creatureA[i].pos);
  let k = atomicAdd(&cellCount[cell], 1u);
  if (k < CELL_CAP) { cellAgents[cell * CELL_CAP + k] = i; }
}

// ---------------------------------------------------------------------
// 食料の挙動:操舵なし・流され・ゆらぎ・減衰・光合成・匂い放出
// ---------------------------------------------------------------------
fn behaviorFood(a_in: Creature, dt: f32) -> Creature {
  var a = a_in;
  var seed = a.seed;

  let fl = sampleFlow(a.pos);
  a.vel = a.vel + fl.xy * fl.z * 30.0 * dt;
  a.vel = a.vel + vec2f(nextRand(&seed) - 0.5, nextRand(&seed) - 0.5) * 8.0;

  let o = sampleObs(a.pos);
  if (o > 0.05) {
    let e = 4.0;
    let gxv = sampleObs(a.pos + vec2f(e, 0.0)) - sampleObs(a.pos - vec2f(e, 0.0));
    let gyv = sampleObs(a.pos + vec2f(0.0, e)) - sampleObs(a.pos - vec2f(0.0, e));
    a.vel = a.vel + nz(-vec2f(gxv, gyv)) * 120.0 * dt;
    a.vel = a.vel * 0.9;
  }

  a.vel = a.vel * exp(-2.0 * dt);
  let spd = length(a.vel);
  if (spd > 12.0) { a.vel = a.vel * (12.0 / spd); }

  a.pos = wrapPos(a.pos + a.vel * dt);
  a.age = a.age + dt;
  a.energy = min(a.energy + 4.0 * dt, FOOD_CAP);

  // 食料の匂いを信号場 g へ沈着
  depositSignal(a.pos, 1u, 3.0 * dt);

  a.seed = seed;
  return a;
}

// ---------------------------------------------------------------------
// 生命の挙動:感覚 → 脳 → 行動(操舵/採餌/捕食/放出/文化/繁殖意図)
// ---------------------------------------------------------------------
fn behaviorCreature(i: u32, a_in: Creature, dt: f32) -> Creature {
  var a = a_in;
  var seed = a.seed;

  let eatRadius = 4.0 + 3.0 * a.size;
  let maxAge = 90.0 + 40.0 * a.size;

  // --- 感覚スキャン(3x3セル)---
  var foodDir = vec2f(0.0); var foodBest = 1e30; var hasFood = false;
  var eatFoodSlot: i32 = -1; var eatFoodBest = 1e30;
  var creatDir = vec2f(0.0); var creatBest = 1e30; var hasCreat = false; var nearKin = 0.0;
  var attackSlot: i32 = -1; var attackBest = 1e30;
  var flockVel = vec2f(0.0); var flockN = 0u;
  var memeTarget = a.meme; var bestNeighE = -1.0; var memeKin = 0.0;

  let bx = i32(floor(a.pos.x / CELL_SIZE));
  let by = i32(floor(a.pos.y / CELL_SIZE));
  for (var oy = -1; oy <= 1; oy = oy + 1) {
    for (var ox = -1; ox <= 1; ox = ox + 1) {
      let gx = (((bx + ox) % GRID_W) + GRID_W) % GRID_W;
      let gy = (((by + oy) % GRID_H) + GRID_H) % GRID_H;
      let cell = u32(gy) * GRID_W_U + u32(gx);
      let cnt = min(min(atomicLoad(&cellCount[cell]), CELL_CAP), 24u);
      for (var k = 0u; k < cnt; k = k + 1u) {
        let j = cellAgents[cell * CELL_CAP + k];
        if (j == i) { continue; }
        if (atomicLoad(&flags[j]) != 1u) { continue; }
        let b = creatureA[j];
        let d = wrapDelta(b.pos, a.pos);
        let dist = max(length(d), 1e-4);
        if (b.role == R_FOOD) {
          if (dist < foodBest) { foodBest = dist; foodDir = d / dist; hasFood = true; }
          if (dist < eatRadius && dist < eatFoodBest) { eatFoodBest = dist; eatFoodSlot = i32(j); }
        } else {
          flockVel = flockVel + b.vel;
          flockN = flockN + 1u;
          let kin = kinshipOf(a.diet, a.size, a.meme, b.diet, b.size, b.meme);
          if (dist < creatBest) { creatBest = dist; creatDir = d / dist; hasCreat = true; nearKin = kin; }
          if (dist < eatRadius && dist < attackBest) { attackBest = dist; attackSlot = i32(j); }
          if (b.energy > bestNeighE) { bestNeighE = b.energy; memeTarget = b.meme; memeKin = kin; }
        }
      }
    }
  }

  let density = clamp(f32(flockN) / 16.0, 0.0, 1.0);
  let flockDir = nz(flockVel);
  let foodProx = select(0.0, clamp(1.0 - foodBest / SENSE_R, 0.0, 1.0), hasFood);
  let creatProx = select(0.0, clamp(1.0 - creatBest / SENSE_R, 0.0, 1.0), hasCreat);

  // 信号場サンプル
  let sig = textureSampleLevel(sigRead, samp, a.pos / WORLD, 0.0);
  let sigCulture = clamp(sig.r * 0.25, 0.0, 1.0);
  let sigDanger = clamp(sig.b * 0.25, 0.0, 1.0);

  let phase = f32(hash1(a.seed)) * (1.0 / 4294967296.0) * (2.0 * PI);
  let clock = sin(a.age * 1.5 + phase);

  // --- 入力ベクトル NIN=16 ---
  var x: array<f32, NIN>;
  x[0]  = clamp(a.energy / ENERGY_CAP, 0.0, 1.0);
  x[1]  = clamp(a.age / maxAge, 0.0, 1.0);
  x[2]  = foodDir.x;
  x[3]  = foodDir.y;
  x[4]  = foodProx;
  x[5]  = creatDir.x;
  x[6]  = creatDir.y;
  x[7]  = creatProx;
  x[8]  = nearKin;
  x[9]  = density;
  x[10] = flockDir.x;
  x[11] = flockDir.y;
  x[12] = sigCulture;
  x[13] = sigDanger;
  x[14] = 1.0;
  x[15] = clock;

  // --- 脳フォワード ---
  var o = brainForward(i, &x);

  // --- 行動適用 ---
  var steer = vec2f(o[0], o[1]);
  let speedMod = o[7] * 0.5 + 0.5;                       // 0..1
  let maxSpeed = (70.0 + 60.0 * a.size) * (0.75 + 0.5 * speedMod);

  // 採餌(草食行動)
  if (o[2] > 0.2 && eatFoodSlot >= 0) {
    let fj = u32(eatFoodSlot);
    if (atomicCompareExchangeWeak(&flags[fj], 1u, 2u).exchanged) {
      a.energy = a.energy + 14.0;
      atomicAdd(&counters[C_EATS], 1u);
    }
  }

  // 捕食(肉食行動)
  if (o[4] > 0.3 && a.diet > 0.35 && attackSlot >= 0) {
    let aj = u32(attackSlot);
    if (atomicCompareExchangeWeak(&flags[aj], 1u, 2u).exchanged) {
      a.energy = a.energy + 20.0 + 30.0 * a.diet;
      atomicAdd(&counters[C_KILLS], 1u);
      depositSignal(creatureA[aj].pos, 2u, 6.0);         // 危険痕跡
    }
  }

  // 文化フェロモン放出
  let emit = max(o[5], 0.0);
  if (emit > 0.0) {
    depositSignal(a.pos, 0u, emit * 8.0 * dt);
    if (emit > 0.1) { atomicAdd(&counters[C_SUM_EMIT], u32(emit * FP)); }
  }

  // ミームドリフト(自己変調 + 近傍高エネルギー個体からの水平伝播)
  var newMeme = a.meme + vec4f(o[6] * 0.02);
  if (flockN > 0u) {
    newMeme = newMeme + (memeTarget - a.meme) * (0.03 * memeKin);
  }
  a.meme = clamp(newMeme, vec4f(0.0), vec4f(1.0));

  // 繁殖意図を signalMem へ退避(birthパスが判定)
  a.signalMem = select(0.0, o[3], o[3] > 0.4);

  // 外力(神の御業 + 障害物 + 流れ)
  var extAccel = vec2f(0.0);
  if (inter.isDown == 1u) {
    let toM = wrapDelta(inter.mouse, a.pos);
    let md = length(toM);
    if (md < inter.radius && md > 1e-4) {
      let dir = toM / md;
      let fall = 1.0 - md / inter.radius;
      let s = inter.strength;
      if (inter.tool == T_SMITE) {
        _ = atomicCompareExchangeWeak(&flags[i], 1u, 2u).exchanged;
      } else if (inter.tool == T_BECKON) {
        extAccel = extAccel + dir * s * 250.0 * fall;
      } else if (inter.tool == T_REPEL) {
        extAccel = extAccel - dir * s * 250.0 * fall;
      } else if (inter.tool == T_MAELSTROM) {
        let tang = vec2f(-dir.y, dir.x);
        extAccel = extAccel + (tang * 250.0 + dir * 60.0) * s * fall;
      }
    }
  }

  // 障害物斥力
  let obs = sampleObs(a.pos);
  if (obs > 0.05) {
    let e = 4.0;
    let gxv = sampleObs(a.pos + vec2f(e, 0.0)) - sampleObs(a.pos - vec2f(e, 0.0));
    let gyv = sampleObs(a.pos + vec2f(0.0, e)) - sampleObs(a.pos - vec2f(0.0, e));
    extAccel = extAccel + nz(-vec2f(gxv, gyv)) * 400.0;
    a.vel = a.vel * 0.9;
  }

  // 流れ場
  let fl = sampleFlow(a.pos);
  a.vel = a.vel + fl.xy * fl.z * 10.0 * dt;

  // 積分
  a.vel = a.vel + steer * ACCEL * dt + extAccel * dt;
  let spd = length(a.vel);
  if (spd > maxSpeed) { a.vel = a.vel * (maxSpeed / spd); }
  a.pos = wrapPos(a.pos + a.vel * dt);
  a.age = a.age + dt;

  let spd01 = min(length(a.vel) / max(maxSpeed, 1.0), 1.0);
  a.energy = a.energy - (0.9 + 1.6 * a.size + 2.2 * a.diet + 0.6 * spd01 * spd01) * dt;
  a.energy = min(a.energy, ENERGY_CAP);

  // 文明ステージ: 余剰エネルギーの個体が構造を沈着
  if (cfg.c1.y > 0.5 && a.energy > REPRO_TH * 1.2) {
    if (nextRand(&seed) < 0.05) {
      depositStruct(a.pos, 3.0);
      atomicAdd(&counters[C_BUILDS], 1u);
    }
  }

  // 形質集計(×1024)
  atomicAdd(&counters[C_SUM_DIET], u32(clamp(a.diet, 0.0, 1.0) * FP));
  atomicAdd(&counters[C_SUM_AGGR], u32(max(o[4], 0.0) * FP));
  atomicAdd(&counters[C_SUM_SOCIAL], u32(density * FP));
  atomicAdd(&counters[C_SUM_SPEED], u32(spd01 * FP));
  atomicAdd(&counters[C_SUM_SIZE], u32(clamp(a.size, 0.0, 1.0) * FP));

  a.seed = seed;
  return a;
}

// ---------------------------------------------------------------------
// パス3: behavior — A読み → B書き
// ---------------------------------------------------------------------
@compute @workgroup_size(256)
fn behavior(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= MAXC) { return; }
  if (atomicLoad(&flags[i]) != 1u) { return; }
  let a = creatureA[i];
  let dt = cfg.c0.x;
  var out: Creature;
  if (a.role == R_FOOD) {
    out = behaviorFood(a, dt);
  } else {
    out = behaviorCreature(i, a, dt);
  }
  creatureB[i] = out;
}

// ---------------------------------------------------------------------
// パス4: signalBake — decay*blur5(field) + accum/1024 を焼き込み、accum=0
// ---------------------------------------------------------------------
@compute @workgroup_size(256)
fn signalBake(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= SIG_W_U * SIG_H_U) { return; }
  let x = i32(idx % SIG_W_U);
  let y = i32(idx / SIG_W_U);

  let xl = (x - 1 + SIG_W_I) % SIG_W_I;
  let xr = (x + 1) % SIG_W_I;
  let yu = (y - 1 + SIG_H_I) % SIG_H_I;
  let yd = (y + 1) % SIG_H_I;

  let c = textureLoad(sigRead, vec2i(x, y), 0);
  let l = textureLoad(sigRead, vec2i(xl, y), 0);
  let r = textureLoad(sigRead, vec2i(xr, y), 0);
  let u = textureLoad(sigRead, vec2i(x, yu), 0);
  let dn = textureLoad(sigRead, vec2i(x, yd), 0);
  let blur = c * 0.4 + (l + r + u + dn) * 0.15;

  let decay = exp(-cfg.c1.x * cfg.c0.x);

  let base = idx * 4u;
  var acc: vec4f;
  acc.x = f32(atomicLoad(&sigAccum[base + 0u])) / FP;
  acc.y = f32(atomicLoad(&sigAccum[base + 1u])) / FP;
  acc.z = f32(atomicLoad(&sigAccum[base + 2u])) / FP;
  acc.w = f32(atomicLoad(&sigAccum[base + 3u])) / FP;

  let outv = clamp(decay * blur + acc, vec4f(0.0), vec4f(8.0));
  textureStore(sigWrite, vec2i(x, y), outv);

  atomicStore(&sigAccum[base + 0u], 0u);
  atomicStore(&sigAccum[base + 1u], 0u);
  atomicStore(&sigAccum[base + 2u], 0u);
  atomicStore(&sigAccum[base + 3u], 0u);
}

// ---------------------------------------------------------------------
// パス5: death — 死(2)を回収 / 餓死・寿命(1)を回収
// ---------------------------------------------------------------------
@compute @workgroup_size(256)
fn death(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= MAXC) { return; }
  let f = atomicLoad(&flags[i]);
  if (f == 2u) {
    if (atomicCompareExchangeWeak(&flags[i], 2u, 0u).exchanged) {
      pushFree(i);
      atomicAdd(&counters[C_DEATHS], 1u);
      depositSignal(creatureB[i].pos, 2u, 5.0);          // 死の痕跡
    }
    return;
  }
  if (f == 1u) {
    let a = creatureB[i];
    // 食料は寿命死しない(捕食されるまで存続)。生命のみ寿命/餓死。
    let dead = a.energy <= 0.0 ||
               (a.role == R_CREATURE && a.age > 90.0 + 40.0 * a.size);
    if (dead) {
      if (atomicCompareExchangeWeak(&flags[i], 1u, 0u).exchanged) {
        pushFree(i);
        atomicAdd(&counters[C_DEATHS], 1u);
        if (a.role == R_CREATURE) { depositSignal(a.pos, 2u, 5.0); }
      }
    }
  }
}

// ---------------------------------------------------------------------
// パス6: birth — 生命は繁殖意図+energyで子生成(神経+遺伝を進化)。食料は分裂。
// ---------------------------------------------------------------------
@compute @workgroup_size(256)
fn birth(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= MAXC) { return; }
  if (atomicLoad(&flags[i]) != 1u) { return; }
  var a = creatureB[i];
  let dt = cfg.c0.x;
  var seed = a.seed;
  let mutation = cfg.c0.w;

  if (a.role == R_CREATURE) {
    if (a.signalMem > 0.4 && a.energy > REPRO_TH) {
      let c = popFree();
      if (c >= 0) {
        let cu = u32(c);
        var child = a;
        let dp = (vec2f(nextRand(&seed), nextRand(&seed)) - vec2f(0.5)) * 8.0;
        child.pos = wrapPos(a.pos + dp);
        child.vel = a.vel * (0.9 + 0.2 * nextRand(&seed));
        child.energy = REPRO_COST;
        child.age = 0.0;
        // 遺伝進化
        child.diet = clamp(a.diet + gaussRand(&seed) * mutation * 0.15, 0.0, 1.0);
        child.size = clamp(a.size + gaussRand(&seed) * mutation * 0.15, 0.0, 1.0);
        let mm = vec4f(gaussRand(&seed), gaussRand(&seed), gaussRand(&seed), gaussRand(&seed));
        child.meme = clamp(a.meme + mm * mutation * 0.1, vec4f(0.0), vec4f(1.0));
        child.lineage = fract(a.lineage + gaussRand(&seed) * 0.01 + 1.0);
        child.signalMem = 0.0;
        child.role = R_CREATURE;
        child.seed = seed * 2654435761u + 1013904223u;
        creatureB[cu] = child;
        // 神経進化: 子の脳 = 親の脳 + gauss*mutation*0.4
        let pb = i * BRAIN_STRIDE;
        let cb = cu * BRAIN_STRIDE;
        for (var w = 0u; w < BRAIN_STRIDE; w = w + 1u) {
          brain[cb + w] = brain[pb + w] + gaussRand(&seed) * mutation * 0.4;
        }
        atomicStore(&flags[cu], 1u);
        atomicAdd(&counters[C_BIRTHS], 1u);
        a.energy = a.energy - REPRO_COST;
        a.signalMem = 0.0;
      }
    }
  } else {
    // 食料の分裂(自己増殖する光合成体)
    if (a.energy >= 34.0 && nextRand(&seed) < 0.35 * dt) {
      let c = popFree();
      if (c >= 0) {
        let cu = u32(c);
        var child = a;
        let dp = (vec2f(nextRand(&seed), nextRand(&seed)) - vec2f(0.5)) * 10.0;
        child.pos = wrapPos(a.pos + dp);
        child.energy = a.energy * 0.5;
        child.age = 0.0;
        child.seed = seed * 2654435761u + 1013904223u;
        creatureB[cu] = child;
        atomicStore(&flags[cu], 1u);
        a.energy = a.energy * 0.5;
      }
    }
  }

  a.seed = seed;
  creatureB[i] = a;
}

// ---------------------------------------------------------------------
// パス7: structBake — 建造沈着を structureGrid へ焼き込み(緩やか減衰)、accum=0
//   civ有効時のみ dispatch される。
// ---------------------------------------------------------------------
@compute @workgroup_size(256)
fn structBake(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= STR_W_U * STR_H_U) { return; }
  let x = i32(idx % STR_W_U);
  let y = i32(idx / STR_W_U);
  let cur = textureLoad(structGrid, vec2i(x, y)).r;
  let add = f32(atomicLoad(&structAccum[idx])) / FP;
  let decay = exp(-0.05 * cfg.c0.x);
  let outv = clamp(cur * decay + add, 0.0, 16.0);
  textureStore(structGrid, vec2i(x, y), vec4f(outv, 0.0, 0.0, 1.0));
  atomicStore(&structAccum[idx], 0u);
}

// ---------------------------------------------------------------------
// パス8: census — 生存個体を role別に集計
// ---------------------------------------------------------------------
@compute @workgroup_size(256)
fn census(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= MAXC) { return; }
  if (atomicLoad(&flags[i]) != 1u) { return; }
  let role = creatureB[i].role;
  if (role == R_FOOD) {
    atomicAdd(&counters[C_POP_FOOD], 1u);
  } else {
    atomicAdd(&counters[C_POP_CREATURE], 1u);
  }
}

// ---------------------------------------------------------------------
// パス9: sampleGather — 先頭 SAMPLE_COUNT 個体の meme/lineage/diet/energy/role を詰める
//   role スロットには 死個体は -1 を格納(CPU側の除外用)。
// ---------------------------------------------------------------------
@compute @workgroup_size(256)
fn sampleGather(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= SAMPLE_COUNT) { return; }
  let a = creatureB[i];
  let base = i * SAMPLE_STRIDE;
  sampleBuf[base + 0u] = a.meme.x;
  sampleBuf[base + 1u] = a.meme.y;
  sampleBuf[base + 2u] = a.meme.z;
  sampleBuf[base + 3u] = a.meme.w;
  sampleBuf[base + 4u] = a.lineage;
  sampleBuf[base + 5u] = a.diet;
  sampleBuf[base + 6u] = a.energy;
  let alive = atomicLoad(&flags[i]) == 1u;
  sampleBuf[base + 7u] = select(-1.0, f32(a.role), alive);
}

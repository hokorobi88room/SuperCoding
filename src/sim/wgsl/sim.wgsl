// =====================================================================
//  シミュレーションコア WGSL(全パス同一モジュール・共通バインドグループ)
//  先頭に simulation.ts が contracts 由来の const 群を注入して結合する。
//  ここでは注入される定数(WORLD/MAX_AGENTS/GRID_* 等)を前提に記述する。
// =====================================================================

// ---------------------------------------------------------------------
// 構造体(レイアウトは contracts.ts / buffers.ts と厳密一致)
// ---------------------------------------------------------------------
struct Agent {
  pos    : vec2f,   // 0
  vel    : vec2f,   // 8
  genes  : vec4f,   // 16 (x:speed y:vision z:size w:wariness)
  energy : f32,     // 32
  age    : f32,     // 36
  species: u32,     // 40
  seed   : u32,     // 44
};                  // stride 48

struct SP {
  v0 : vec4f, // maxSpeed, accel, vision, separation
  v1 : vec4f, // alignment, cohesion, flee, seek
  v2 : vec4f, // eatRadius, eatGain, metabolism, reproThreshold
  v3 : vec4f, // reproCost, reproChance, mutation, maxAge
  v4 : vec4f, // photoRate, crowdLimit, 0, 0
};

struct Params {
  g0 : vec4f,          // dt, time, speedMul, 0
  g1 : vec4u,          // frame, 0, 0, 0
  sp : array<SP, 3>,   // 種順 [藻, 小魚, 捕食魚]
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
  species : u32,
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
// バインディング(単一レイアウト。ping-pong は agentA/agentB の割当で行う)
// ---------------------------------------------------------------------
@group(0) @binding(0)  var<storage, read_write> agentA     : array<Agent>;        // 読み側A
@group(0) @binding(1)  var<storage, read_write> agentB     : array<Agent>;        // 書き側B
@group(0) @binding(2)  var<storage, read_write> flags      : array<atomic<u32>>;  // 0空/1生/2被食
@group(0) @binding(3)  var<storage, read_write> freeList   : array<u32>;
@group(0) @binding(4)  var<storage, read_write> counters   : array<atomic<u32>>;
@group(0) @binding(5)  var<storage, read_write> cellCount  : array<atomic<u32>>;
@group(0) @binding(6)  var<storage, read_write> cellAgents : array<u32>;
@group(0) @binding(7)  var<storage, read_write> sb         : SpawnBuf;
@group(0) @binding(8)  var<uniform>             params     : Params;
@group(0) @binding(9)  var<uniform>             inter      : Interaction;
@group(0) @binding(10) var obstacleTex : texture_2d<f32>;
@group(0) @binding(11) var flowTex     : texture_2d<f32>;
@group(0) @binding(12) var samp        : sampler;

// ---------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------

// ラップ距離(トーラス)。b から見た a への差分ではなく a→b の最短ベクトル。
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

// PCG/LCG 併用の決定的乱数。seed を破壊的に前進させ [0,1) を返す。
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

// pos → グリッドセル index(トーラス mod)
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

// フリーリスト pop(空なら -1)。contracts の規定どおり atomicSub → 失敗時 atomicAdd で戻す。
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

// ---------------------------------------------------------------------
// パス0: spawn — CPU発の湧き要求を処理して読み側Aへ書き込む
// ---------------------------------------------------------------------
@compute @workgroup_size(256)
fn spawn(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  let n = sb.count;
  if (i < n && i < MAX_SPAWN_REQ) {
    let req = sb.reqs[i];
    let baseSeed = (i + 1u) * 2654435761u + params.g1.x * 40503u + 2246822519u;
    var c = 0u;
    loop {
      if (c >= req.count) { break; }
      let slot = popFree();
      if (slot < 0) { break; }
      let su = u32(slot);
      var s = hash1(baseSeed + c * 7919u + su * 374761393u);
      let ang = nextRand(&s) * (2.0 * PI);
      let rad = nextRand(&s) * req.spread;
      var ag: Agent;
      ag.pos = wrapPos(req.pos + vec2f(cos(ang), sin(ang)) * rad);
      let va = nextRand(&s) * (2.0 * PI);
      let vsp = select(20.0, 2.0, req.species == SP_ALGAE);
      ag.vel = vec2f(cos(va), sin(va)) * vsp;
      let gj = (vec4f(nextRand(&s), nextRand(&s), nextRand(&s), nextRand(&s)) - vec4f(0.5)) * 0.3;
      ag.genes = clamp(vec4f(0.5) + gj, vec4f(0.0), vec4f(1.0));
      ag.energy = req.energy;
      ag.age = 0.0;
      ag.species = req.species;
      ag.seed = s;
      agentA[su] = ag;
      atomicStore(&flags[su], 1u);
      c = c + 1u;
    }
  }
  // 全スレッドが count を読み終えてから thread0 がヘッダをクリア
  workgroupBarrier();
  if (i == 0u) { sb.count = 0u; }
}

// ---------------------------------------------------------------------
// パス1: clearGrid — セル数リセット + POP/GENE_SUM を 0 に
// ---------------------------------------------------------------------
@compute @workgroup_size(256)
fn clearGrid(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i < NUM_CELLS) { atomicStore(&cellCount[i], 0u); }
  if (i == 0u) {
    atomicStore(&counters[C_POP0 + 0u], 0u);
    atomicStore(&counters[C_POP0 + 1u], 0u);
    atomicStore(&counters[C_POP0 + 2u], 0u);
    for (var g = 0u; g < 12u; g = g + 1u) {
      atomicStore(&counters[C_GENE_BASE + g], 0u);
    }
  }
}

// ---------------------------------------------------------------------
// パス2: buildGrid — 生存個体を空間ハッシュへ登録(読み側Aの座標を使う)
// ---------------------------------------------------------------------
@compute @workgroup_size(256)
fn buildGrid(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= MAX_AGENTS) { return; }
  if (atomicLoad(&flags[i]) != 1u) { return; }
  let cell = cellOf(agentA[i].pos);
  let k = atomicAdd(&cellCount[cell], 1u);
  if (k < CELL_CAP) { cellAgents[cell * CELL_CAP + k] = i; }
}

// ---------------------------------------------------------------------
// 藻の挙動:操舵なし・強い流され・ゆらぎ・減衰・光合成
// ---------------------------------------------------------------------
fn behaviorAlgae(a_in: Agent, dt: f32) -> Agent {
  var a = a_in;
  let P = params.sp[SP_ALGAE];
  var seed = a.seed;

  let fl = sampleFlow(a.pos);
  a.vel = a.vel + fl.xy * fl.z * 40.0 * dt;

  let noise = vec2f(nextRand(&seed) - 0.5, nextRand(&seed) - 0.5);
  a.vel = a.vel + noise * 8.0;

  let o = sampleObs(a.pos);
  if (o > 0.05) {
    let e = 4.0;
    let gxv = sampleObs(a.pos + vec2f(e, 0.0)) - sampleObs(a.pos - vec2f(e, 0.0));
    let gyv = sampleObs(a.pos + vec2f(0.0, e)) - sampleObs(a.pos - vec2f(0.0, e));
    let away = nz(-vec2f(gxv, gyv));
    a.vel = a.vel + away * 120.0 * dt;
    a.vel = a.vel * 0.9;
  }

  a.vel = a.vel * exp(-2.0 * dt);

  let speedMul = 0.6 + 0.8 * a.genes.x;
  let maxSpeed = P.v0.x * speedMul;
  let spd = length(a.vel);
  if (spd > maxSpeed) { a.vel = a.vel * (maxSpeed / spd); }

  a.pos = wrapPos(a.pos + a.vel * dt);
  a.age = a.age + dt;
  a.energy = a.energy + P.v4.x * dt;
  a.energy = a.energy - P.v2.z * speedMul * speedMul * (0.7 + 0.6 * a.genes.z) * dt;
  a.seed = seed;
  return a;
}

// ---------------------------------------------------------------------
// 小魚/捕食魚の挙動:boids + 逃走/探索 + 捕食(CAS) + 操作/障害物/流れ
// ---------------------------------------------------------------------
fn behaviorFish(i: u32, a_in: Agent, dt: f32) -> Agent {
  var a = a_in;
  let sp = a.species;
  let P = params.sp[sp];

  let speedMul  = 0.6 + 0.8 * a.genes.x;
  let visionMul = 0.6 + 0.8 * a.genes.y;
  let sizeMul   = 0.6 + 0.8 * a.genes.z;
  let wariMul   = 0.5 + 1.0 * a.genes.w;

  let maxSpeed  = P.v0.x * speedMul;
  let accel     = P.v0.y * speedMul;
  let vision    = P.v0.z * visionMul;
  let vision2   = vision * vision;
  let eatRadius = P.v2.x * sizeMul;

  let sepW  = P.v0.w;
  let aliW  = P.v1.x;
  let cohW  = P.v1.y;
  let fleeW = P.v1.z;
  let seekW = P.v1.w;
  let eatGain = P.v2.y;

  var seed = a.seed;

  // 捕食の機能的反応: 空腹時のみ・毎秒レート上限つき(1tick無制限捕食を防ぐ)
  let eatRoll = nextRand(&seed);
  let eatRate = select(1.0, 1.2, sp == SP_PREY); // 最大捕食回数/秒
  let canEat = a.energy < P.v2.w * 1.6 && eatRoll < eatRate * params.g0.x;

  var steer    = vec2f(0.0);
  var extAccel = vec2f(0.0);

  var sepSum = vec2f(0.0);
  var aliSum = vec2f(0.0);
  var cohSum = vec2f(0.0);
  var flock  = 0u;

  var predDir = vec2f(0.0); var predBest = 1e30; var hasPred = false;
  var foodDir = vec2f(0.0); var foodBest = 1e30; var hasFood = false;
  var preySum = vec2f(0.0); var preyN = 0u;
  var preyDir = vec2f(0.0); var preyBest = 1e30; var hasPrey = false;
  var ate = false;

  // 小魚は 3x3、捕食魚は 5x5 セル
  let R: i32 = select(2, 1, sp == SP_PREY);
  let bx = i32(floor(a.pos.x / CELL_SIZE));
  let by = i32(floor(a.pos.y / CELL_SIZE));

  for (var oy = -R; oy <= R; oy = oy + 1) {
    for (var ox = -R; ox <= R; ox = ox + 1) {
      let gx = (((bx + ox) % GRID_W) + GRID_W) % GRID_W;
      let gy = (((by + oy) % GRID_H) + GRID_H) % GRID_H;
      let cell = u32(gy) * GRID_W_U + u32(gx);
      // 近傍スキャン上限: 高密度セルでも1セル16体まで(iGPUでの計算量を抑制。
      // 群れ挙動は統計的に保たれ、捕食は機能的反応の飽和として妥当)
      let cnt = min(min(atomicLoad(&cellCount[cell]), CELL_CAP), 16u);
      for (var k = 0u; k < cnt; k = k + 1u) {
        let j = cellAgents[cell * CELL_CAP + k];
        if (j == i) { continue; }
        if (atomicLoad(&flags[j]) == 0u) { continue; }
        let b = agentA[j];
        let d = wrapDelta(b.pos, a.pos);
        let dist2raw = dot(d, d);
        if (dist2raw > vision2) { continue; }
        let dist2 = max(dist2raw, 1e-4);
        let dist = sqrt(dist2);

        if (b.species == sp) {
          sepSum = sepSum - d / dist2;
          aliSum = aliSum + b.vel;
          cohSum = cohSum + d;
          flock = flock + 1u;
        }

        if (sp == SP_PREY) {
          if (b.species == SP_PRED) {
            hasPred = true;
            if (dist < predBest) { predBest = dist; predDir = -d / dist; }
          } else if (b.species == SP_ALGAE) {
            if (dist < eatRadius && !ate && canEat) {
              let ex = atomicCompareExchangeWeak(&flags[j], 1u, 2u);
              if (ex.exchanged) {
                a.energy = a.energy + eatGain;
                atomicAdd(&counters[C_EATS], 1u);
                ate = true;
              }
            }
            if (dist < foodBest) { foodBest = dist; foodDir = d / dist; hasFood = true; }
          }
        } else { // SP_PRED
          if (b.species == SP_PREY) {
            preySum = preySum + d;
            preyN = preyN + 1u;
            if (dist < preyBest) { preyBest = dist; preyDir = d / dist; hasPrey = true; }
            if (dist < eatRadius && !ate && canEat) {
              let ex = atomicCompareExchangeWeak(&flags[j], 1u, 2u);
              if (ex.exchanged) {
                a.energy = a.energy + eatGain;
                atomicAdd(&counters[C_EATS], 1u);
                ate = true;
              }
            }
          }
        }
      }
    }
  }

  if (flock > 0u) {
    steer = steer + nz(sepSum) * sepW;
    steer = steer + nz(aliSum) * aliW;
    steer = steer + nz(cohSum) * cohW;
  }

  if (sp == SP_PREY) {
    if (hasPred) {
      let atten = 1.0 / (predBest * 0.05 + 1.0);
      steer = steer + predDir * fleeW * wariMul * (1.0 + atten);
    }
    if (hasFood && a.energy < P.v2.w * 0.8) {
      steer = steer + foodDir * seekW;
    }
  } else {
    if (hasPrey) {
      var huntDir = preyDir;
      if (preyN > 0u) {
        huntDir = nz(nz(preySum) * 0.5 + preyDir * 0.5);
      }
      steer = steer + huntDir * seekW;
    }
  }

  // 操作ツール(interaction uniform)
  if (inter.isDown == 1u) {
    let toM = wrapDelta(inter.mouse, a.pos);
    let md = length(toM);
    if (md < inter.radius && md > 1e-4) {
      let dir = toM / md;
      let fall = 1.0 - md / inter.radius;
      let s = inter.strength;
      if (inter.tool == T_ATTRACT) {
        extAccel = extAccel + dir * s * 250.0 * fall;
      } else if (inter.tool == T_REPEL) {
        extAccel = extAccel - dir * s * 250.0 * fall;
      } else if (inter.tool == T_VORTEX) {
        let tang = vec2f(-dir.y, dir.x);
        extAccel = extAccel + (tang * 250.0 + dir * 60.0) * s * fall;
      } else if (inter.tool == T_FEAR && sp == SP_PREY) {
        extAccel = extAccel - dir * s * 250.0 * fall;
      }
    }
  }

  // 障害物:勾配の逆方向へ強い斥力 + 減速
  let o = sampleObs(a.pos);
  if (o > 0.05) {
    let e = 4.0;
    let gxv = sampleObs(a.pos + vec2f(e, 0.0)) - sampleObs(a.pos - vec2f(e, 0.0));
    let gyv = sampleObs(a.pos + vec2f(0.0, e)) - sampleObs(a.pos - vec2f(0.0, e));
    let away = nz(-vec2f(gxv, gyv));
    extAccel = extAccel + away * 400.0;
    a.vel = a.vel * 0.9;
  }

  // 流れ場
  let fl = sampleFlow(a.pos);
  let flowCoef = select(8.0, 12.0, sp == SP_PREY);
  a.vel = a.vel + fl.xy * fl.z * flowCoef * dt;

  // 微小ゆらぎ(seed も前進)
  let jitter = vec2f(nextRand(&seed) - 0.5, nextRand(&seed) - 0.5);
  steer = steer + jitter * 0.15;

  // 積分
  a.vel = a.vel + steer * accel * dt + extAccel * dt;
  let spd = length(a.vel);
  if (spd > maxSpeed) { a.vel = a.vel * (maxSpeed / spd); }
  a.pos = wrapPos(a.pos + a.vel * dt);
  a.age = a.age + dt;
  a.energy = a.energy - P.v2.z * speedMul * speedMul * (0.7 + 0.6 * a.genes.z) * dt;
  // エネルギー上限(繁殖閾値の2倍)— 無限蓄積による繁殖爆発を防ぐ
  a.energy = min(a.energy, P.v2.w * 2.0);
  a.seed = seed;
  return a;
}

// ---------------------------------------------------------------------
// パス3: behavior — A読み → B書き
// ---------------------------------------------------------------------
@compute @workgroup_size(256)
fn behavior(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= MAX_AGENTS) { return; }
  if (atomicLoad(&flags[i]) != 1u) { return; }
  let a = agentA[i];
  let dt = params.g0.x;
  var out: Agent;
  if (a.species == SP_ALGAE) {
    out = behaviorAlgae(a, dt);
  } else {
    out = behaviorFish(i, a, dt);
  }
  agentB[i] = out;
}

// ---------------------------------------------------------------------
// パス4: death — B読み。被食(2) / 餓死・寿命 を回収
// ---------------------------------------------------------------------
@compute @workgroup_size(256)
fn death(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= MAX_AGENTS) { return; }
  let f = atomicLoad(&flags[i]);
  if (f == 2u) {
    if (atomicCompareExchangeWeak(&flags[i], 2u, 0u).exchanged) {
      pushFree(i);
      atomicAdd(&counters[C_DEATHS], 1u);
    }
    return;
  }
  if (f == 1u) {
    let a = agentB[i];
    let maxAge = params.sp[a.species].v3.w;
    if (a.energy <= 0.0 || a.age > maxAge) {
      if (atomicCompareExchangeWeak(&flags[i], 1u, 0u).exchanged) {
        pushFree(i);
        atomicAdd(&counters[C_DEATHS], 1u);
      }
    }
  }
}

// ---------------------------------------------------------------------
// パス5: birth — B読み書き。閾値超過 & 確率 & 混雑上限 で子を生成
// ---------------------------------------------------------------------
@compute @workgroup_size(256)
fn birth(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= MAX_AGENTS) { return; }
  if (atomicLoad(&flags[i]) != 1u) { return; }
  var a = agentB[i];
  let sp = a.species;
  let P = params.sp[sp];
  let dt = params.g0.x;

  let reproTh = P.v2.w;
  if (a.energy <= reproTh) { return; }

  var seed = a.seed;
  let roll = nextRand(&seed);
  if (roll >= P.v3.y * dt) { a.seed = seed; agentB[i] = a; return; }

  // 自セルの同種数(環境収容力)。スキャンは24体まで
  let cell = cellOf(a.pos);
  let cnt = min(min(atomicLoad(&cellCount[cell]), CELL_CAP), 24u);
  var same = 0u;
  for (var k = 0u; k < cnt; k = k + 1u) {
    let j = cellAgents[cell * CELL_CAP + k];
    if (atomicLoad(&flags[j]) == 1u && agentA[j].species == sp) { same = same + 1u; }
  }
  if (same >= u32(P.v4.y)) { a.seed = seed; agentB[i] = a; return; }

  let c = popFree();
  if (c < 0) { a.seed = seed; agentB[i] = a; return; }
  let cu = u32(c);

  let reproCost = P.v3.x;
  var mutRate = P.v3.z;
  if (sp == SP_ALGAE) { mutRate = 0.02; }

  var child = a;
  let dp = (vec2f(nextRand(&seed), nextRand(&seed)) - vec2f(0.5)) * 6.0;
  child.pos = wrapPos(a.pos + dp);
  child.vel = a.vel * (0.9 + 0.2 * nextRand(&seed));
  child.energy = reproCost;
  child.age = 0.0;
  let mg = vec4f(nextRand(&seed), nextRand(&seed), nextRand(&seed), nextRand(&seed)) - vec4f(0.5);
  child.genes = clamp(a.genes + mg * 2.0 * mutRate, vec4f(0.0), vec4f(1.0));
  child.species = sp;
  child.seed = seed * 2654435761u + 1013904223u;

  agentB[cu] = child;
  atomicStore(&flags[cu], 1u);

  a.energy = a.energy - reproCost;
  a.seed = seed;
  agentB[i] = a;
  atomicAdd(&counters[C_BIRTHS], 1u);
}

// ---------------------------------------------------------------------
// パス6: census — 生存個体を数え、POP_* と GENE_SUM を集計
// ---------------------------------------------------------------------
@compute @workgroup_size(256)
fn census(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= MAX_AGENTS) { return; }
  if (atomicLoad(&flags[i]) != 1u) { return; }
  let a = agentB[i];
  let sp = a.species;
  atomicAdd(&counters[C_POP0 + sp], 1u);
  let base = C_GENE_BASE + sp * 4u;
  atomicAdd(&counters[base + 0u], u32(clamp(a.genes.x, 0.0, 1.0) * GENE_FP));
  atomicAdd(&counters[base + 1u], u32(clamp(a.genes.y, 0.0, 1.0) * GENE_FP));
  atomicAdd(&counters[base + 2u], u32(clamp(a.genes.z, 0.0, 1.0) * GENE_FP));
  atomicAdd(&counters[base + 3u], u32(clamp(a.genes.w, 0.0, 1.0) * GENE_FP));
}

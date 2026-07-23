(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))n(a);new MutationObserver(a=>{for(const u of a)if(u.type==="childList")for(const s of u.addedNodes)s.tagName==="LINK"&&s.rel==="modulepreload"&&n(s)}).observe(document,{childList:!0,subtree:!0});function r(a){const u={};return a.integrity&&(u.integrity=a.integrity),a.referrerPolicy&&(u.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?u.credentials="include":a.crossOrigin==="anonymous"?u.credentials="omit":u.credentials="same-origin",u}function n(a){if(a.ep)return;a.ep=!0;const u=r(a);fetch(a.href,u)}})();const de=1600,me=900,ie=32768,Bt=25,et=64,tt=36,Ve=et*tt,_t=64,De=256,Ae=0,rt=1,nt=16,Ge=16,We=8,yt=0,Rt=yt+Ge*nt,wt=Rt+Ge,Tt=wt+We*Ge,Be=Tt+We,ut=64,dt=16,se=256,fe=144,ve=256,Se=144,ot=16,Lt=32,Gt=16,re={FREE_TOP:0,POP_FOOD:1,POP_CREATURE:2,BIRTHS:3,DEATHS:4,EATS:5,KILLS:6,BUILDS:7,SUM_DIET:8,SUM_AGGR:9,SUM_SOCIAL:10,SUM_SPEED:11,SUM_EMIT:12,SUM_SIZE:13},qe=24,Et=1024;function At(){return{speed:1,paused:!1,civilization:!1,mutation:.12,signalDecay:1.4}}const _={OBSERVE:0,BLESS:1,SMITE:2,BECKON:3,REPEL:4,MAELSTROM:5,BARRIER:6,ERASE:7,CURRENT:8},Dt="rgba16float",It="r32float",Pt=48,Ft=32,it=Gt+ot*Lt,Ct=16,Mt=60,Pe=1024,Le=8,ke=512,at=288;function Nt(t){const e=(n,a=0)=>t.createBuffer({size:n,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|a}),r=()=>t.createTexture({size:[se,fe],format:Dt,usage:GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});return{creatureData:[e(ie*ut,GPUBufferUsage.COPY_SRC),e(ie*ut,GPUBufferUsage.COPY_SRC)],brainWeights:e(ie*Be*4),aliveFlags:e(ie*4),freeList:e(ie*4),counters:e(qe*4,GPUBufferUsage.COPY_SRC),cellCount:e(Ve*4),cellAgents:e(Ve*_t*4),signalField:[r(),r()],signalAccum:e(se*fe*4*4),structAccum:e(ve*Se*4),structureGrid:t.createTexture({size:[ve,Se],format:It,usage:GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST}),obstacleTex:t.createTexture({size:[ke,at],format:"r8unorm",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST}),flowTex:t.createTexture({size:[se,fe],format:"rgba8unorm",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST}),spawnRequests:e(it),config:t.createBuffer({size:Pt,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),interaction:t.createBuffer({size:Ft,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),countersStaging:t.createBuffer({size:qe*4,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST}),sampleStaging:t.createBuffer({size:Pe*Le*4,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST})}}function kt(t,e,r){const n=Math.min(r.creatures,ie),a=Math.min(r.food,ie-n),u=n+a,s=new Float32Array(u*dt),p=new Uint32Array(s.buffer),w=new Uint32Array(ie),M=new Uint32Array(ie),T=new Uint32Array(qe),P=new Float32Array(n*Be),W=Math.max(1,r.clusters|0),Q=[];for(let m=0;m<W;m++)Q.push([Math.random()*de,Math.random()*me]);const U=(m,x,C,q,Z)=>{const G=m*dt,o=Math.random()*Math.PI*2,E=x===Ae?3:24;s[G+0]=C,s[G+1]=q,s[G+2]=Math.cos(o)*E,s[G+3]=Math.sin(o)*E,s[G+4]=Z*(.7+Math.random()*.6),s[G+5]=Math.random()*4,s[G+6]=x===Ae?0:.25+Math.random()*.3,s[G+7]=.35+Math.random()*.4,s[G+8]=Math.random(),s[G+9]=Math.random(),s[G+10]=Math.random(),s[G+11]=Math.random(),s[G+12]=0,s[G+13]=Math.random(),p[G+14]=x>>>0,p[G+15]=Math.random()*4294967295>>>0,w[m]=1};let F=0;for(let m=0;m<n;m++,F++){const x=Q[m%W],C=Math.abs(ft())*70+5,q=Math.random()*Math.PI*2;U(F,rt,gt(x[0]+Math.cos(q)*C,de),gt(x[1]+Math.sin(q)*C,me),Mt);const Z=m*Be;for(let G=0;G<Be;G++)P[Z+G]=ft()*.6}for(let m=0;m<a;m++,F++)U(F,Ae,Math.random()*de,Math.random()*me,Ct);let j=0;for(let m=ie-1;m>=u;m--)M[j++]=m;T[re.FREE_TOP]=j,T[re.POP_FOOD]=a,T[re.POP_CREATURE]=n,t.queue.writeBuffer(e.creatureData[0],0,s),t.queue.writeBuffer(e.creatureData[1],0,s),t.queue.writeBuffer(e.brainWeights,0,P),t.queue.writeBuffer(e.aliveFlags,0,w),t.queue.writeBuffer(e.freeList,0,M),t.queue.writeBuffer(e.counters,0,T),t.queue.writeBuffer(e.spawnRequests,0,new Uint32Array(it/4)),t.queue.writeBuffer(e.signalAccum,0,new Uint32Array(se*fe*4)),t.queue.writeBuffer(e.structAccum,0,new Uint32Array(ve*Se));const v=new Uint16Array(se*fe*4);for(const m of e.signalField)t.queue.writeTexture({texture:m},v,{bytesPerRow:se*8},[se,fe]);t.queue.writeTexture({texture:e.structureGrid},new Float32Array(ve*Se),{bytesPerRow:ve*4},[ve,Se]),t.queue.writeTexture({texture:e.obstacleTex},new Uint8Array(ke*at),{bytesPerRow:ke},[ke,at]);const h=new Uint8Array(se*fe*4);for(let m=0;m<h.length;m+=4)h[m]=128,h[m+1]=128;t.queue.writeTexture({texture:e.flowTex},h,{bytesPerRow:se*4},[se,fe])}function Vt(t,e,r,n){const a=new ArrayBuffer(Pt),u=new Float32Array(a),s=new Uint32Array(a);return u[0]=e,u[1]=r,u[2]=t.speed,u[3]=t.mutation,u[4]=t.signalDecay,u[5]=t.civilization?1:0,u[6]=Ct,u[7]=Mt,s[8]=n>>>0,a}function ft(){let t=0;for(let e=0;e<4;e++)t+=Math.random();return(t-2)/1}function gt(t,e){return(t%e+e)%e}function Ot(t){return{clientToWorld(e,r){const n=t.getBoundingClientRect(),a=Math.min(n.width/de,n.height/me),u=(n.width-de*a)/2,s=(n.height-me*a)/2,p=(e-n.left-u)/a,w=(r-n.top-s)/a;return[Math.min(de,Math.max(0,p)),Math.min(me,Math.max(0,w))]},worldToClip(){const e=t.getBoundingClientRect(),r=Math.min(e.width/de,e.height/me),n=(e.width-de*r)/2,a=(e.height-me*r)/2;return{scale:[2*r/e.width,-2*r/e.height],offset:[2*n/e.width-1,1-2*a/e.height]}}}}const Wt=`// =====================================================================
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
`;function qt(){const t=re;return[`const WORLD = vec2f(${de.toFixed(1)}, ${me.toFixed(1)});`,`const MAXC = ${ie}u;`,`const CELL_SIZE = ${Bt.toFixed(1)};`,`const GRID_W = ${et};`,`const GRID_H = ${tt};`,`const GRID_W_U = ${et}u;`,`const GRID_H_U = ${tt}u;`,`const NUM_CELLS = ${Ve}u;`,`const CELL_CAP = ${_t}u;`,`const MAX_SPAWN_REQ = ${ot}u;`,`const SIG_W_I = ${se};`,`const SIG_H_I = ${fe};`,`const SIG_W_U = ${se}u;`,`const SIG_H_U = ${fe}u;`,`const SIGWF = ${se.toFixed(1)};`,`const SIGHF = ${fe.toFixed(1)};`,`const STR_W_U = ${ve}u;`,`const STR_H_U = ${Se}u;`,`const STRWF = ${ve.toFixed(1)};`,`const STRHF = ${Se.toFixed(1)};`,`const FP = ${Et.toFixed(1)};`,`const R_FOOD = ${Ae}u;`,`const R_CREATURE = ${rt}u;`,`const NIN = ${nt};`,`const NHID = ${Ge};`,`const NOUT = ${We};`,`const NIN_U = ${nt}u;`,`const NHID_U = ${Ge}u;`,`const NOUT_U = ${We}u;`,`const W1_OFF = ${yt}u;`,`const B1_OFF = ${Rt}u;`,`const W2_OFF = ${wt}u;`,`const B2_OFF = ${Tt}u;`,`const BRAIN_STRIDE = ${Be}u;`,`const C_FREE_TOP = ${t.FREE_TOP}u;`,`const C_POP_FOOD = ${t.POP_FOOD}u;`,`const C_POP_CREATURE = ${t.POP_CREATURE}u;`,`const C_BIRTHS = ${t.BIRTHS}u;`,`const C_DEATHS = ${t.DEATHS}u;`,`const C_EATS = ${t.EATS}u;`,`const C_KILLS = ${t.KILLS}u;`,`const C_BUILDS = ${t.BUILDS}u;`,`const C_SUM_DIET = ${t.SUM_DIET}u;`,`const C_SUM_AGGR = ${t.SUM_AGGR}u;`,`const C_SUM_SOCIAL = ${t.SUM_SOCIAL}u;`,`const C_SUM_SPEED = ${t.SUM_SPEED}u;`,`const C_SUM_EMIT = ${t.SUM_EMIT}u;`,`const C_SUM_SIZE = ${t.SUM_SIZE}u;`,`const SAMPLE_COUNT = ${Pe}u;`,`const SAMPLE_STRIDE = ${Le}u;`,`const T_SMITE = ${_.SMITE}u;`,`const T_BECKON = ${_.BECKON}u;`,`const T_REPEL = ${_.REPEL}u;`,`const T_MAELSTROM = ${_.MAELSTROM}u;`,"const PI = 3.14159265;",""].join(`
`)}const Ce=Math.ceil(ie/De),$t=Math.ceil(Ve/De),zt=Math.ceil(se*fe/De),Ht=Math.ceil(ve*Se/De),Yt=Math.ceil(Pe/De),Xt=10;function Kt(){return{populations:[0,0],birthsPerSec:0,deathsPerSec:0,eatsPerSec:0,killsPerSec:0,buildsPerSec:0,avgDiet:.3,avgAggression:0,avgSocial:0,avgSpeed:0,avgCulture:0,avgSize:.5,tribes:1,epoch:0,simTime:0}}function jt(t,e){const r=t.createShaderModule({code:qt()+Wt}),n=t.createBuffer({size:Pe*Le*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC}),a=(g,D)=>({binding:g,visibility:GPUShaderStage.COMPUTE,buffer:{type:D}}),u=t.createBindGroupLayout({entries:[a(0,"storage"),a(1,"storage"),a(2,"storage"),a(3,"storage"),a(4,"storage"),a(5,"storage"),a(6,"storage"),a(7,"storage"),a(8,"storage"),a(9,"storage"),a(10,"storage"),a(11,"uniform"),a(12,"uniform"),{binding:13,visibility:GPUShaderStage.COMPUTE,texture:{sampleType:"float"}},{binding:14,visibility:GPUShaderStage.COMPUTE,texture:{sampleType:"float"}},{binding:15,visibility:GPUShaderStage.COMPUTE,sampler:{type:"filtering"}},{binding:16,visibility:GPUShaderStage.COMPUTE,texture:{sampleType:"float"}},{binding:17,visibility:GPUShaderStage.COMPUTE,storageTexture:{access:"write-only",format:"rgba16float"}},{binding:18,visibility:GPUShaderStage.COMPUTE,storageTexture:{access:"read-write",format:"r32float"}},a(19,"storage")]}),s=t.createPipelineLayout({bindGroupLayouts:[u]}),p=g=>t.createComputePipeline({layout:s,compute:{module:r,entryPoint:g}}),w={spawn:p("spawn"),clearGrid:p("clearGrid"),buildGrid:p("buildGrid"),behavior:p("behavior"),signalBake:p("signalBake"),death:p("death"),birth:p("birth"),structBake:p("structBake"),census:p("census"),sampleGather:p("sampleGather")},M=t.createSampler({magFilter:"linear",minFilter:"linear",addressModeU:"repeat",addressModeV:"repeat"}),T=e.obstacleTex.createView(),P=e.flowTex.createView(),W=[e.signalField[0].createView(),e.signalField[1].createView()],Q=e.structureGrid.createView(),U=g=>t.createBindGroup({layout:u,entries:[{binding:0,resource:{buffer:e.creatureData[g]}},{binding:1,resource:{buffer:e.creatureData[1-g]}},{binding:2,resource:{buffer:e.brainWeights}},{binding:3,resource:{buffer:e.aliveFlags}},{binding:4,resource:{buffer:e.freeList}},{binding:5,resource:{buffer:e.counters}},{binding:6,resource:{buffer:e.cellCount}},{binding:7,resource:{buffer:e.cellAgents}},{binding:8,resource:{buffer:e.spawnRequests}},{binding:9,resource:{buffer:e.signalAccum}},{binding:10,resource:{buffer:e.structAccum}},{binding:11,resource:{buffer:e.config}},{binding:12,resource:{buffer:e.interaction}},{binding:13,resource:T},{binding:14,resource:P},{binding:15,resource:M},{binding:16,resource:W[g]},{binding:17,resource:W[1-g]},{binding:18,resource:Q},{binding:19,resource:{buffer:n}}]}),F=[U(0),U(1)];let j=At();const v=Kt();let h=0,m=0,x=0,C=0,q=1,Z=0,G=0,o=0,E=0,l=0,b=0,c=!1,d=!1,S=!1,y=!1,B=0;const V=(g,D,O,N)=>{const H=g.beginComputePass();H.setPipeline(D),H.setBindGroup(0,O),H.dispatchWorkgroups(N),H.end()},X=g=>{const D=g[re.POP_FOOD],O=g[re.POP_CREATURE],N=g[re.BIRTHS],H=g[re.DEATHS],Y=g[re.EATS],te=g[re.KILLS],$=g[re.BUILDS],ce=C;if(c){const ge=Math.max(.001,ce-b),ae=.4,le=N-Z>>>0,oe=H-G>>>0,pe=Y-o>>>0,xe=te-E>>>0,A=$-l>>>0;v.birthsPerSec+=(le/ge-v.birthsPerSec)*ae,v.deathsPerSec+=(oe/ge-v.deathsPerSec)*ae,v.eatsPerSec+=(pe/ge-v.eatsPerSec)*ae,v.killsPerSec+=(xe/ge-v.killsPerSec)*ae,v.buildsPerSec+=(A/ge-v.buildsPerSec)*ae}else c=!0,v.birthsPerSec=0,v.deathsPerSec=0,v.eatsPerSec=0,v.killsPerSec=0,v.buildsPerSec=0;Z=N,G=H,o=Y,E=te,l=$,b=ce,v.populations=[D,O];const ne=O>0?1/(Et*O):0;v.avgDiet=g[re.SUM_DIET]*ne,v.avgAggression=g[re.SUM_AGGR]*ne,v.avgSocial=g[re.SUM_SOCIAL]*ne,v.avgSpeed=g[re.SUM_SPEED]*ne,v.avgCulture=g[re.SUM_EMIT]*ne,v.avgSize=g[re.SUM_SIZE]*ne,v.epoch=Math.floor(N/Math.max(1,q)),v.simTime=ce},J=g=>{const D=new Set;for(let O=0;O<Pe;O++){const N=O*Le;if(g[N+7]<.5)continue;const Y=$=>{const ce=$<0?0:$>1?1:$;return Math.min(3,ce*4|0)},te=Y(g[N])|Y(g[N+1])<<2|Y(g[N+2])<<4|Y(g[N+3])<<6;D.add(te)}return Math.max(1,Math.min(32,D.size))};return{get currentCreatures(){return e.creatureData[h]},get currentSignal(){return e.signalField[h]},get structureGrid(){return e.structureGrid},get stats(){return v},reset(g){kt(t,e,g),h=0,m=0,x=0,C=0,q=Math.max(1,Math.min(g.creatures,ie)),Z=0,G=0,o=0,E=0,l=0,b=0,c=!1,d=!1,B++,v.populations=[Math.min(g.food,ie),q],v.birthsPerSec=0,v.deathsPerSec=0,v.eatsPerSec=0,v.killsPerSec=0,v.buildsPerSec=0,v.avgDiet=.3,v.avgAggression=0,v.avgSocial=0,v.avgSpeed=0,v.avgCulture=0,v.avgSize=.5,v.tribes=1,v.epoch=0,v.simTime=0},setConfig(g){j=g},tick(g,D){t.queue.writeBuffer(e.config,0,Vt(j,D,C,m));const O=F[h];V(g,w.spawn,O,1),V(g,w.clearGrid,O,$t),V(g,w.buildGrid,O,Ce),V(g,w.behavior,O,Ce),V(g,w.signalBake,O,zt),V(g,w.death,O,Ce),V(g,w.birth,O,Ce),j.civilization&&V(g,w.structBake,O,Ht),V(g,w.census,O,Ce),x++,x%Xt===0&&!S&&!y&&!d&&(V(g,w.sampleGather,O,Yt),g.copyBufferToBuffer(e.counters,0,e.countersStaging,0,qe*4),g.copyBufferToBuffer(n,0,e.sampleStaging,0,Pe*Le*4),d=!0),C+=D,m=m+1>>>0,h=1-h},afterSubmit(){if(!d)return;d=!1;const g=B;if(!S){S=!0;const D=e.countersStaging;D.mapAsync(GPUMapMode.READ).then(()=>{const O=new Uint32Array(D.getMappedRange().slice(0));D.unmap(),S=!1,g===B&&X(O)}).catch(()=>{S=!1})}if(!y){y=!0;const D=e.sampleStaging;D.mapAsync(GPUMapMode.READ).then(()=>{const O=new Float32Array(D.getMappedRange().slice(0));D.unmap(),y=!1,g===B&&(v.tribes=J(O))}).catch(()=>{y=!1})}},requestSpawns(g){const D=Math.min(g.length,ot),O=new ArrayBuffer(it),N=new Uint32Array(O),H=new Float32Array(O);N[0]=D;for(let Y=0;Y<D;Y++){const te=g[Y],$=4+Y*8;H[$+0]=te.x,H[$+1]=te.y,N[$+2]=te.role>>>0,N[$+3]=Math.min(64,Math.max(0,te.count|0)),H[$+4]=te.spread,H[$+5]=te.energy}t.queue.writeBuffer(e.spawnRequests,0,O)}}}const R={title:"神の観察",subtitle:"Deus Ex Vita — 生命を見つめる者",webgpuUnsupported:"お使いのブラウザは WebGPU に対応していません。",webgpuHint:"Chrome または Edge の最新版で、この世界をお開きください。",toolNames:{[_.OBSERVE]:"観察",[_.BLESS]:"恵み",[_.SMITE]:"天罰",[_.BECKON]:"誘い",[_.REPEL]:"忌避",[_.MAELSTROM]:"渦",[_.BARRIER]:"障壁",[_.ERASE]:"消去",[_.CURRENT]:"潮流"},toolHints:{[_.OBSERVE]:"何もせず、ただ静かにいのちの営みを見つめる。",[_.BLESS]:"なぞった水面に糧を降らせ、いのちを養う。",[_.SMITE]:"天罰の雷を落とし、その範囲のいのちを滅する。",[_.BECKON]:"神の誘いをかけ、いのちを御手へと引き寄せる。",[_.REPEL]:"畏れを与え、いのちを御手から遠ざける。",[_.MAELSTROM]:"渦を巻き起こし、群れを大きく攪拌する。",[_.BARRIER]:"障壁を描き、世界に越えられぬ壁を築く。",[_.ERASE]:"描いた障壁や潮流を、なかったことにする。",[_.CURRENT]:"なぞった向きへ、いのちを運ぶ潮流を描く。"},chronicleTitle:"年代記",lineageTitle:"系譜",traitNames:{aggression:"攻撃性",social:"社会性",speed:"速さ",culture:"文化",size:"体格"},dietPoles:["草食","肉食"],foodName:"糧",creatureName:"いのち",tribes:"部族",epoch:"世代",pause:"一時停止",resume:"再開",genesis:"創世",speed:"速度",civilization:"文明",civOn:"解禁",civOff:"封印",quality:"画質",qualityNames:["軽量","標準","荘厳"],soundOn:"オン",soundOff:"オフ",volume:"音量",radius:"御手の広さ",strength:"御力の強さ",fps:"FPS",chronicle:{genesis:["虚無に光が差し、{n}の魂が海へと放たれた。世界の始まりである。","神は再び世界を創り直した。混沌より{n}のいのちが目を開く。","創世。何もなかった水面に、最初の鼓動が生まれる。","闇の底へ息吹が満ち、{n}の生命がはじめて漂いはじめた。","はじまりの刻({t})。神は世界を見つめ、いのちに名もなき自由を与えた。"],bloom:["いのちは満ち、{n}を数えるまでに増え広がった。豊穣の時代。","海は生命で溢れかえる。繁栄が世界の隅々にまで届いた。","光の中で{n}の魂が踊る。かつてないほどの賑わいである。","糧に恵まれ、群れは爆発するように膨れ上がった。","刻は{t}。世界は生命の歌でいっぱいに満たされている。"],crash:["静寂が海を覆う。数えきれぬ魂が、今この刻({t})に還っていった。","繁栄は長くは続かなかった。大いなる死が世界を洗い流す。","飢えと争いのすえ、{n}のいのちが一斉に潰えた。","かつて満ちた海が、みるみるうちに痩せ細ってゆく。","災いが群れを呑み込んだ。残された者たちが暗い水を彷徨う。"],extinction:["灯火は消えかけている。残るいのちは、わずかに{n}。","絶滅の淵。この世界は、もう長くはないのかもしれない。","最後の群れが、光の届かぬ水の底をあてもなく漂っている。","神よ、いのちを見捨てるな——世界に残された魂は{n}のみ。","刻は{t}。命脈は細く、途絶える寸前で震えている。"],carnivore:["牙が育ちはじめた。狩る者と狩られる者の時代へと世界は傾く。","血の味を覚えた者たちが増えてゆく。肉食の台頭である。","穏やかだった海に、はじめて捕食者の影が差した。","進化は牙を選んだ。弱きいのちは、強きいのちの糧となる。","刻は{t}。狩りの本能が群れの奥深くで目を覚ました。"],herbivore:["牙は鈍り、群れは再び草を食む穏やかな者へと還ってゆく。","捕食の時代は過ぎ去り、静かな草食の日々が戻ってきた。","争いに疲れたいのちは、和解を選んだ。緑を食む季節。","血の記憶は薄れ、世界はふたたび静けさを取り戻す。","刻は{t}。牙を捨てた者たちが、穏やかに水草を揺らす。"],tribe:["新たな文化が芽生えた。世界は{n}の部族へと分かれてゆく。","同じ匂いを分かつ者たちが寄り集まり、部族となった。","言葉なき歌が、群れに独自の色を与える。今や{n}の文化が並び立つ。","縄張りが生まれた。フェロモンの道が、世界を{n}に区切る。","刻は{t}。似た心を持つ魂が引き合い、小さな社会を織りはじめた。"],civilization:["はじめての建造。いのちは、大地にその痕跡を刻みはじめた。","余剰の力が形を成す。文明の夜明けが、静かに訪れた。","群れは巣を築きはじめた。ただ生きるだけの時代は終わる。","知恵が石を積んでゆく。世界に、はじめて人工の秩序が生まれた。","刻は{t}。いのちは、朽ちぬものを遺そうと願いはじめた。"],divine:["神の手が世界に触れた。いのちの運命が、静かに捻じ曲げられる。","天より力が降り注ぎ、生命の流れが大きく変わった。","見えざる意志が海をかき乱す。これぞ神の御業。","世界は震えた。神が、その指を天よりそっと伸ばしたのだ。","刻は{t}。人ならぬ意志が、いのちの営みに介入した。"]}},pt={food:9e3,creatures:2500,clusters:6};function Qt(t,e,r){const n=Math.floor(t*6),a=t*6-n,u=r*(1-e),s=r*(1-a*e),p=r*(1-(1-a)*e);switch((n%6+6)%6){case 0:return[r,p,u];case 1:return[s,r,u];case 2:return[u,r,p];case 3:return[u,s,r];case 4:return[p,u,r];default:return[r,u,s]}}function ze(t){return t<=.04045?t/12.92:Math.pow((t+.055)/1.055,2.4)}function Zt(){const t=[.9,1,.72,.95],e=[1,.86,.95],r=1.28,n=[];for(let a=0;a<32;a++){const u=a*5%32/32,s=t[a%t.length],p=e[a%e.length],[w,M,T]=Qt(u,s,p);n.push([ze(w)*r,ze(M)*r,ze(T)*r])}return n}const $e=Zt(),Jt=`// 共通定義: 構造体・フルスクリーン頂点・ノイズ/トーンマップ・生命色。
// 各パスの WGSL はこの共通部と contracts 由来の const 群を先頭連結してからコンパイルする。
// バインディング宣言は各パス側に置く(ここには置かない)。

struct RenderU {
  clipScale : vec2f, // ワールド→クリップ 拡大
  clipOffset: vec2f, // ワールド→クリップ 平行移動
  resolution: vec2f, // 描画ピクセル解像度
  world     : vec2f, // WORLD_W, WORLD_H
  time      : f32,   // 演出用経過秒
  dt        : f32,
  trailFade : f32,   // 残像の減衰係数
  bloomStr  : f32,   // ブルーム強度(品質0で0)
  quality   : f32,   // 0/1/2
  _p0       : f32,
  _p1       : vec2f,
};

// creatureData(64バイト)。contracts2 の Creature レイアウトと一致。
struct Creature {
  pos      : vec2f, // 0
  vel      : vec2f, // 8
  energy   : f32,   // 16
  age      : f32,   // 20
  diet     : f32,   // 24  0=草食 .. 1=肉食
  size     : f32,   // 28
  meme     : vec4f, // 32  文化ベクトル
  signalMem: f32,   // 48
  lineage  : f32,   // 52  始祖色相
  role     : u32,   // 56
  seed     : u32,   // 60
};

// 神の御業 uniform(32バイト)。
struct Interaction {
  mouse   : vec2f, // ワールド座標
  radius  : f32,   // ワールド単位
  strength: f32,
  tool    : u32,
  isDown  : u32,
  pad     : vec2f,
};

struct VsFull {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f, // 左上原点 0..1
};

@vertex
fn vs_full(@builtin(vertex_index) vi: u32) -> VsFull {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  let xy = p[vi];
  var out: VsFull;
  out.pos = vec4f(xy, 0.0, 1.0);
  out.uv = vec2f((xy.x + 1.0) * 0.5, (1.0 - xy.y) * 0.5);
  return out;
}

// ---- ハッシュ / ノイズ ----
fn hash21(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, vec3f(p3.y, p3.z, p3.x) + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0));
  let d = hash21(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn fbm(p0: vec2f) -> f32 {
  var p = p0;
  var amp = 0.5;
  var s = 0.0;
  for (var i = 0; i < 5; i = i + 1) {
    s += amp * vnoise(p);
    p *= 2.02;
    amp *= 0.5;
  }
  return s;
}

// ---- 色 / トーンマップ ----
fn hsv2rgb(c: vec3f) -> vec3f {
  let K = vec4f(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  let p = abs(fract(vec3f(c.x) + K.xyz) * 6.0 - vec3f(K.w));
  return c.z * mix(vec3f(K.x), clamp(p - vec3f(K.x), vec3f(0.0), vec3f(1.0)), c.y);
}

fn aces(x: vec3f) -> vec3f {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

// クリップuv(左上0..1)→ワールド座標
fn uvToWorld(uv: vec2f, U: RenderU) -> vec2f {
  let clip = vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
  return (clip - U.clipOffset) / U.clipScale;
}

// 生命の体長(ワールド単位)。size 遺伝子で変調。
fn creatureLen(size: f32) -> f32 { return 3.0 + 7.0 * size; }

// 生命色: lineage(始祖色相)× diet(草食=寒色 / 肉食=暖色赤)× meme 微調整。
fn creatureColor(c: Creature) -> vec3f {
  let warm = smoothstep(0.30, 0.70, c.diet); // 0=草食 .. 1=肉食
  // 草食は緑〜シアン(0.46)、肉食は赤(0.01)へ。始祖色相で band 内を分散。
  let hue = fract(mix(0.46, 0.01, warm) + (c.lineage - 0.5) * 0.16 + (c.meme.x - 0.5) * 0.05);
  let sat = mix(0.62, 0.95, warm);
  var col = hsv2rgb(vec3f(hue, sat, 1.0));
  // meme のもう一軸で微妙な明暗(文化の個性)
  col *= (0.85 + 0.4 * c.meme.y);
  // エネルギーで発光量。低いと減光。
  let e = clamp(c.energy / 30.0, 0.22, 1.0);
  col *= (1.0 + 1.5 * e);
  return col;
}
`,en=`// 残像パス: 前フレームの trail を減衰コピー。上限クランプで白飛びを防ぐ。
@group(0) @binding(0) var<uniform> U: RenderU;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var prevTrail: texture_2d<f32>;

@fragment
fn fs_fade(in: VsFull) -> @location(0) vec4f {
  let c = textureSampleLevel(prevTrail, samp, in.uv, 0.0);
  return clamp(c * U.trailFade, vec4f(0.0), vec4f(6.0));
}
`,tn=`// 発光パス: 生存個体を加算ブレンドのソフト円で trail へ描く(インスタンス描画)。
// trail は減衰0.9で蓄積するため1スプライトの寄与はごく小さく抑える。
@group(0) @binding(0) var<uniform> U: RenderU;
@group(0) @binding(1) var<storage, read> creatures: array<Creature>;
@group(0) @binding(2) var<storage, read> flags: array<u32>;

struct GlowV {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f,
  @location(1) col: vec3f,
};

@vertex
fn vs_glow(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> GlowV {
  var out: GlowV;
  out.local = vec2f(0.0);
  out.col = vec3f(0.0);
  // 生存(flags==1)以外は退化(画面外へ)
  if (flags[ii] != 1u) {
    out.pos = vec4f(2.0, 2.0, 2.0, 1.0);
    return out;
  }
  let c = creatures[ii];
  var q = array<vec2f, 4>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(1.0, 1.0));
  let uv = q[vi];

  var col: vec3f;
  var r: f32;
  if (c.role == ROLE_FOOD) {
    // 食料: 小さな緑の胞子の淡い光
    col = vec3f(0.20, 0.85, 0.35);
    r = 4.5;
  } else {
    col = creatureColor(c) * 0.6;
    r = creatureLen(c.size) * 2.6;
  }
  let wp = c.pos + uv * r;
  out.pos = vec4f(wp * U.clipScale + U.clipOffset, 0.0, 1.0);
  out.local = uv;
  out.col = col;
  return out;
}

@fragment
fn fs_glow(in: GlowV) -> @location(0) vec4f {
  let d = length(in.local);
  let g = exp(-d * d * 3.0) * 0.030;
  return vec4f(in.col * g, g);
}
`,nn=`// 背景合成パス: 深宇宙/深海グラデ + 微fbm + 信号フェロモン場(文化の縄張り) +
//   建造物グリッド(civ) + 障壁 + 残像trail を sceneTex へ。主役は信号場の可視化。
@group(0) @binding(0) var<uniform> U: RenderU;
@group(0) @binding(1) var<uniform> palette: array<vec4f, 32>;
@group(0) @binding(2) var samp: sampler;     // clamp linear
@group(0) @binding(3) var wrapSamp: sampler; // repeat linear(トーラス)
@group(0) @binding(4) var trailTex: texture_2d<f32>;
@group(0) @binding(5) var signalTex: texture_2d<f32>;    // r:文化 g:食料匂 b:危険
@group(0) @binding(6) var structTex: texture_2d<f32>;    // r32float 建造密度
@group(0) @binding(7) var obstacleTex: texture_2d<f32>;
@group(0) @binding(8) var flowTex: texture_2d<f32>;

// 縄張り色: 低周波セルごとに安定した部族色を割り当て、境界を fbm で滲ませる。
fn territoryColor(world: vec2f) -> vec3f {
  let cell = floor(world / 190.0);
  let h = hash21(cell);
  let idx = u32(h * 32.0) % 32u;
  let jitter = hash21(cell + vec2f(7.3, 2.1));
  let idx2 = u32(jitter * 32.0) % 32u;
  // セル内での fbm 揺らぎで2色を混ぜ、道/縄張りの有機的な縁を作る
  let m = fbm(world / 90.0);
  return mix(palette[idx].rgb, palette[idx2].rgb, clamp(m, 0.0, 1.0));
}

@fragment
fn fs_bg(in: VsFull) -> @location(0) vec4f {
  let world = uvToWorld(in.uv, U);
  let wuv = world / U.world; // 0..1(トーラス外はラップ)

  // 潮流(背景歪みに使用)
  let flow = textureSampleLevel(flowTex, wrapSamp, wuv, 0.0);
  let fdir = (flow.xy - 0.5) * 2.0;
  let fmag = flow.z;

  // 深宇宙/深海グラデ(上=わずかに明るい)
  let depth = clamp(wuv.y, 0.0, 1.0);
  let topCol = vec3f(0.018, 0.028, 0.060);
  let botCol = vec3f(0.004, 0.008, 0.020);
  var col = mix(topCol, botCol, depth);

  // 微fbm の星雲/コースティクス
  let nt = U.time * 0.012;
  let np = wuv * vec2f(3.0, 2.0) + fdir * fmag * 0.15 + vec2f(nt, -nt * 0.6);
  let neb = pow(clamp(fbm(np * 2.0), 0.0, 1.0), 2.4);
  col += vec3f(0.020, 0.030, 0.055) * neb * (0.7 + 0.3 * sin(U.time * 0.2 + wuv.x * 6.0));

  // ---- 信号フェロモン場(発光する文化の海)----
  // fbm で標本座標をわずかに歪ませ、脈打つ発光に見せる
  let warp = (fbm(wuv * 5.0 + vec2f(U.time * 0.05, 0.0)) - 0.5) * 0.012;
  let sig = textureSampleLevel(signalTex, samp, wuv + vec2f(warp, warp), 0.0);
  let culture = clamp(sig.r, 0.0, 8.0);
  let foodSmell = clamp(sig.g, 0.0, 8.0);
  let danger = clamp(sig.b, 0.0, 8.0);

  // 文化: 部族色で縄張り・道を発光させる(主役)
  let terr = territoryColor(world);
  let cpulse = 0.85 + 0.15 * sin(U.time * 1.3 + culture * 1.5);
  col += terr * culture * 0.30 * cpulse;
  // 食料の匂い: 淡い緑の霞
  col += vec3f(0.05, 0.16, 0.07) * foodSmell * 0.10;
  // 危険痕跡: 赤い澱み
  col += vec3f(0.95, 0.10, 0.14) * danger * 0.22;

  // ---- 建造物(civ時)----
  let sc = vec2<i32>(
    clamp(i32(wuv.x * STRUCT_W), 0, i32(STRUCT_W) - 1),
    clamp(i32(wuv.y * STRUCT_H), 0, i32(STRUCT_H) - 1),
  );
  let st = clamp(textureLoad(structTex, sc, 0).r, 0.0, 2.0);
  if (st > 0.001) {
    // 明るいグリッド模様で建造を重畳
    let g = world / 14.0;
    let grid = max(
      smoothstep(0.92, 1.0, abs(sin(g.x * 3.14159))),
      smoothstep(0.92, 1.0, abs(sin(g.y * 3.14159))),
    );
    let structCol = vec3f(0.85, 0.78, 0.55);
    col += structCol * clamp(st, 0.0, 1.0) * (0.25 + 0.65 * grid);
  }

  // ---- 障壁(神が描いた障害物)----
  let rock = textureSampleLevel(obstacleTex, wrapSamp, wuv, 0.0).r;
  if (rock > 0.02) {
    let e = vec2f(1.0 / 512.0, 1.0 / 288.0);
    let gx = textureSampleLevel(obstacleTex, wrapSamp, wuv + vec2f(e.x, 0.0), 0.0).r
           - textureSampleLevel(obstacleTex, wrapSamp, wuv - vec2f(e.x, 0.0), 0.0).r;
    let gy = textureSampleLevel(obstacleTex, wrapSamp, wuv + vec2f(0.0, e.y), 0.0).r
           - textureSampleLevel(obstacleTex, wrapSamp, wuv - vec2f(0.0, e.y), 0.0).r;
    let rim = clamp(length(vec2f(gx, gy)) * 7.0, 0.0, 1.5);
    let rockCol = vec3f(0.030, 0.036, 0.050);
    let rimCol = vec3f(0.20, 0.30, 0.55) * rim;
    col = mix(col, rockCol + rimCol, clamp(rock * 1.5, 0.0, 1.0));
  }

  // 残像 trail 合成(生命の航跡)
  let tr = textureSampleLevel(trailTex, samp, in.uv, 0.0).rgb;
  col += tr * 0.60;

  return vec4f(col, 1.0);
}
`,an=`// 本体パス: 生命をインスタンス billboard で描画。加算合成でHDR発光。
//  - 捕食性(diet>0.6)は進行方向へ伸びた鋭いダート形、草食は丸。
//  - age<1s は白発光(誕生)、energy 低で減光(creatureColor 側)。
//  - 食料(role=0)は緑の胞子で明滅。
@group(0) @binding(0) var<uniform> U: RenderU;
@group(0) @binding(1) var<storage, read> creatures: array<Creature>;
@group(0) @binding(2) var<storage, read> flags: array<u32>;

struct CV {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f, // billboard 内ローカル座標 -1..1(x=進行方向)
  @location(1) col: vec3f,
  @location(2) warm: f32,    // 0=草食(丸) .. 1=肉食(鋭い)
  @location(3) glow: f32,    // 明滅係数
};

@vertex
fn vs_creatures(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> CV {
  var out: CV;
  out.local = vec2f(0.0);
  out.col = vec3f(0.0);
  out.warm = 0.0;
  out.glow = 1.0;
  if (flags[ii] != 1u) {
    out.pos = vec4f(2.0, 2.0, 2.0, 1.0);
    return out;
  }
  let c = creatures[ii];
  var q = array<vec2f, 4>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(1.0, 1.0));
  let uv = q[vi];

  if (c.role == ROLE_FOOD) {
    // 食料: 軸整列の小さな胞子。energy と個体位相で明滅。
    let len = 2.6;
    let wp = c.pos + uv * len;
    out.pos = vec4f(wp * U.clipScale + U.clipOffset, 0.0, 1.0);
    out.local = uv;
    out.col = vec3f(0.28, 1.05, 0.42);
    out.warm = -1.0; // 食料マーカ
    let ph = f32(c.seed & 1023u) * 0.0123;
    out.glow = clamp(c.energy / 26.0, 0.35, 1.0) * (0.7 + 0.3 * sin(U.time * 3.0 + ph));
    return out;
  }

  let warm = smoothstep(0.30, 0.70, c.diet);
  let len = creatureLen(c.size);
  let stretch = 1.0 + 0.6 * warm; // 捕食者ほど前後に伸びる
  // 進行方向へ整列
  var dir = c.vel;
  let sp = length(dir);
  if (sp < 0.001) { dir = vec2f(1.0, 0.0); } else { dir = dir / sp; }
  let perp = vec2f(-dir.y, dir.x);
  let lp = vec2f(uv.x * len * stretch, uv.y * len);
  let wp = c.pos + dir * lp.x + perp * lp.y;
  out.pos = vec4f(wp * U.clipScale + U.clipOffset, 0.0, 1.0);
  out.local = uv;
  var col = creatureColor(c);
  // 誕生(age<1s)は白発光
  let birth = clamp(1.0 - c.age, 0.0, 1.0);
  col = mix(col, vec3f(4.0), birth * 0.7);
  out.col = col;
  out.warm = warm;
  out.glow = 1.0;
  return out;
}

@fragment
fn fs_creatures(in: CV) -> @location(0) vec4f {
  if (in.warm < 0.0) {
    // 食料: 丸い胞子(中心発光)
    let d = length(in.local);
    let core = exp(-d * d * 4.0);
    let a = smoothstep(1.0, 0.05, d);
    let c = in.col * (core * 1.6 + 0.3) * in.glow;
    return vec4f(c * a, a);
  }
  // 丸(草食): 円SDF / 鋭い(肉食): 引き伸ばした菱形
  let dr = length(in.local);
  let aRound = smoothstep(1.0, 0.22, dr);
  let diamond = abs(in.local.x) * 0.72 + abs(in.local.y) * 1.55;
  let aSharp = smoothstep(1.0, 0.0, diamond);
  let a = mix(aRound, aSharp, in.warm);
  // 中心のホットコア
  let core = exp(-dr * dr * 3.5);
  let c = in.col * (0.55 + 0.9 * core) * a;
  return vec4f(c, a);
}
`,rn=`// ブルーム: 輝度抽出 → dual-filter ダウンサンプル → 加算アップサンプル。
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var src: texture_2d<f32>;

// 輝度抽出(ソフト閾値)
@fragment
fn fs_bright(in: VsFull) -> @location(0) vec4f {
  let c = textureSampleLevel(src, samp, in.uv, 0.0).rgb;
  let l = dot(c, vec3f(0.2126, 0.7152, 0.0722));
  let knee = smoothstep(0.70, 1.6, l);
  return vec4f(c * knee, 1.0);
}

// dual-filter ダウンサンプル(5タップ)
@fragment
fn fs_down(in: VsFull) -> @location(0) vec4f {
  let ts = 1.0 / vec2f(textureDimensions(src));
  let h = ts * 0.5;
  var s = textureSampleLevel(src, samp, in.uv, 0.0).rgb * 4.0;
  s += textureSampleLevel(src, samp, in.uv + h, 0.0).rgb;
  s += textureSampleLevel(src, samp, in.uv - h, 0.0).rgb;
  s += textureSampleLevel(src, samp, in.uv + vec2f(h.x, -h.y), 0.0).rgb;
  s += textureSampleLevel(src, samp, in.uv + vec2f(-h.x, h.y), 0.0).rgb;
  return vec4f(s / 8.0, 1.0);
}

// dual-filter アップサンプル(8タップ tent)
@fragment
fn fs_up(in: VsFull) -> @location(0) vec4f {
  let h = 1.0 / vec2f(textureDimensions(src));
  var s = textureSampleLevel(src, samp, in.uv + vec2f(-h.x * 2.0, 0.0), 0.0).rgb;
  s += textureSampleLevel(src, samp, in.uv + vec2f(-h.x, h.y), 0.0).rgb * 2.0;
  s += textureSampleLevel(src, samp, in.uv + vec2f(0.0, h.y * 2.0), 0.0).rgb;
  s += textureSampleLevel(src, samp, in.uv + vec2f(h.x, h.y), 0.0).rgb * 2.0;
  s += textureSampleLevel(src, samp, in.uv + vec2f(h.x * 2.0, 0.0), 0.0).rgb;
  s += textureSampleLevel(src, samp, in.uv + vec2f(h.x, -h.y), 0.0).rgb * 2.0;
  s += textureSampleLevel(src, samp, in.uv + vec2f(0.0, -h.y * 2.0), 0.0).rgb;
  s += textureSampleLevel(src, samp, in.uv + vec2f(-h.x, -h.y), 0.0).rgb * 2.0;
  return vec4f(s / 12.0, 1.0);
}
`,on=`// 最終合成: scene+bloom → ACESトーンマップ + ビネット + 微グレイン +
//   神の御業リング(カーソル) + 黒レターボックス。
@group(0) @binding(0) var<uniform> U: RenderU;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var sceneTex: texture_2d<f32>;
@group(0) @binding(3) var bloomTex: texture_2d<f32>;
@group(0) @binding(4) var<uniform> IA: Interaction;

// 神の御業ツール色(contracts2 の Divine 順)
fn toolColor(t: u32) -> vec3f {
  switch t {
    case 1u: { return vec3f(0.45, 1.15, 0.55); } // BLESS 恵み 緑
    case 2u: { return vec3f(1.40, 0.25, 0.35); } // SMITE 天罰 赤
    case 3u: { return vec3f(0.35, 1.00, 1.35); } // BECKON 誘い シアン
    case 4u: { return vec3f(1.35, 0.60, 0.30); } // REPEL 忌避 橙
    case 5u: { return vec3f(0.80, 0.45, 1.35); } // MAELSTROM 渦 紫
    case 6u: { return vec3f(0.62, 0.58, 0.48); } // BARRIER 障壁 岩色
    case 7u: { return vec3f(0.92, 0.94, 1.00); } // ERASE 消去 白
    case 8u: { return vec3f(0.30, 0.72, 1.25); } // CURRENT 潮流 青
    default: { return vec3f(0.70, 0.80, 1.00); } // OBSERVE
  }
}

@fragment
fn fs_final(in: VsFull) -> @location(0) vec4f {
  let world = uvToWorld(in.uv, U);

  // ワールド矩形外は黒レターボックス
  if (world.x < 0.0 || world.x > U.world.x || world.y < 0.0 || world.y > U.world.y) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }

  // レターボックス早期return後の非uniform制御フローのため textureSampleLevel
  var col = textureSampleLevel(sceneTex, samp, in.uv, 0.0).rgb;
  col += textureSampleLevel(bloomTex, samp, in.uv, 0.0).rgb * U.bloomStr;

  // 神の御業リング(ツール色)
  if (IA.radius > 0.5 && IA.tool != 0u) {
    let dm = distance(world, IA.mouse);
    let ring = 1.0 - smoothstep(0.0, 3.0, abs(dm - IA.radius));
    let inten = select(0.30, 0.95, IA.isDown == 1u);
    col += toolColor(IA.tool) * ring * inten;
    // 中心の淡い充填
    let fill = (1.0 - smoothstep(0.0, IA.radius, dm)) * 0.05;
    col += toolColor(IA.tool) * fill;
  }

  // ACESトーンマップ
  col = aces(col);

  // ビネット(神の視野の縁)
  let q = in.uv - vec2f(0.5);
  let vig = smoothstep(0.92, 0.30, length(q));
  col *= mix(0.50, 1.0, vig);

  // 微グレイン
  let g = (hash21(in.uv * U.resolution + vec2f(U.time)) - 0.5) * 0.026;
  col += vec3f(g);

  return vec4f(col, 1.0);
}
`,_e="rgba16float",Me=5,sn=.9,cn=`
const ROLE_FOOD : u32 = ${Ae}u;
const ROLE_CREATURE : u32 = ${rt}u;
const STRUCT_W : f32 = ${ve}.0;
const STRUCT_H : f32 = ${Se}.0;
`;function ln(t,e,r,n){const a=Ot(n),u=t.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),s=new Float32Array(16),p=t.createBuffer({size:512,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});{const A=new Float32Array(128),I=$e.length;for(let K=0;K<32;K++){const i=$e[I>0?K%I:0]??[.6,.6,.6];A[K*4+0]=i[0],A[K*4+1]=i[1],A[K*4+2]=i[2],A[K*4+3]=1}t.queue.writeBuffer(p,0,A)}const w=t.createSampler({magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"}),M=t.createSampler({magFilter:"linear",minFilter:"linear",addressModeU:"repeat",addressModeV:"repeat"}),T=A=>t.createShaderModule({code:cn+`
`+Jt+`
`+A}),P=T(en),W=T(tn),Q=T(nn),U=T(an),F=T(rn),j=T(on),v={color:{srcFactor:"one",dstFactor:"one",operation:"add"},alpha:{srcFactor:"one",dstFactor:"one",operation:"add"}},h=t.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:1,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:2,visibility:GPUShaderStage.FRAGMENT,sampler:{type:"filtering"}},{binding:3,visibility:GPUShaderStage.FRAGMENT,sampler:{type:"filtering"}},{binding:4,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:"float"}},{binding:5,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:"float"}},{binding:6,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:"unfilterable-float"}},{binding:7,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:"float"}},{binding:8,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:"float"}}]}),m=t.createPipelineLayout({bindGroupLayouts:[h]}),x=t.createRenderPipeline({layout:"auto",vertex:{module:P,entryPoint:"vs_full"},fragment:{module:P,entryPoint:"fs_fade",targets:[{format:_e}]},primitive:{topology:"triangle-list"}}),C=t.createRenderPipeline({layout:"auto",vertex:{module:W,entryPoint:"vs_glow"},fragment:{module:W,entryPoint:"fs_glow",targets:[{format:_e,blend:v}]},primitive:{topology:"triangle-strip"}}),q=t.createRenderPipeline({layout:m,vertex:{module:Q,entryPoint:"vs_full"},fragment:{module:Q,entryPoint:"fs_bg",targets:[{format:_e}]},primitive:{topology:"triangle-list"}}),Z=t.createRenderPipeline({layout:"auto",vertex:{module:U,entryPoint:"vs_creatures"},fragment:{module:U,entryPoint:"fs_creatures",targets:[{format:_e,blend:v}]},primitive:{topology:"triangle-strip"}}),G=t.createRenderPipeline({layout:"auto",vertex:{module:F,entryPoint:"vs_full"},fragment:{module:F,entryPoint:"fs_bright",targets:[{format:_e}]},primitive:{topology:"triangle-list"}}),o=t.createRenderPipeline({layout:"auto",vertex:{module:F,entryPoint:"vs_full"},fragment:{module:F,entryPoint:"fs_down",targets:[{format:_e}]},primitive:{topology:"triangle-list"}}),E=t.createRenderPipeline({layout:"auto",vertex:{module:F,entryPoint:"vs_full"},fragment:{module:F,entryPoint:"fs_up",targets:[{format:_e,blend:v}]},primitive:{topology:"triangle-list"}}),l=t.createRenderPipeline({layout:"auto",vertex:{module:j,entryPoint:"vs_full"},fragment:{module:j,entryPoint:"fs_final",targets:[{format:e}]},primitive:{topology:"triangle-list"}});let b=1;const c=A=>A===0?0:A===2?.95:.55,d=A=>A===0?.5:1;let S=1,y=1,B=1,V=1,X=null,J=null,ee=[],g=null,D=null,O=[],N=[],H=null,Y=0,te=0;const $=new Map,ce=A=>{let I=$.get(A);if(I)return I;const K=[{binding:0,resource:{buffer:u}},{binding:1,resource:{buffer:A}},{binding:2,resource:{buffer:r.aliveFlags}}];return I={glow:t.createBindGroup({layout:C.getBindGroupLayout(0),entries:K}),body:t.createBindGroup({layout:Z.getBindGroupLayout(0),entries:K})},$.set(A,I),I},ne=new Map,ge=(A,I,K)=>{let i=ne.get(A);if(!i){const k=z=>t.createBindGroup({layout:h,entries:[{binding:0,resource:{buffer:u}},{binding:1,resource:{buffer:p}},{binding:2,resource:w},{binding:3,resource:M},{binding:4,resource:X[z].view},{binding:5,resource:A.createView()},{binding:6,resource:I.createView()},{binding:7,resource:r.obstacleTex.createView()},{binding:8,resource:r.flowTex.createView()}]});i=[k(0),k(1)],ne.set(A,i)}return i[K]},ae=(A,I)=>{const K=t.createTexture({size:[A,I],format:_e,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING});return{tex:K,view:K.createView()}},le=()=>{X&&(X[0].tex.destroy(),X[1].tex.destroy()),J&&J.tex.destroy();for(const I of ee)I.tex.destroy();ne.clear();const A=d(b);B=Math.max(1,Math.round(S*A)),V=Math.max(1,Math.round(y*A)),X=[ae(B,V),ae(B,V)],J=ae(S,y),ee=[];for(let I=0;I<Me;I++){const K=Math.max(1,S>>I+1),i=Math.max(1,y>>I+1);ee.push(ae(K,i))}Y=0,g=[t.createBindGroup({layout:x.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:u}},{binding:1,resource:w},{binding:2,resource:X[0].view}]}),t.createBindGroup({layout:x.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:u}},{binding:1,resource:w},{binding:2,resource:X[1].view}]})],D=t.createBindGroup({layout:G.getBindGroupLayout(0),entries:[{binding:0,resource:w},{binding:1,resource:J.view}]}),O=[];for(let I=0;I<Me-1;I++)O.push(t.createBindGroup({layout:o.getBindGroupLayout(0),entries:[{binding:0,resource:w},{binding:1,resource:ee[I].view}]}));N=[];for(let I=0;I<Me;I++)N.push(t.createBindGroup({layout:E.getBindGroupLayout(0),entries:[{binding:0,resource:w},{binding:1,resource:ee[I].view}]}));H=t.createBindGroup({layout:l.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:u}},{binding:1,resource:w},{binding:2,resource:J.view},{binding:3,resource:ee[0].view},{binding:4,resource:{buffer:r.interaction}}]})},oe=(A,I,K)=>{S=Math.max(1,Math.round(A*K)),y=Math.max(1,Math.round(I*K)),le()},pe=A=>{A!==b&&(b=A,le())};return oe(n.width||1,n.height||1,1),{resize:oe,render:(A,I,K,i,k,z,he)=>{if(te=z,!X||!J||!g||!D||!H)return;const ue=a.worldToClip(),Ie=Math.pow(sn,Math.min(4,he*60)),st=c(b);s[0]=ue.scale[0],s[1]=ue.scale[1],s[2]=ue.offset[0],s[3]=ue.offset[1],s[4]=S,s[5]=y,s[6]=de,s[7]=me,s[8]=te,s[9]=he,s[10]=Ie,s[11]=st,s[12]=b,t.queue.writeBuffer(u,0,s);const ct=ce(K),lt=Y,Fe=1-lt;{const L=A.beginRenderPass({colorAttachments:[{view:X[Fe].view,loadOp:"clear",storeOp:"store",clearValue:{r:0,g:0,b:0,a:0}}]});L.setPipeline(x),L.setBindGroup(0,g[lt]),L.draw(3),L.end()}{const L=A.beginRenderPass({colorAttachments:[{view:X[Fe].view,loadOp:"load",storeOp:"store"}]});L.setPipeline(C),L.setBindGroup(0,ct.glow),L.draw(4,ie),L.end()}{const L=A.beginRenderPass({colorAttachments:[{view:J.view,loadOp:"clear",storeOp:"store",clearValue:{r:0,g:0,b:0,a:1}}]});L.setPipeline(q),L.setBindGroup(0,ge(i,k,Fe)),L.draw(3),L.end()}{const L=A.beginRenderPass({colorAttachments:[{view:J.view,loadOp:"load",storeOp:"store"}]});L.setPipeline(Z),L.setBindGroup(0,ct.body),L.draw(4,ie),L.end()}if(st>0){{const L=A.beginRenderPass({colorAttachments:[{view:ee[0].view,loadOp:"clear",storeOp:"store",clearValue:{r:0,g:0,b:0,a:1}}]});L.setPipeline(G),L.setBindGroup(0,D),L.draw(3),L.end()}for(let L=0;L<Me-1;L++){const be=A.beginRenderPass({colorAttachments:[{view:ee[L+1].view,loadOp:"clear",storeOp:"store",clearValue:{r:0,g:0,b:0,a:1}}]});be.setPipeline(o),be.setBindGroup(0,O[L]),be.draw(3),be.end()}for(let L=Me-1;L>=1;L--){const be=A.beginRenderPass({colorAttachments:[{view:ee[L-1].view,loadOp:"load",storeOp:"store"}]});be.setPipeline(E),be.setBindGroup(0,N[L]),be.draw(3),be.end()}}{const L=A.beginRenderPass({colorAttachments:[{view:I,loadOp:"clear",storeOp:"store",clearValue:{r:0,g:0,b:0,a:1}}]});L.setPipeline(l),L.setBindGroup(0,H),L.draw(3),L.end()}Y=Fe},setQuality:pe}}const un=10,dn=140,Oe=1/20,fn=.15,gn=25,pn=16,mn=8,Re=512,Ue=288,Te=se,Ne=fe,He=Re/de,Ye=Te/de;function mt(t,e,r){return t<e?e:t>r?r:t}function vt(t){return t===_.BARRIER||t===_.ERASE||t===_.CURRENT}class vn{constructor(e,r,n,a){this.device=e,this.buffers=r,this.canvas=n,this.view=a,this.obs=new OffscreenCanvas(Re,Ue),this.flow=new OffscreenCanvas(Te,Ne);const u=this.obs.getContext("2d",{willReadFrequently:!0}),s=this.flow.getContext("2d",{willReadFrequently:!0});if(!u||!s)throw new Error("2D コンテキストの取得に失敗しました");this.obsCtx=u,this.flowCtx=s,this.fillFlowNeutral(),n.addEventListener("pointerdown",this.onPointerDown),n.addEventListener("pointermove",this.onPointerMove),n.addEventListener("pointerup",this.onPointerUp),n.addEventListener("pointercancel",this.onPointerUp),n.addEventListener("pointerleave",this.onPointerLeave),n.addEventListener("wheel",this.onWheel,{passive:!1})}currentTool=_.OBSERVE;radiusVal=55;strengthVal=.6;pointerDown=!1;activePointerId=null;mouseX=de*.5;mouseY=me*.5;lastX=de*.5;lastY=me*.5;flowDirX=1;flowDirY=0;blessAccum=0;flushAccum=0;obs;obsCtx;flow;flowCtx;obstacleDirty=!1;flowDirty=!1;obsBytes=new Uint8Array(Re*Ue);uni=new Float32Array(8);uniU32=new Uint32Array(this.uni.buffer);spawnScratch=[];get tool(){return this.currentTool}get radius(){return this.radiusVal}get strength(){return this.strengthVal}setTool(e){e!==this.currentTool&&(this.pointerDown&&this.endDrag(),this.currentTool=e)}setRadius(e){this.radiusVal=mt(e,un,dn)}setStrength(e){this.strengthVal=mt(e,0,1)}update(e){const r=this.pointerDown&&this.currentTool!==_.OBSERVE?1:0;if(this.uni[0]=this.mouseX,this.uni[1]=this.mouseY,this.uni[2]=this.radiusVal,this.uni[3]=this.strengthVal,this.uniU32[4]=this.currentTool>>>0,this.uniU32[5]=r,this.uni[6]=0,this.uni[7]=0,this.device.queue.writeBuffer(this.buffers.interaction,0,this.uni),this.spawnScratch.length=0,this.currentTool===_.BLESS&&this.pointerDown){this.blessAccum+=e;let n=0;for(;this.blessAccum>=Oe&&n<mn;)this.blessAccum-=Oe,n++,this.spawnScratch.push({x:this.mouseX,y:this.mouseY,role:Ae,count:gn,spread:this.radiusVal,energy:pn});this.blessAccum>Oe&&(this.blessAccum=Oe)}return this.pointerDown&&vt(this.currentTool)&&(this.flushAccum+=e,this.flushAccum>=fn&&(this.flushAccum=0,this.flushDirty())),this.spawnScratch}clearPaint(){this.obsCtx.clearRect(0,0,Re,Ue),this.obstacleDirty=!1,this.uploadObstacle(),this.fillFlowNeutral(),this.flowDirty=!1,this.uploadFlow()}onPointerDown=e=>{const[r,n]=this.view.clientToWorld(e.clientX,e.clientY);if(this.mouseX=r,this.mouseY=n,this.lastX=r,this.lastY=n,this.currentTool!==_.OBSERVE){try{this.canvas.setPointerCapture(e.pointerId),this.activePointerId=e.pointerId}catch{this.activePointerId=null}this.pointerDown=!0,this.blessAccum=Oe,this.flushAccum=0,e.preventDefault(),(this.currentTool===_.BARRIER||this.currentTool===_.ERASE)&&(this.stampObstacle(r,n),this.obstacleDirty=!0)}};onPointerMove=e=>{const[r,n]=this.view.clientToWorld(e.clientX,e.clientY);this.mouseX=r,this.mouseY=n,this.pointerDown&&(vt(this.currentTool)&&this.paintSegment(this.lastX,this.lastY,r,n),this.lastX=r,this.lastY=n)};onPointerUp=e=>{if(!this.pointerDown&&this.activePointerId===null)return;const[r,n]=this.view.clientToWorld(e.clientX,e.clientY);this.mouseX=r,this.mouseY=n,this.endDrag()};onPointerLeave=()=>{this.pointerDown&&this.endDrag()};onWheel=e=>{e.preventDefault();const r=e.deltaY>0?-1:1;this.setRadius(this.radiusVal+r*6)};endDrag(){if(this.activePointerId!==null){try{this.canvas.releasePointerCapture(this.activePointerId)}catch{}this.activePointerId=null}this.pointerDown=!1,this.blessAccum=0,this.flushAccum=0,this.flushDirty()}paintSegment(e,r,n,a){const u=n-e,s=a-r,p=Math.hypot(u,s),w=Math.max(2,this.radiusVal*.25),M=Math.max(1,Math.ceil(p/w));if(this.currentTool===_.CURRENT){let T=u,P=s;const W=Math.hypot(T,P);W>1e-4?(T/=W,P/=W,this.flowDirX=T,this.flowDirY=P):(T=this.flowDirX,P=this.flowDirY);for(let Q=1;Q<=M;Q++){const U=Q/M;this.stampFlow(e+u*U,r+s*U,T,P)}this.flowDirty=!0}else{for(let T=1;T<=M;T++){const P=T/M;this.stampObstacle(e+u*P,r+s*P)}this.obstacleDirty=!0}}stampObstacle(e,r){const n=e*He,a=r*He,u=Math.max(1,this.radiusVal*He),s=this.obsCtx;s.save();const p=s.createRadialGradient(n,a,0,n,a,u);this.currentTool===_.ERASE?(s.globalCompositeOperation="destination-out",p.addColorStop(0,"rgba(0,0,0,1)"),p.addColorStop(.6,"rgba(0,0,0,0.85)"),p.addColorStop(1,"rgba(0,0,0,0)")):(s.globalCompositeOperation="source-over",p.addColorStop(0,"rgba(255,255,255,1)"),p.addColorStop(.6,"rgba(255,255,255,0.9)"),p.addColorStop(1,"rgba(255,255,255,0)")),s.fillStyle=p,s.beginPath(),s.arc(n,a,u,0,Math.PI*2),s.fill(),s.restore()}stampFlow(e,r,n,a){const u=e*Ye,s=r*Ye,p=Math.max(1,this.radiusVal*Ye),w=Math.round((n*.5+.5)*255),M=Math.round((a*.5+.5)*255),T=Math.round(this.strengthVal*255),P=this.flowCtx;P.save(),P.globalCompositeOperation="source-over",P.globalAlpha=.35;const W=P.createRadialGradient(u,s,0,u,s,p);W.addColorStop(0,`rgba(${w},${M},${T},1)`),W.addColorStop(1,`rgba(${w},${M},${T},0)`),P.fillStyle=W,P.beginPath(),P.arc(u,s,p,0,Math.PI*2),P.fill(),P.restore()}flushDirty(){this.obstacleDirty&&(this.uploadObstacle(),this.obstacleDirty=!1),this.flowDirty&&(this.uploadFlow(),this.flowDirty=!1)}uploadObstacle(){const r=this.obsCtx.getImageData(0,0,Re,Ue).data,n=this.obsBytes;for(let a=0;a<n.length;a++)n[a]=r[a*4+3];this.device.queue.writeTexture({texture:this.buffers.obstacleTex},n,{bytesPerRow:Re},[Re,Ue])}uploadFlow(){const e=this.flowCtx.getImageData(0,0,Te,Ne),r=new Uint8Array(e.data.buffer,e.data.byteOffset,e.data.byteLength);this.device.queue.writeTexture({texture:this.buffers.flowTex},r,{bytesPerRow:Te*4},[Te,Ne])}fillFlowNeutral(){const e=this.flowCtx;e.save(),e.globalCompositeOperation="source-over",e.globalAlpha=1,e.fillStyle="rgb(128,128,0)",e.fillRect(0,0,Te,Ne),e.restore()}}function hn(t,e,r,n){return new vn(t,e,r,n)}const ht=.8,bn=.85,Sn=3200,ye=43.65;function Xe(t,e,r){return t<e?e:t>r?r:t}function xn(){let t=null,e=null,r=!1,n=.7,a=0,u=0,s=0,p=0,w=0,M=!1,T=null;function P(o){const E=Math.floor(o.sampleRate*2),l=o.createBuffer(1,E,o.sampleRate),b=l.getChannelData(0);for(let c=0;c<E;c++)b[c]=Math.random()*2-1;return l}function W(o){const E=o.createGain();E.gain.value=1e-4;const l=o.createDynamicsCompressor();l.threshold.value=-6,l.knee.value=12,l.ratio.value=8,l.attack.value=.003,l.release.value=.25;const b=o.createGain();b.gain.value=0,b.connect(E),E.connect(l),l.connect(o.destination);const c=o.createGain();c.gain.value=.5;const d=o.createBiquadFilter();d.type="lowpass",d.frequency.value=280,d.Q.value=.7,c.connect(d),d.connect(b);const S=o.createOscillator();S.type="triangle",S.frequency.value=ye,S.detune.value=-4;const y=o.createGain();y.gain.value=.5,S.connect(y).connect(c);const B=o.createOscillator();B.type="sine",B.frequency.value=ye*1.5,B.detune.value=3;const V=o.createGain();V.gain.value=.26,B.connect(V).connect(c);const X=o.createOscillator();X.type="sine",X.frequency.value=ye*2,X.detune.value=-2;const J=o.createGain();J.gain.value=.18,X.connect(J).connect(c);const ee=o.createOscillator();ee.type="triangle",ee.frequency.value=ye*1.2,ee.detune.value=6;const g=o.createGain();g.gain.value=.15,ee.connect(g).connect(c);const D=o.createOscillator();D.type="sine",D.frequency.value=.05;const O=o.createGain();O.gain.value=5,D.connect(O),O.connect(S.detune),O.connect(B.detune),O.connect(X.detune),O.connect(ee.detune);const N=o.createBiquadFilter();N.type="lowpass",N.frequency.value=500,N.Q.value=.6;const H=o.createGain();H.gain.value=0,N.connect(H).connect(b);const Y=o.createOscillator();Y.type="sine",Y.frequency.value=ye*4,Y.detune.value=4;const te=o.createGain();te.gain.value=.5,Y.connect(te).connect(N);const $=o.createOscillator();$.type="sine",$.frequency.value=ye*6,$.detune.value=-5;const ce=o.createGain();ce.gain.value=.32,$.connect(ce).connect(N);const ne=o.createOscillator();ne.type="sine",ne.frequency.value=.07;const ge=o.createGain();ge.gain.value=.015,ne.connect(ge).connect(H.gain);const ae=o.createBufferSource();ae.buffer=P(o),ae.loop=!0;const le=o.createBiquadFilter();le.type="bandpass",le.frequency.value=520,le.Q.value=.9;const oe=o.createGain();oe.gain.value=.09,ae.connect(le).connect(oe).connect(b);const pe=o.createOscillator();pe.type="sine",pe.frequency.value=.045;const xe=o.createGain();xe.gain.value=240,pe.connect(xe).connect(le.frequency);const A=o.createGain();return A.gain.value=.045,pe.connect(A).connect(oe.gain),S.start(),B.start(),X.start(),ee.start(),D.start(),Y.start(),$.start(),ne.start(),pe.start(),ae.start(),{fadeBus:b,masterGain:E,thirdOsc:ee,thirdGain:g,droneLP:d,choirGain:H,choirLP:N,surfBP:le,surfGain:oe}}function Q(){if(!t||!e)return;const o=n<=0?1e-4:n*n;e.masterGain.gain.setTargetAtTime(o*bn,t.currentTime,.05)}function U(o){if(!t||!e)return;const E=t.currentTime,l=e.fadeBus.gain;l.cancelScheduledValues(E),l.setValueAtTime(l.value,E),l.linearRampToValueAtTime(o,E+ht)}function F(){T!==null&&(clearTimeout(T),T=null)}function j(){F(),T=setTimeout(()=>{T=null,!r&&t&&t.state==="running"&&t.suspend().catch(()=>{})},Math.ceil(ht*1e3)+80)}async function v(){if(!t){const o=window.AudioContext??window.webkitAudioContext;t=new o,e=W(t),Q()}if(r=!r,r){if(F(),t.state!=="running")try{await t.resume()}catch{}r&&U(1)}else U(0),j();return r}function h(o){n=Xe(o,0,1),Q()}function m(o,E,l,b){const c=Xe(l/Sn,0,1),d=Math.pow(c,.6);a+=(d-a)*Math.min(1,b*.6);const S=o.currentTime,y=a;E.droneLP.frequency.setTargetAtTime(220+y*1200,S,.3),E.thirdOsc.frequency.setTargetAtTime(ye*1.2+y*(ye*.05),S,.5),E.thirdGain.gain.setTargetAtTime(.13+y*.13,S,.4),E.choirLP.frequency.setTargetAtTime(500+y*2400,S,.5),E.choirGain.gain.setTargetAtTime(y*y*.11,S,.6),E.surfBP.frequency.setTargetAtTime(400+y*1500,S,.4),E.surfGain.gain.setTargetAtTime(.07+y*.05,S,.4)}function x(o,E){const l=o.currentTime,b=Math.min(1900,640+Math.random()*700+a*420),c=o.createOscillator();c.type="sine",c.frequency.setValueAtTime(b,l),c.frequency.exponentialRampToValueAtTime(Math.max(120,b*.6),l+.11);const d=o.createGain();d.gain.setValueAtTime(1e-4,l),d.gain.exponentialRampToValueAtTime(.08,l+.006),d.gain.exponentialRampToValueAtTime(5e-4,l+.16);const S=o.createStereoPanner();S.pan.value=(Math.random()*2-1)*.55,c.connect(d).connect(S).connect(E.fadeBus),c.start(l),c.stop(l+.18),c.onended=()=>{try{c.disconnect(),d.disconnect(),S.disconnect()}catch{}}}function C(o,E){const l=o.currentTime,b=o.createOscillator();b.type="sine",b.frequency.setValueAtTime(150,l),b.frequency.exponentialRampToValueAtTime(48,l+.18);const c=o.createGain();c.gain.setValueAtTime(1e-4,l),c.gain.exponentialRampToValueAtTime(.16,l+.008),c.gain.exponentialRampToValueAtTime(6e-4,l+.32);const d=o.createBufferSource();d.buffer=P(o);const S=o.createBiquadFilter();S.type="lowpass",S.frequency.value=380;const y=o.createGain();y.gain.setValueAtTime(.06,l),y.gain.exponentialRampToValueAtTime(4e-4,l+.09);const B=o.createStereoPanner();B.pan.value=(Math.random()*2-1)*.4,b.connect(c).connect(B).connect(E.fadeBus),d.connect(S).connect(y).connect(B),b.start(l),b.stop(l+.34),d.start(l),d.stop(l+.1),b.onended=()=>{try{b.disconnect(),c.disconnect(),d.disconnect(),S.disconnect(),y.disconnect(),B.disconnect()}catch{}}}function q(o,E){const l=o.currentTime,b=[523.25,587.33,659.25,783.99,880,987.77],c=b[Math.random()*b.length|0],d=o.createGain();d.gain.setValueAtTime(1e-4,l),d.gain.exponentialRampToValueAtTime(.085,l+.01),d.gain.exponentialRampToValueAtTime(5e-4,l+1.8);const S=o.createStereoPanner();S.pan.value=(Math.random()*2-1)*.4,d.connect(S).connect(E.fadeBus);const y=o.createOscillator();y.type="triangle",y.frequency.value=c,y.detune.value=-3,y.connect(d);const B=o.createOscillator();B.type="triangle",B.frequency.value=c*2.01;const V=o.createGain();V.gain.value=.4,B.connect(V).connect(d),y.start(l),B.start(l),y.stop(l+1.9),B.stop(l+1.9),B.onended=()=>{try{y.disconnect(),B.disconnect(),V.disconnect(),d.disconnect(),S.disconnect()}catch{}}}function Z(o,E){const l=o.currentTime,b=o.createOscillator();b.type="sawtooth",b.frequency.setValueAtTime(72,l),b.frequency.linearRampToValueAtTime(58,l+2.4);const c=o.createBiquadFilter();c.type="lowpass",c.frequency.setValueAtTime(110,l),c.frequency.linearRampToValueAtTime(220,l+.7),c.frequency.linearRampToValueAtTime(80,l+2.4),c.Q.value=6;const d=o.createGain();d.gain.setValueAtTime(1e-4,l),d.gain.linearRampToValueAtTime(.22,l+.35),d.gain.linearRampToValueAtTime(.18,l+1.6),d.gain.exponentialRampToValueAtTime(8e-4,l+2.5),b.connect(c).connect(d).connect(E.fadeBus),b.start(l),b.stop(l+2.55),b.onended=()=>{try{b.disconnect(),c.disconnect(),d.disconnect()}catch{}}}function G(o,E){if(!r||!t||!e)return;const l=t,b=e;if(l.state!=="running")return;const c=Xe(E,0,.1);m(l,b,o.populations[1],c),u=Math.max(0,u-c),s=Math.max(0,s-c),p=Math.max(0,p-c);let d=0;const S=9*(1-Math.exp(-Math.max(0,o.eatsPerSec)/30));d<3&&Math.random()<S*c&&(x(l,b),d++);const y=4*(1-Math.exp(-Math.max(0,o.killsPerSec)/14));d<3&&p<=0&&Math.random()<y*c&&(C(l,b),p=.12,d++),d<3&&u<=0&&o.birthsPerSec>.2&&Math.random()<Math.min(1,o.birthsPerSec*.06)&&(q(l,b),d++,u=3+Math.random()*2.5);const B=Math.max(0,o.deathsPerSec);M?w+=(B-w)*Math.min(1,c*.25):(w=B,M=!0),d<3&&s<=0&&B>12&&B>w*2.2+6&&(Z(l,b),s=12,w=B,d++)}return{get enabled(){return r},toggle:v,setVolume:h,update:G}}function f(t,e={},...r){const n=document.createElement(t);if(e.class&&(n.className=e.class),e.id&&(n.id=e.id),e.text!==void 0&&(n.textContent=e.text),e.html!==void 0&&(n.innerHTML=e.html),e.title!==void 0&&(n.title=e.title),e.type!==void 0&&n.setAttribute("type",e.type),e.min!==void 0&&n.setAttribute("min",String(e.min)),e.max!==void 0&&n.setAttribute("max",String(e.max)),e.step!==void 0&&n.setAttribute("step",String(e.step)),e.value!==void 0&&(n.value=String(e.value)),e.attrs)for(const a in e.attrs)n.setAttribute(a,e.attrs[a]);e.onclick&&n.addEventListener("click",e.onclick),e.oninput&&n.addEventListener("input",e.oninput),e.onchange&&n.addEventListener("change",e.onchange),e.onwheel&&n.addEventListener("wheel",e.onwheel,{passive:!1});for(const a of r)n.append(a);return n}function we(t,e,r){return t<e?e:t>r?r:t}function Ke(t){return t=we(t,0,1),t<=.0031308?t*12.92:1.055*Math.pow(t,1/2.4)-.055}function _n(t){const e=Math.round(Ke(t[0])*255),r=Math.round(Ke(t[1])*255),n=Math.round(Ke(t[2])*255);return`rgb(${e}, ${r}, ${n})`}function yn(t){const e=Math.max(0,Math.floor(t)),r=Math.floor(e/60),n=e%60;return`${r}:${String(n).padStart(2,"0")}`}const je=[_.OBSERVE,_.BLESS,_.SMITE,_.BECKON,_.REPEL,_.MAELSTROM,_.BARRIER,_.ERASE,_.CURRENT],Rn={[_.OBSERVE]:"◉",[_.BLESS]:"✿",[_.SMITE]:"↯",[_.BECKON]:"❈",[_.REPEL]:"❊",[_.MAELSTROM]:"❋",[_.BARRIER]:"⛰",[_.ERASE]:"✧",[_.CURRENT]:"≈"},wn={genesis:"✦",bloom:"❀",crash:"⚠",extinction:"☠",carnivore:"⚔",herbivore:"☘",tribe:"⬡",civilization:"⛩",divine:"✋"},bt=10,St=140,Qe=48,xt=8,Ze=.6,Je=.7,Tn=250,En=8;function An(t,e){let r=0,n=e.getConfig().paused;const a=f("span",{class:"ob-stat-v",text:"0"}),u=f("span",{class:"ob-stat-v",text:"0"}),s=f("span",{class:"ob-stat-v",text:"0"}),p=f("span",{class:"ob-stat-v ob-food",text:"0"}),w=f("span",{class:"ob-stat-v",text:"0"}),M=(i,k)=>f("div",{class:"ob-stat"},f("span",{class:"ob-stat-k",text:i}),k),T=f("div",{class:"ob-panel ob-hud"},f("div",{class:"ob-title",text:R.title}),f("div",{class:"ob-subtitle",text:R.subtitle}),f("div",{class:"ob-hud-grid"},M(R.fps,a),M(R.epoch,u),M(R.creatureName,s),M(R.foodName,p),M(R.tribes,w))),P=new Map;function W(i){for(const[k,z]of P)z.classList.toggle("active",k===i)}const Q=je.map(i=>{const k=f("button",{class:"ob-tool",title:`${R.toolNames[i]} — ${R.toolHints[i]}`,text:Rn[i]??"?",onclick:()=>e.setTool(i)});return P.set(i,k),k}),U=f("input",{class:"ob-range",type:"range",min:bt,max:St,step:1,value:Qe}),F=f("span",{class:"ob-range-v",text:String(Qe)});function j(i){i=we(Math.round(i),bt,St),U.value=String(i),F.textContent=String(i),e.setRadius(i)}U.addEventListener("input",()=>j(+U.value));const v=f("input",{class:"ob-range",type:"range",min:0,max:1,step:.01,value:Ze}),h=f("span",{class:"ob-range-v",text:`${Math.round(Ze*100)}%`});function m(i){i=we(i,0,1),v.value=String(i),h.textContent=`${Math.round(i*100)}%`,e.setStrength(i)}v.addEventListener("input",()=>m(+v.value));const x=(i,k,z)=>f("div",{class:"ob-range-block"},f("div",{class:"ob-range-head"},f("span",{class:"ob-range-l",text:i}),k),z),C=f("div",{class:"ob-panel ob-palette"},f("div",{class:"ob-tool-grid"},...Q),f("div",{class:"ob-sep"}),x(R.radius,F,U),x(R.strength,h,v)),q=[{label:`${R.dietPoles[0]} ⇄ ${R.dietPoles[1]}`,get:i=>i.avgDiet,bipolar:!0},{label:R.traitNames.aggression,get:i=>i.avgAggression},{label:R.traitNames.social,get:i=>i.avgSocial},{label:R.traitNames.speed,get:i=>i.avgSpeed},{label:R.traitNames.culture,get:i=>i.avgCulture},{label:R.traitNames.size,get:i=>i.avgSize}],Z=[],G=[],o=q.map(i=>{const k=f("div",{class:i.bipolar?"ob-trait-fill ob-trait-diet":"ob-trait-fill"}),z=f("span",{class:"ob-trait-v",text:"–"});return Z.push(k),G.push(z),f("div",{class:"ob-trait-row"},f("span",{class:"ob-trait-l",text:i.label}),f("div",{class:"ob-trait-bar"},k),z)}),E=f("span",{class:"ob-tribe-count",text:"0"}),l=f("div",{class:"ob-tribe-swatches"}),b=f("div",{class:"ob-lineage-body"},f("div",{class:"ob-mini-title",text:R.lineageTitle}),...o,f("div",{class:"ob-sep"}),f("div",{class:"ob-tribe-head"},f("span",{class:"ob-mini-title",text:R.tribes}),E),l),c=f("button",{class:"ob-collapse",title:R.lineageTitle,text:"‹"}),d=f("div",{class:"ob-panel ob-lineage collapsed"},f("div",{class:"ob-lineage-head"},c,f("span",{class:"ob-lineage-title",text:R.lineageTitle})),b);c.addEventListener("click",()=>{const i=d.classList.toggle("collapsed");c.textContent=i?"‹":"›"});const S=f("div",{class:"ob-chronicle-list"}),y=f("div",{class:"ob-panel ob-chronicle"},f("div",{class:"ob-mini-title",text:R.chronicleTitle}),S);function B(i){for(const k of i){const z=f("div",{class:`ob-ch-row ch-${k.kind}`},f("span",{class:"ob-ch-time",text:yn(k.time)}),f("span",{class:"ob-ch-icon",text:wn[k.kind]??"•"}),f("span",{class:"ob-ch-text",text:k.text}));for(S.prepend(z),requestAnimationFrame(()=>z.classList.add("show"));S.childElementCount>En;)S.lastElementChild?.remove()}}const V=f("input",{class:"ob-range",type:"range",min:.25,max:4,step:.05,value:e.getConfig().speed}),X=f("span",{class:"ob-range-v",text:`×${e.getConfig().speed.toFixed(2)}`});V.addEventListener("input",()=>{const i=we(+V.value,.25,4);X.textContent=`×${i.toFixed(2)}`,e.setSpeed(i)});const J=f("button",{class:"ob-btn ob-btn-wide",text:n?R.resume:R.pause,onclick:()=>g()});function ee(){J.textContent=n?R.resume:R.pause,J.classList.toggle("active",n)}function g(){n=e.togglePause(),ee()}const D=f("button",{class:"ob-btn ob-btn-wide ob-btn-genesis",text:R.genesis,onclick:()=>O()});function O(){e.genesis(),xe()}const N=f("button",{class:"ob-btn ob-btn-wide",text:`${R.civilization}: ${e.getConfig().civilization?R.civOn:R.civOff}`,onclick:()=>{const i=e.toggleCivilization();N.textContent=`${R.civilization}: ${i?R.civOn:R.civOff}`,N.classList.toggle("active",i)}});N.classList.toggle("active",e.getConfig().civilization);const H=[];function Y(i){H.forEach((k,z)=>k.classList.toggle("active",z===i))}const te=f("div",{class:"ob-seg"},...[0,1,2].map(i=>{const k=f("button",{class:"ob-seg-btn",text:R.qualityNames[i],onclick:()=>{e.setQuality(i),Y(i)}});return H.push(k),k})),$=f("button",{class:"ob-btn ob-btn-wide",text:R.soundOff,onclick:()=>{e.toggleSound().then(i=>{$.textContent=i?R.soundOn:R.soundOff,$.classList.toggle("active",i)})}}),ce=f("input",{class:"ob-range",type:"range",min:0,max:1,step:.01,value:Je}),ne=f("span",{class:"ob-range-v",text:`${Math.round(Je*100)}%`});ce.addEventListener("input",()=>{const i=we(+ce.value,0,1);ne.textContent=`${Math.round(i*100)}%`,e.setVolume(i)});const ge=f("div",{class:"ob-settings-body"},x(R.speed,X,V),f("div",{class:"ob-btn-row"},J),f("div",{class:"ob-btn-row"},D),f("div",{class:"ob-btn-row"},N),f("div",{class:"ob-setting-line"},f("span",{class:"ob-range-l",text:R.quality}),te),f("div",{class:"ob-btn-row"},$),x(R.volume,ne,ce)),ae=f("button",{class:"ob-collapse",title:"設定",text:"⚙"}),le=f("div",{class:"ob-panel ob-settings"},f("div",{class:"ob-settings-head"},ae,f("span",{class:"ob-settings-title",text:R.speed})),ge);ae.addEventListener("click",()=>{le.classList.toggle("collapsed")});const oe=f("div",{class:"ob-title-overlay"},f("div",{class:"ob-title-big",text:R.title}),f("div",{class:"ob-title-sub",text:R.subtitle}));let pe=0;function xe(){oe.classList.remove("fade"),oe.offsetWidth,oe.classList.add("show"),window.clearTimeout(pe),pe=window.setTimeout(()=>{oe.classList.remove("show"),oe.classList.add("fade")},3e3)}function A(i){const k=i.target?.tagName;if(k==="INPUT"||k==="BUTTON"||k==="TEXTAREA"||i.metaKey||i.ctrlKey||i.altKey)return;if(i.code==="Space"){i.preventDefault(),g();return}const z=i.key;if(z==="g"||z==="G"){O();return}if(z==="["){j(+U.value-xt);return}if(z==="]"){j(+U.value+xt);return}if(z>="1"&&z<="9"){const he=z.charCodeAt(0)-49;he<je.length&&e.setTool(je[he])}}window.addEventListener("keydown",A),t.append(T,C,d,y,le,oe),W(_.OBSERVE),j(Qe),m(Ze),e.setVolume(Je),Y(e.getQuality()),xe();function I(i,k){const z=performance.now();if(z-r<Tn)return;r=z,a.textContent=String(Math.round(k)),u.textContent=String(Math.max(0,i.epoch|0)),s.textContent=Math.max(0,i.populations[1]|0).toLocaleString(),p.textContent=Math.max(0,i.populations[0]|0).toLocaleString(),w.textContent=String(Math.max(0,i.tribes|0));for(let ue=0;ue<q.length;ue++){const Ie=we(q[ue].get(i),0,1);Z[ue].style.width=`${(Ie*100).toFixed(0)}%`,G[ue].textContent=Ie.toFixed(2)}const he=we(i.tribes|0,0,$e.length);if(E.textContent=String(he),l.childElementCount!==he){l.replaceChildren();for(let ue=0;ue<he;ue++)l.append(f("span",{class:"ob-swatch",attrs:{style:`background:${_n($e[ue])}`}}))}}function K(i){W(i)}return{update:I,pushEvents:B,syncTool:K}}const Pn=2.4,Cn={genesis:4,bloom:14,crash:14,extinction:30,carnivore:24,herbivore:24,tribe:18,civilization:999,divine:3};function Mn(t){return t>.55?"carn":t<.35?"herb":"mid"}function On(){let t=!1,e=!1,r=1,n=0,a=0,u="mid",s=1,p=1,w=0,M=!1,T=!1;const P={genesis:-1e9,bloom:-1e9,crash:-1e9,extinction:-1e9,carnivore:-1e9,herbivore:-1e9,tribe:-1e9,civilization:-1e9,divine:-1e9},W=h=>Math.random()*h|0;function Q(h,m,x){const C=R.chronicle[h];return(C&&C.length>0?C[W(C.length)]:"").replace(/\{n\}/g,String(m)).replace(/\{t\}/g,String(x))}function U(h,m){return m-P[h]>=Cn[h]}function F(h,m,x,C,q){P[m]=x,h.push({kind:m,text:Q(m,C,q),time:x})}function j(h){const m=[],x=h.simTime,C=h.populations[1]|0;if(!t){t=!0,r=Math.max(1,C),n=C,a=x,u=Mn(h.avgDiet),s=Math.max(1,h.tribes|0),p=s,w=x,M=h.buildsPerSec>0,T=!1;for(const Z in P)P[Z]=-1e9;return e&&(e=!1,F(m,"genesis",x,r,Math.max(1,h.epoch|0))),m}h.avgDiet>.55&&u!=="carn"&&U("carnivore",x)?(u="carn",F(m,"carnivore",x,Math.round(h.avgDiet*100),C)):h.avgDiet<.35&&u!=="herb"&&U("herbivore",x)?(u="herb",F(m,"herbivore",x,Math.round((1-h.avgDiet)*100),C)):h.avgDiet>=.35&&h.avgDiet<=.55&&(u="mid");const q=h.tribes|0;if(q>=p?q>p&&(p=q,w=x):(p=q,w=x),p>s&&p>=2&&x-w>=3&&U("tribe",x)&&(s=p,F(m,"tribe",x,p,Math.max(1,h.epoch|0))),!M&&h.buildsPerSec>0&&U("civilization",x)&&(M=!0,F(m,"civilization",x,C,Math.max(1,h.epoch|0))),C<r*.05&&C>0?!T&&U("extinction",x)&&(T=!0,F(m,"extinction",x,C,Math.max(1,h.epoch|0))):C>r*.2&&(T=!1),x-a>=Pn){const Z=Math.max(1,n),G=C/Z;if(G>1.5&&C>60&&U("bloom",x))F(m,"bloom",x,C,Math.max(1,h.epoch|0));else if(G<.6&&n>80&&U("crash",x)){const o=Math.max(0,n-C);F(m,"crash",x,o,C)}n=C,a=x}return m}function v(){t=!1,e=!0}return{observe:j,reset:v}}const Ut=()=>document.getElementById("boot"),Un=()=>document.getElementById("boot-msg");function Ee(t){Un().textContent=t,Ut().classList.remove("hidden")}async function Bn(){if(!navigator.gpu){Ee(R.webgpuUnsupported+`
`+R.webgpuHint);return}const t=await navigator.gpu.requestAdapter({powerPreference:"high-performance"});if(!t){Ee("GPUアダプタを取得できませんでした。");return}const e=t.limits;if(e.maxStorageBuffersPerShaderStage<12){Ee(`このGPUは必要なストレージバッファ数に対応していません。
Chrome / Edge の最新版でお試しください。`);return}const n=await t.requestDevice({requiredLimits:{maxStorageBuffersPerShaderStage:Math.min(16,e.maxStorageBuffersPerShaderStage)}});n.lost.then(c=>{c.reason!=="destroyed"&&Ee("GPUデバイスが失われました。再読み込みしてください。")});const a=document.getElementById("gl");a.style.cursor="crosshair";const u=a.getContext("webgpu");if(!u){Ee("WebGPU コンテキストを取得できませんでした。");return}const s=navigator.gpu.getPreferredCanvasFormat();u.configure({device:n,format:s,alphaMode:"opaque"});const p=Nt(n),w=Ot(a),M=jt(n,p),T=ln(n,s,p,a),P=hn(n,p,a,w),W=xn(),Q=On(),U=At();let F=1;M.reset(pt),Q.reset();let j;const v={getConfig:()=>U,setSpeed:c=>U.speed=Math.min(4,Math.max(.25,c)),togglePause:()=>U.paused=!U.paused,toggleCivilization:()=>U.civilization=!U.civilization,genesis(){M.reset(pt),P.clearPaint(),Q.reset()},setTool:c=>{P.setTool(c),j?.syncTool(c)},setRadius:c=>P.setRadius(c),setStrength:c=>P.setStrength(c),setQuality:c=>{F=c,T.setQuality(c)},getQuality:()=>F,toggleSound:()=>W.toggle(),setVolume:c=>W.setVolume(c)};j=An(document.getElementById("ui-root"),v),P.setTool(_.OBSERVE),T.setQuality(F),globalThis.__dev={device:n,buffers:p,sim:M,getConfig:()=>U};let h=Math.min(devicePixelRatio||1,1),m=16;const x=()=>{const c=Math.max(1,a.clientWidth),d=Math.max(1,a.clientHeight),S=Math.max(1,Math.round(c*h)),y=Math.max(1,Math.round(d*h));(a.width!==S||a.height!==y)&&(a.width=S,a.height=y,T.resize(c,d,h))};x(),addEventListener("resize",x);let C=0;const q=c=>{if(m=m*.8+c*1e3*.2,C-=c,C>0)return;const d=.6,S=Math.min(devicePixelRatio||1,1.5);m>32&&h>d?(h=Math.max(d,h-.25),x(),C=3):m<13&&h<S&&(h=Math.min(S,h+.25),x(),C=5)},Z=1/60;let G=performance.now(),o=0,E=60,l=!1;const b=c=>{try{const d=Math.min(.1,(c-G)/1e3);G=c,o+=d,E=E*.85+1/Math.max(d,1e-4)*.15;const S=P.update(d);S.length>0&&M.requestSpawns(S),M.setConfig(U);const y=n.createCommandEncoder();if(!U.paused){const V=U.speed>2?2:1,X=Z*U.speed/V;for(let J=0;J<V;J++)M.tick(y,X)}T.render(y,u.getCurrentTexture().createView(),M.currentCreatures,M.currentSignal,M.structureGrid,o,d),n.queue.submit([y.finish()]),M.afterSubmit();const B=Q.observe(M.stats);B.length>0&&j.pushEvents(B),j.update(M.stats,E),W.update(M.stats,d),q(d),!l&&o>.5&&(l=!0,Ut().classList.add("hidden"))}catch(d){console.error("frame error:",d)}requestAnimationFrame(b)};requestAnimationFrame(b)}Bn().catch(t=>{console.error(t),Ee(`起動に失敗しました。
${t instanceof Error?t.message:String(t)}`)});

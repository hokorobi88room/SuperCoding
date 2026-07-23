// 本体パス: 生命をインスタンス billboard で描画。加算合成でHDR発光。
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

// 本体パス: 魚(細長ストリップ)・藻(胞子)をインスタンス描画。加算合成でHDR発光。
@group(0) @binding(0) var<uniform> U: RenderU;
@group(0) @binding(1) var<storage, read> agents: array<Agent>;
@group(0) @binding(2) var<storage, read> flags: array<u32>;
@group(0) @binding(3) var<uniform> spColor: array<vec4f, 3>;

const K: u32 = 8u; // 魚の背骨点数(ストリップ 2*K=16頂点)

struct AV {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f, // 藻:uv / 魚:(t, side)
  @location(1) col: vec3f,
  @location(2) kind: f32,     // 0=藻 1=魚
  @location(3) glow: f32,
};

fn agentColor(a: Agent) -> vec3f {
  let base = spColor[a.species].rgb;
  let speedG = a.genes.x;
  var col: vec3f;
  if (a.species == 1u) {
    // 小魚: speed遺伝子で hue シアン→紫、size遺伝子で明度
    let hue = mix(0.50, 0.78, speedG);
    let val = 0.6 + 0.6 * a.genes.z;
    col = hsv2rgb(vec3f(hue, 0.72, 1.0)) * (1.3 + 1.3 * val);
    col = mix(col, base, 0.30);
  } else if (a.species == 2u) {
    // 捕食魚: 深紅→速度で橙
    let hue = mix(0.99, 0.055, speedG);
    col = hsv2rgb(vec3f(hue, 0.85, 1.0)) * 2.4;
    col = mix(col, base, 0.30);
  } else {
    col = base;
  }
  // 低エネルギーで減光
  let elow = clamp(a.energy / 22.0, 0.25, 1.0);
  col *= elow;
  // 誕生(age<1s)は白発光
  let birth = clamp(1.0 - a.age, 0.0, 1.0);
  col = mix(col, vec3f(4.0), birth * 0.7);
  return col;
}

@vertex
fn vs_agents(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> AV {
  var out: AV;
  out.local = vec2f(0.0);
  out.col = vec3f(0.0);
  out.kind = 0.0;
  out.glow = 0.0;
  if (flags[ii] != 1u) {
    out.pos = vec4f(2.0, 2.0, 2.0, 1.0);
    return out;
  }
  let a = agents[ii];
  let col = agentColor(a);
  let len = bodyLenOf(a);

  if (a.species == 0u) {
    // 藻: ビルボード quad(頂点0..3のみ、他は退化)
    if (vi > 3u) {
      out.pos = vec4f(2.0, 2.0, 2.0, 1.0);
      return out;
    }
    var q = array<vec2f, 4>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(1.0, 1.0));
    let uv = q[vi];
    let wp = a.pos + uv * len;
    out.pos = vec4f(wp * U.clipScale + U.clipOffset, 0.0, 1.0);
    out.local = uv;
    out.col = col;
    out.kind = 0.0;
    // energyで明滅
    let ph = f32(a.seed & 1023u) * 0.0123;
    out.glow = clamp(a.energy / 30.0, 0.35, 1.0) * (0.75 + 0.25 * sin(U.time * 3.0 + ph));
    return out;
  }

  // 魚: 背骨に沿ったストリップ
  let seg = vi / 2u;
  let side = select(-1.0, 1.0, (vi & 1u) == 1u);
  let t = f32(seg) / f32(K - 1u); // 0=頭 .. 1=尾
  // 幅プロファイル(頭手前で最大、尾で細く)
  let width = len * 0.34 * sin(3.14159 * clamp(t * 1.05, 0.0, 1.0)) * (1.0 - 0.45 * t);
  // 尾の揺れ(seed由来位相、尾ほど大きい)
  let ph = f32(a.seed & 255u) * 0.0245;
  let wig = sin(U.time * 8.0 + ph - t * 4.0) * len * 0.20 * t * t;
  // ローカル: 前方x(頭+ 尾-)
  let fx = mix(len * 0.55, -len * 0.5, t);
  let localPos = vec2f(fx, side * width + wig);
  // vel方向へ整列
  var dir = a.vel;
  let sp = length(dir);
  if (sp < 0.001) { dir = vec2f(1.0, 0.0); } else { dir = dir / sp; }
  let perp = vec2f(-dir.y, dir.x);
  let wp = a.pos + dir * localPos.x + perp * localPos.y;
  out.pos = vec4f(wp * U.clipScale + U.clipOffset, 0.0, 1.0);
  out.local = vec2f(t, side);
  out.col = col;
  out.kind = 1.0;
  out.glow = 1.0;
  return out;
}

@fragment
fn fs_agents(in: AV) -> @location(0) vec4f {
  if (in.kind < 0.5) {
    // 藻: 丸い胞子
    let d = length(in.local);
    let core = exp(-d * d * 4.0);
    let alpha = smoothstep(1.0, 0.05, d);
    let c = in.col * (core * 1.6 + 0.35) * in.glow;
    return vec4f(c * alpha, alpha);
  }
  // 魚: 側方エッジ減衰 + 頭部ハイライト
  let edge = clamp(1.0 - in.local.y * in.local.y, 0.0, 1.0);
  let head = smoothstep(1.0, 0.0, in.local.x);
  let a = edge;
  let c = in.col * (0.7 + 0.7 * head) * a;
  return vec4f(c, a);
}

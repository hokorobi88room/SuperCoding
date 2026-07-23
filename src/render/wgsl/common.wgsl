// 共通定義: 構造体・フルスクリーン頂点・ノイズ/トーンマップ等の純関数。
// 各パスのWGSLはこのファイルと連結してからコンパイルされる(バインディングはパス側で宣言)。

struct RenderU {
  clipScale : vec2f, // ワールド→クリップ 拡大
  clipOffset: vec2f, // ワールド→クリップ 平行移動
  resolution: vec2f, // 描画ピクセル解像度
  world     : vec2f, // WORLD_W, WORLD_H
  time      : f32,   // 演出用経過秒
  dt        : f32,
  trailFade : f32,   // 残像の減衰係数
  bloomStr  : f32,   // ブルーム強度
};

struct Agent {
  pos    : vec2f,
  vel    : vec2f,
  genes  : vec4f, // x:speed y:vision z:size w:wariness
  energy : f32,
  age    : f32,
  species: u32,
  seed   : u32,
};

struct Interaction {
  mouse   : vec2f, // ワールド座標
  radius  : f32,   // ワールド単位
  strength: f32,
  tool    : u32,
  isDown  : u32,
  pad     : vec2f,
};

// フルスクリーン三角形の出力
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

// 体長(ワールド単位)。サイズ遺伝子で変調。
fn bodyLenOf(a: Agent) -> f32 {
  let sizeMul = 0.6 + 0.8 * a.genes.z;
  if (a.species == 0u) { return 3.5 * sizeMul; }
  if (a.species == 1u) { return 7.0 * sizeMul; }
  return 15.0 * sizeMul;
}

// クリップuv(左上0..1)→ワールド座標
fn uvToWorld(uv: vec2f, U: RenderU) -> vec2f {
  let clip = vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
  return (clip - U.clipOffset) / U.clipScale;
}

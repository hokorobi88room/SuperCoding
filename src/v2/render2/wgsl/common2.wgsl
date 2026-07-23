// 共通定義: 構造体・フルスクリーン頂点・ノイズ/トーンマップ・生命色。
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

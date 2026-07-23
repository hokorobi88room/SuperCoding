// 発光パス: 生存個体を加算ブレンドのソフト円で trail へ描く(インスタンス描画)。
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

// 発光パス: 生存個体を加算ブレンドのソフト円で trail へ描く(インスタンス描画)。
@group(0) @binding(0) var<uniform> U: RenderU;
@group(0) @binding(1) var<storage, read> agents: array<Agent>;
@group(0) @binding(2) var<storage, read> flags: array<u32>;
@group(0) @binding(3) var<uniform> spColor: array<vec4f, 3>;

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
  // 死んでいる/空きスロットは退化(ゼロ面積・画面外)
  if (flags[ii] != 1u) {
    out.pos = vec4f(2.0, 2.0, 2.0, 1.0);
    return out;
  }
  let a = agents[ii];
  var q = array<vec2f, 4>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(1.0, 1.0));
  let uv = q[vi];
  let r = bodyLenOf(a) * 2.5;
  let wp = a.pos + uv * r;
  out.pos = vec4f(wp * U.clipScale + U.clipOffset, 0.0, 1.0);
  out.local = uv;
  // エネルギーで明るさを軽く変調
  let e = clamp(a.energy / 40.0, 0.3, 1.0);
  out.col = spColor[a.species].rgb * e;
  return out;
}

@fragment
fn fs_glow(in: GlowV) -> @location(0) vec4f {
  let d = length(in.local);
  // trail は減衰0.9の蓄積で定常10倍になるため、1スプライトの寄与はごく小さく
  let g = exp(-d * d * 3.0) * 0.028;
  return vec4f(in.col * g, g);
}

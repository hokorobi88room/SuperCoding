// 残像パス: 前フレームの trail を減衰コピー。上限クランプで白飛びを防ぐ。
@group(0) @binding(0) var<uniform> U: RenderU;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var prevTrail: texture_2d<f32>;

@fragment
fn fs_fade(in: VsFull) -> @location(0) vec4f {
  let c = textureSampleLevel(prevTrail, samp, in.uv, 0.0);
  return clamp(c * U.trailFade, vec4f(0.0), vec4f(6.0));
}

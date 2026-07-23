// 残像パス: 前フレームの trail を減衰コピーする。
@group(0) @binding(0) var<uniform> U: RenderU;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var prevTrail: texture_2d<f32>;

@fragment
fn fs_fade(in: VsFull) -> @location(0) vec4f {
  let c = textureSample(prevTrail, samp, in.uv);
  // 蓄積上限つき減衰(高密度域の無限白飛びを防ぐソフトリミット)
  return clamp(c * U.trailFade, vec4f(0.0), vec4f(6.0));
}

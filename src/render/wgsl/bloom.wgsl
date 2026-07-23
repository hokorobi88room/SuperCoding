// ブルーム: 輝度抽出 → dual-filter ダウンサンプル → 加算アップサンプル。
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var src: texture_2d<f32>;

// 輝度抽出(ソフト閾値)
@fragment
fn fs_bright(in: VsFull) -> @location(0) vec4f {
  let c = textureSample(src, samp, in.uv).rgb;
  let l = dot(c, vec3f(0.2126, 0.7152, 0.0722));
  let knee = smoothstep(0.75, 1.6, l);
  return vec4f(c * knee, 1.0);
}

// dual-filter ダウンサンプル(5タップ)
@fragment
fn fs_down(in: VsFull) -> @location(0) vec4f {
  let ts = 1.0 / vec2f(textureDimensions(src));
  let h = ts * 0.5;
  var s = textureSample(src, samp, in.uv).rgb * 4.0;
  s += textureSample(src, samp, in.uv + h).rgb;
  s += textureSample(src, samp, in.uv - h).rgb;
  s += textureSample(src, samp, in.uv + vec2f(h.x, -h.y)).rgb;
  s += textureSample(src, samp, in.uv + vec2f(-h.x, h.y)).rgb;
  return vec4f(s / 8.0, 1.0);
}

// dual-filter アップサンプル(8タップ tent)
@fragment
fn fs_up(in: VsFull) -> @location(0) vec4f {
  let h = 1.0 / vec2f(textureDimensions(src));
  var s = textureSample(src, samp, in.uv + vec2f(-h.x * 2.0, 0.0)).rgb;
  s += textureSample(src, samp, in.uv + vec2f(-h.x, h.y)).rgb * 2.0;
  s += textureSample(src, samp, in.uv + vec2f(0.0, h.y * 2.0)).rgb;
  s += textureSample(src, samp, in.uv + vec2f(h.x, h.y)).rgb * 2.0;
  s += textureSample(src, samp, in.uv + vec2f(h.x * 2.0, 0.0)).rgb;
  s += textureSample(src, samp, in.uv + vec2f(h.x, -h.y)).rgb * 2.0;
  s += textureSample(src, samp, in.uv + vec2f(0.0, -h.y * 2.0)).rgb;
  s += textureSample(src, samp, in.uv + vec2f(-h.x, -h.y)).rgb * 2.0;
  return vec4f(s / 12.0, 1.0);
}

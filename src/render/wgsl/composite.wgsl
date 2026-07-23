// 背景合成パス: 深海グラデ + fbmコースティクス + 岩 + trail を sceneTex へ。
@group(0) @binding(0) var<uniform> U: RenderU;
@group(0) @binding(1) var samp: sampler;     // clamp
@group(0) @binding(2) var wrapSamp: sampler; // repeat(トーラス)
@group(0) @binding(3) var trailTex: texture_2d<f32>;
@group(0) @binding(4) var obstacleTex: texture_2d<f32>;
@group(0) @binding(5) var flowTex: texture_2d<f32>;

@fragment
fn fs_comp(in: VsFull) -> @location(0) vec4f {
  let world = uvToWorld(in.uv, U);
  let wuv = world / U.world; // 0..1(範囲外はトーラスでラップ)

  // 流れ場サンプル(背景の水流歪みに使用)
  let flow = textureSample(flowTex, wrapSamp, wuv);
  let fdir = (flow.xy - 0.5) * 2.0;
  let fmag = flow.z;

  // 縦グラデ 深海
  let depth = clamp(wuv.y, 0.0, 1.0);
  let topCol = vec3f(0.020, 0.085, 0.150);
  let botCol = vec3f(0.004, 0.018, 0.045);
  var col = mix(topCol, botCol, depth);

  // fbmオーロラ/コースティクス(時間でゆっくり流れ、流れ場で歪ませる)
  let t = U.time * 0.03;
  let np = wuv * vec2f(3.0, 2.0) + fdir * fmag * 0.18 + vec2f(t, -t * 0.5);
  let n = fbm(np * 2.0);
  let caustic = pow(clamp(n, 0.0, 1.0), 3.0);
  col += vec3f(0.018, 0.095, 0.130) * caustic * (0.6 + 0.4 * sin(U.time * 0.2 + wuv.x * 6.0));

  // 岩(障害物): 暗色 + リムライト
  let rock = textureSample(obstacleTex, wrapSamp, wuv).r;
  if (rock > 0.02) {
    let e = vec2f(1.0 / 512.0, 1.0 / 288.0);
    // 非uniform分岐内なので textureSampleLevel(暗黙微分なし)を使う
    let gx = textureSampleLevel(obstacleTex, wrapSamp, wuv + vec2f(e.x, 0.0), 0.0).r
           - textureSampleLevel(obstacleTex, wrapSamp, wuv - vec2f(e.x, 0.0), 0.0).r;
    let gy = textureSampleLevel(obstacleTex, wrapSamp, wuv + vec2f(0.0, e.y), 0.0).r
           - textureSampleLevel(obstacleTex, wrapSamp, wuv - vec2f(0.0, e.y), 0.0).r;
    let rim = clamp(length(vec2f(gx, gy)) * 7.0, 0.0, 1.5);
    let rockCol = vec3f(0.028, 0.038, 0.052);
    let rimCol = vec3f(0.10, 0.34, 0.48) * rim;
    col = mix(col, rockCol + rimCol, clamp(rock * 1.5, 0.0, 1.0));
  }

  // 残像(trail)合成
  let tr = textureSample(trailTex, samp, in.uv).rgb;
  col += tr * 0.55;

  return vec4f(col, 1.0);
}

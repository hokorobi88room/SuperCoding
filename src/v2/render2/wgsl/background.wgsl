// 背景合成パス: 深宇宙/深海グラデ + 微fbm + 信号フェロモン場(文化の縄張り) +
//   建造物グリッド(civ) + 障壁 + 残像trail を sceneTex へ。主役は信号場の可視化。
@group(0) @binding(0) var<uniform> U: RenderU;
@group(0) @binding(1) var<uniform> palette: array<vec4f, 32>;
@group(0) @binding(2) var samp: sampler;     // clamp linear
@group(0) @binding(3) var wrapSamp: sampler; // repeat linear(トーラス)
@group(0) @binding(4) var trailTex: texture_2d<f32>;
@group(0) @binding(5) var signalTex: texture_2d<f32>;    // r:文化 g:食料匂 b:危険
@group(0) @binding(6) var structTex: texture_2d<f32>;    // r32float 建造密度
@group(0) @binding(7) var obstacleTex: texture_2d<f32>;
@group(0) @binding(8) var flowTex: texture_2d<f32>;

// 縄張り色: 低周波セルごとに安定した部族色を割り当て、境界を fbm で滲ませる。
fn territoryColor(world: vec2f) -> vec3f {
  let cell = floor(world / 190.0);
  let h = hash21(cell);
  let idx = u32(h * 32.0) % 32u;
  let jitter = hash21(cell + vec2f(7.3, 2.1));
  let idx2 = u32(jitter * 32.0) % 32u;
  // セル内での fbm 揺らぎで2色を混ぜ、道/縄張りの有機的な縁を作る
  let m = fbm(world / 90.0);
  return mix(palette[idx].rgb, palette[idx2].rgb, clamp(m, 0.0, 1.0));
}

@fragment
fn fs_bg(in: VsFull) -> @location(0) vec4f {
  let world = uvToWorld(in.uv, U);
  let wuv = world / U.world; // 0..1(トーラス外はラップ)

  // 潮流(背景歪みに使用)
  let flow = textureSampleLevel(flowTex, wrapSamp, wuv, 0.0);
  let fdir = (flow.xy - 0.5) * 2.0;
  let fmag = flow.z;

  // 深宇宙/深海グラデ(上=わずかに明るい)
  let depth = clamp(wuv.y, 0.0, 1.0);
  let topCol = vec3f(0.018, 0.028, 0.060);
  let botCol = vec3f(0.004, 0.008, 0.020);
  var col = mix(topCol, botCol, depth);

  // 微fbm の星雲/コースティクス
  let nt = U.time * 0.012;
  let np = wuv * vec2f(3.0, 2.0) + fdir * fmag * 0.15 + vec2f(nt, -nt * 0.6);
  let neb = pow(clamp(fbm(np * 2.0), 0.0, 1.0), 2.4);
  col += vec3f(0.020, 0.030, 0.055) * neb * (0.7 + 0.3 * sin(U.time * 0.2 + wuv.x * 6.0));

  // ---- 信号フェロモン場(発光する文化の海)----
  // fbm で標本座標をわずかに歪ませ、脈打つ発光に見せる
  let warp = (fbm(wuv * 5.0 + vec2f(U.time * 0.05, 0.0)) - 0.5) * 0.012;
  let sig = textureSampleLevel(signalTex, samp, wuv + vec2f(warp, warp), 0.0);
  let culture = clamp(sig.r, 0.0, 8.0);
  let foodSmell = clamp(sig.g, 0.0, 8.0);
  let danger = clamp(sig.b, 0.0, 8.0);

  // 文化: 部族色で縄張り・道を発光させる(主役)
  let terr = territoryColor(world);
  let cpulse = 0.85 + 0.15 * sin(U.time * 1.3 + culture * 1.5);
  col += terr * culture * 0.30 * cpulse;
  // 食料の匂い: 淡い緑の霞
  col += vec3f(0.05, 0.16, 0.07) * foodSmell * 0.10;
  // 危険痕跡: 赤い澱み
  col += vec3f(0.95, 0.10, 0.14) * danger * 0.22;

  // ---- 建造物(civ時)----
  let sc = vec2<i32>(
    clamp(i32(wuv.x * STRUCT_W), 0, i32(STRUCT_W) - 1),
    clamp(i32(wuv.y * STRUCT_H), 0, i32(STRUCT_H) - 1),
  );
  let st = clamp(textureLoad(structTex, sc, 0).r, 0.0, 2.0);
  if (st > 0.001) {
    // 明るいグリッド模様で建造を重畳
    let g = world / 14.0;
    let grid = max(
      smoothstep(0.92, 1.0, abs(sin(g.x * 3.14159))),
      smoothstep(0.92, 1.0, abs(sin(g.y * 3.14159))),
    );
    let structCol = vec3f(0.85, 0.78, 0.55);
    col += structCol * clamp(st, 0.0, 1.0) * (0.25 + 0.65 * grid);
  }

  // ---- 障壁(神が描いた障害物)----
  let rock = textureSampleLevel(obstacleTex, wrapSamp, wuv, 0.0).r;
  if (rock > 0.02) {
    let e = vec2f(1.0 / 512.0, 1.0 / 288.0);
    let gx = textureSampleLevel(obstacleTex, wrapSamp, wuv + vec2f(e.x, 0.0), 0.0).r
           - textureSampleLevel(obstacleTex, wrapSamp, wuv - vec2f(e.x, 0.0), 0.0).r;
    let gy = textureSampleLevel(obstacleTex, wrapSamp, wuv + vec2f(0.0, e.y), 0.0).r
           - textureSampleLevel(obstacleTex, wrapSamp, wuv - vec2f(0.0, e.y), 0.0).r;
    let rim = clamp(length(vec2f(gx, gy)) * 7.0, 0.0, 1.5);
    let rockCol = vec3f(0.030, 0.036, 0.050);
    let rimCol = vec3f(0.20, 0.30, 0.55) * rim;
    col = mix(col, rockCol + rimCol, clamp(rock * 1.5, 0.0, 1.0));
  }

  // 残像 trail 合成(生命の航跡)
  let tr = textureSampleLevel(trailTex, samp, in.uv, 0.0).rgb;
  col += tr * 0.60;

  return vec4f(col, 1.0);
}

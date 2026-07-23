// 最終合成: scene+bloom → ACESトーンマップ + ビネット + 微グレイン +
//   神の御業リング(カーソル) + 黒レターボックス。
@group(0) @binding(0) var<uniform> U: RenderU;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var sceneTex: texture_2d<f32>;
@group(0) @binding(3) var bloomTex: texture_2d<f32>;
@group(0) @binding(4) var<uniform> IA: Interaction;

// 神の御業ツール色(contracts2 の Divine 順)
fn toolColor(t: u32) -> vec3f {
  switch t {
    case 1u: { return vec3f(0.45, 1.15, 0.55); } // BLESS 恵み 緑
    case 2u: { return vec3f(1.40, 0.25, 0.35); } // SMITE 天罰 赤
    case 3u: { return vec3f(0.35, 1.00, 1.35); } // BECKON 誘い シアン
    case 4u: { return vec3f(1.35, 0.60, 0.30); } // REPEL 忌避 橙
    case 5u: { return vec3f(0.80, 0.45, 1.35); } // MAELSTROM 渦 紫
    case 6u: { return vec3f(0.62, 0.58, 0.48); } // BARRIER 障壁 岩色
    case 7u: { return vec3f(0.92, 0.94, 1.00); } // ERASE 消去 白
    case 8u: { return vec3f(0.30, 0.72, 1.25); } // CURRENT 潮流 青
    default: { return vec3f(0.70, 0.80, 1.00); } // OBSERVE
  }
}

@fragment
fn fs_final(in: VsFull) -> @location(0) vec4f {
  let world = uvToWorld(in.uv, U);

  // ワールド矩形外は黒レターボックス
  if (world.x < 0.0 || world.x > U.world.x || world.y < 0.0 || world.y > U.world.y) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }

  // レターボックス早期return後の非uniform制御フローのため textureSampleLevel
  var col = textureSampleLevel(sceneTex, samp, in.uv, 0.0).rgb;
  col += textureSampleLevel(bloomTex, samp, in.uv, 0.0).rgb * U.bloomStr;

  // 神の御業リング(ツール色)
  if (IA.radius > 0.5 && IA.tool != 0u) {
    let dm = distance(world, IA.mouse);
    let ring = 1.0 - smoothstep(0.0, 3.0, abs(dm - IA.radius));
    let inten = select(0.30, 0.95, IA.isDown == 1u);
    col += toolColor(IA.tool) * ring * inten;
    // 中心の淡い充填
    let fill = (1.0 - smoothstep(0.0, IA.radius, dm)) * 0.05;
    col += toolColor(IA.tool) * fill;
  }

  // ACESトーンマップ
  col = aces(col);

  // ビネット(神の視野の縁)
  let q = in.uv - vec2f(0.5);
  let vig = smoothstep(0.92, 0.30, length(q));
  col *= mix(0.50, 1.0, vig);

  // 微グレイン
  let g = (hash21(in.uv * U.resolution + vec2f(U.time)) - 0.5) * 0.026;
  col += vec3f(g);

  return vec4f(col, 1.0);
}

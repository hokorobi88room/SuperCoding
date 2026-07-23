// 最終合成: scene+bloom → ACESトーンマップ + ビネット + グレイン + カーソルリング + レターボックス。
@group(0) @binding(0) var<uniform> U: RenderU;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var sceneTex: texture_2d<f32>;
@group(0) @binding(3) var bloomTex: texture_2d<f32>;
@group(0) @binding(4) var<uniform> IA: Interaction;

fn toolColor(t: u32) -> vec3f {
  switch t {
    case 1u: { return vec3f(0.35, 1.10, 0.50); } // FOOD 緑
    case 2u: { return vec3f(0.30, 1.00, 1.40); } // ATTRACT シアン
    case 3u: { return vec3f(1.40, 0.55, 0.30); } // REPEL 橙赤
    case 4u: { return vec3f(0.85, 0.50, 1.40); } // VORTEX 紫
    case 5u: { return vec3f(1.40, 0.30, 0.50); } // FEAR 赤
    case 6u: { return vec3f(0.60, 0.55, 0.45); } // OBSTACLE 岩色
    case 7u: { return vec3f(0.90, 0.92, 1.00); } // ERASE 白
    case 8u: { return vec3f(0.30, 0.80, 1.20); } // CURRENT 青
    default: { return vec3f(0.55, 0.90, 1.05); }
  }
}

@fragment
fn fs_final(in: VsFull) -> @location(0) vec4f {
  let world = uvToWorld(in.uv, U);

  // ワールド矩形外は黒レターボックス
  if (world.x < 0.0 || world.x > U.world.x || world.y < 0.0 || world.y > U.world.y) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }

  // 早期return(レターボックス)後の非uniform制御フローのため textureSampleLevel を使う
  var col = textureSampleLevel(sceneTex, samp, in.uv, 0.0).rgb;
  col += textureSampleLevel(bloomTex, samp, in.uv, 0.0).rgb * U.bloomStr;

  // カーソルブラシリング(ツール色)
  if (IA.radius > 0.5 && IA.tool != 0u) {
    let dm = distance(world, IA.mouse);
    let ring = 1.0 - smoothstep(0.0, 2.5, abs(dm - IA.radius));
    let inten = select(0.35, 0.9, IA.isDown == 1u);
    col += toolColor(IA.tool) * ring * inten;
  }

  // ACESトーンマップ
  col = aces(col);

  // ビネット
  let q = in.uv - vec2f(0.5);
  let vig = smoothstep(0.90, 0.32, length(q));
  col *= mix(0.55, 1.0, vig);

  // 微グレイン
  let g = (hash21(in.uv * U.resolution + vec2f(U.time)) - 0.5) * 0.028;
  col += vec3f(g);

  return vec4f(col, 1.0);
}

/**
 * 部族(ミームクラスタ)の識別色パレット — 32色。
 *
 * 描画側は lineage / meme から index を選び、信号フェロモン場の
 * 文化チャンネルや個体をこの色で染める。よって「視認性の高い、
 * 多様な色相」であることが最優先。値は HDR 線形RGB(レンダラの
 * ACESトーンマップ前提)なので、発色を残すため 1.0 を少し超える
 * 明部を許容する。
 *
 * 生成方針:
 *  - 色相は 32 等分するが、隣接 index の色相が大きく飛ぶよう
 *    5(=32と互いに素)刻みで巡回させる。部族番号が連番でも
 *    隣り合う色が紛れにくい。
 *  - 彩度・明度を短い周期でずらし、色相以外の手掛かりも与える。
 *  - sRGB で色を組み立てたのち線形空間へ変換し、軽く増光する。
 */

/** HSV(各0..1)→ sRGB(各0..1) */
function hsvToSrgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (((i % 6) + 6) % 6) {
    case 0:
      return [v, t, p];
    case 1:
      return [q, v, p];
    case 2:
      return [p, v, t];
    case 3:
      return [p, q, v];
    case 4:
      return [t, p, v];
    default:
      return [v, p, q];
  }
}

/** sRGB(0..1)→ 線形RGB */
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function buildPalette(): [number, number, number][] {
  // 彩度・明度の巡回パターン(色相以外の識別手掛かり)。
  const sat = [0.9, 1.0, 0.72, 0.95];
  const val = [1.0, 0.86, 0.95];
  const boost = 1.28; // HDR 発色のための軽い増光

  const out: [number, number, number][] = [];
  for (let i = 0; i < 32; i++) {
    const h = ((i * 5) % 32) / 32;
    const s = sat[i % sat.length];
    const v = val[i % val.length];
    const [r, g, b] = hsvToSrgb(h, s, v);
    out.push([
      srgbToLinear(r) * boost,
      srgbToLinear(g) * boost,
      srgbToLinear(b) * boost,
    ]);
  }
  return out;
}

export const TRIBE_PALETTE: [number, number, number][] = buildPalette();

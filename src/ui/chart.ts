/**
 * 個体数チャート (Canvas2D)。直近120秒の3種を色ラインで描く。所有: ui 担当。
 */

export interface PopChart {
  /** 毎フレーム呼ぶ。simTime と3種の個体数を記録。 */
  push(t: number, pops: readonly number[]): void;
  /** 間引いたタイミングで再描画。 */
  render(): void;
  /** CSSピクセルサイズを与えて内部バッファを再確保。 */
  resize(cssW: number, cssH: number): void;
  /** リセット時に履歴を消去。 */
  clear(): void;
}

interface Sample {
  t: number;
  p: [number, number, number];
}

const WINDOW = 120; // 秒
const MAX_SAMPLES = 6000; // 一時停止中の無限成長を抑える上限

/** 見やすい上限値に丸める (1/2/5 * 10^n) */
function niceMax(v: number): number {
  if (v <= 0) return 10;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

export function createChart(
  canvas: HTMLCanvasElement,
  colors: readonly string[],
  _names: readonly string[],
): PopChart {
  const ctx = canvas.getContext("2d")!;
  let samples: Sample[] = [];
  let cssW = 0;
  let cssH = 0;
  let dpr = Math.min(globalThis.devicePixelRatio || 1, 2);

  function push(t: number, pops: readonly number[]): void {
    samples.push({ t, p: [pops[0] || 0, pops[1] || 0, pops[2] || 0] });
    // 窓外の古いサンプルをまとめて捨てる
    const tMin = t - WINDOW;
    let drop = 0;
    while (drop < samples.length - 1 && samples[drop].t < tMin) drop++;
    if (drop > 0) samples.splice(0, drop);
    if (samples.length > MAX_SAMPLES) {
      samples.splice(0, samples.length - MAX_SAMPLES);
    }
  }

  function clear(): void {
    samples = [];
  }

  function resize(w: number, h: number): void {
    cssW = w;
    cssH = h;
    dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
  }

  function render(): void {
    if (cssW <= 0 || cssH <= 0) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const padL = 6;
    const padR = 58;
    const padT = 10;
    const padB = 8;
    const plotW = Math.max(1, cssW - padL - padR);
    const plotH = Math.max(1, cssH - padT - padB);
    const x0 = padL;
    const y0 = padT;

    const tMax = samples.length ? samples[samples.length - 1].t : 0;
    const tMin = tMax - WINDOW;

    // 窓内の最大個体数からY軸スケールを決める
    let peak = 0;
    for (const s of samples) {
      if (s.p[0] > peak) peak = s.p[0];
      if (s.p[1] > peak) peak = s.p[1];
      if (s.p[2] > peak) peak = s.p[2];
    }
    const maxY = niceMax(Math.max(10, peak));

    // 背景グリッド
    ctx.lineWidth = 1;
    ctx.font = "10px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    for (let g = 0; g <= 2; g++) {
      const frac = g / 2;
      const y = y0 + plotH - frac * plotH;
      ctx.strokeStyle = "rgba(120, 190, 230, 0.10)";
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + plotW, y);
      ctx.stroke();
      ctx.fillStyle = "rgba(150, 200, 235, 0.35)";
      ctx.textAlign = "left";
      ctx.fillText(String(Math.round(maxY * frac)), x0 + 2, y - 6);
    }

    if (samples.length < 2) return;

    const xOf = (t: number) => {
      const f = (t - tMin) / WINDOW;
      return x0 + Math.max(0, Math.min(1, f)) * plotW;
    };
    const yOf = (v: number) => y0 + plotH - (v / maxY) * plotH;

    // 各種のライン + 淡いエリア塗り
    for (let sp = 0; sp < 3; sp++) {
      const col = colors[sp] || "#7fd";

      // エリア
      ctx.beginPath();
      ctx.moveTo(xOf(samples[0].t), y0 + plotH);
      for (const s of samples) ctx.lineTo(xOf(s.t), yOf(s.p[sp]));
      ctx.lineTo(xOf(samples[samples.length - 1].t), y0 + plotH);
      ctx.closePath();
      ctx.globalAlpha = 0.10;
      ctx.fillStyle = col;
      ctx.fill();
      ctx.globalAlpha = 1;

      // ライン(発光)
      ctx.beginPath();
      for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        const x = xOf(s.t);
        const y = yOf(s.p[sp]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.6;
      ctx.lineJoin = "round";
      ctx.shadowColor = col;
      ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // 右端に現在値ラベル
    const last = samples[samples.length - 1];
    ctx.textAlign = "left";
    ctx.font = "600 11px system-ui, sans-serif";
    for (let sp = 0; sp < 3; sp++) {
      const col = colors[sp] || "#7fd";
      const y = Math.max(y0 + 6, Math.min(y0 + plotH - 6, yOf(last.p[sp])));
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x0 + plotW + 8, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(last.p[sp].toLocaleString(), x0 + plotW + 14, y);
    }
  }

  return { push, render, resize, clear };
}

/**
 * 素のDOM生成ヘルパと色変換ユーティリティ。所有: ui 担当。
 * 神視点UI(observatory)と年代記表示で共用する。
 */

/** el() に渡せるプロパティ。属性・イベント・テキストをまとめて設定する。 */
export interface ElProps {
  class?: string;
  id?: string;
  text?: string;
  html?: string;
  title?: string;
  type?: string;
  value?: string | number;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  attrs?: Record<string, string>;
  onclick?: (e: MouseEvent) => void;
  oninput?: (e: Event) => void;
  onchange?: (e: Event) => void;
  onwheel?: (e: WheelEvent) => void;
}

/** createElement の簡潔ラッパ。子は Node か文字列で渡す。 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElProps = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.id) node.id = props.id;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.html !== undefined) node.innerHTML = props.html;
  if (props.title !== undefined) node.title = props.title;
  // レンジ入力は min/max/step を value より前に設定しないと丸められる
  if (props.type !== undefined) node.setAttribute("type", props.type);
  if (props.min !== undefined) node.setAttribute("min", String(props.min));
  if (props.max !== undefined) node.setAttribute("max", String(props.max));
  if (props.step !== undefined) node.setAttribute("step", String(props.step));
  if (props.value !== undefined) {
    (node as unknown as HTMLInputElement).value = String(props.value);
  }
  if (props.attrs) {
    for (const k in props.attrs) node.setAttribute(k, props.attrs[k]);
  }
  if (props.onclick) {
    node.addEventListener("click", props.onclick as EventListener);
  }
  if (props.oninput) {
    node.addEventListener("input", props.oninput as EventListener);
  }
  if (props.onchange) {
    node.addEventListener("change", props.onchange as EventListener);
  }
  if (props.onwheel) {
    node.addEventListener("wheel", props.onwheel as EventListener, {
      passive: false,
    });
  }
  for (const c of children) node.append(c);
  return node;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** 線形1成分 → sRGB(0..1) */
function lin2srgb(c: number): number {
  c = clamp(c, 0, 1);
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/**
 * HDR係数込みの線形RGB を表示用 sRGB(css rgb文字列)へ変換。
 * 1 を超える成分は per-channel で clamp してから sRGB エンコードする。
 */
export function hdrToCss(rgb: readonly [number, number, number]): string {
  const r = Math.round(lin2srgb(rgb[0]) * 255);
  const g = Math.round(lin2srgb(rgb[1]) * 255);
  const b = Math.round(lin2srgb(rgb[2]) * 255);
  return `rgb(${r}, ${g}, ${b})`;
}

/** simTime(秒) を m:ss 表記へ */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${String(ss).padStart(2, "0")}`;
}

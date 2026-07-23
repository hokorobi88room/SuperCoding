/** キャンバス⇄ワールド座標変換(v1と同一・レターボックス)。所有: 統合担当。 */
import { type ViewTransform2, WORLD_H, WORLD_W } from "./contracts2";

export function createViewTransform2(canvas: HTMLCanvasElement): ViewTransform2 {
  return {
    clientToWorld(x, y) {
      const rect = canvas.getBoundingClientRect();
      const sf = Math.min(rect.width / WORLD_W, rect.height / WORLD_H);
      const ox = (rect.width - WORLD_W * sf) / 2;
      const oy = (rect.height - WORLD_H * sf) / 2;
      const wx = (x - rect.left - ox) / sf;
      const wy = (y - rect.top - oy) / sf;
      return [Math.min(WORLD_W, Math.max(0, wx)), Math.min(WORLD_H, Math.max(0, wy))];
    },
    worldToClip() {
      const rect = canvas.getBoundingClientRect();
      const sf = Math.min(rect.width / WORLD_W, rect.height / WORLD_H);
      const ox = (rect.width - WORLD_W * sf) / 2;
      const oy = (rect.height - WORLD_H * sf) / 2;
      return {
        scale: [(2 * sf) / rect.width, (-2 * sf) / rect.height],
        offset: [(2 * ox) / rect.width - 1, 1 - (2 * oy) / rect.height],
      };
    },
  };
}

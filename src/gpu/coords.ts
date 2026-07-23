/**
 * キャンバス⇄ワールド座標変換(アスペクト比保持・レターボックス)。
 * 所有: 統合担当(main)。
 */
import { type ViewTransform, WORLD_H, WORLD_W } from "../contracts";

export function createViewTransform(canvas: HTMLCanvasElement): ViewTransform {
  return {
    clientToWorld(x: number, y: number): [number, number] {
      const rect = canvas.getBoundingClientRect();
      const sf = Math.min(rect.width / WORLD_W, rect.height / WORLD_H);
      const ox = (rect.width - WORLD_W * sf) / 2;
      const oy = (rect.height - WORLD_H * sf) / 2;
      const wx = (x - rect.left - ox) / sf;
      const wy = (y - rect.top - oy) / sf;
      return [
        Math.min(WORLD_W, Math.max(0, wx)),
        Math.min(WORLD_H, Math.max(0, wy)),
      ];
    },
    worldToClip() {
      const rect = canvas.getBoundingClientRect();
      const sf = Math.min(rect.width / WORLD_W, rect.height / WORLD_H);
      const ox = (rect.width - WORLD_W * sf) / 2;
      const oy = (rect.height - WORLD_H * sf) / 2;
      return {
        scale: [(2 * sf) / rect.width, (-2 * sf) / rect.height] as [
          number,
          number,
        ],
        offset: [(2 * ox) / rect.width - 1, 1 - (2 * oy) / rect.height] as [
          number,
          number,
        ],
      };
    },
  };
}

/**
 * 操作・ペイント系(所有: interaction 担当)。
 * canvas のポインタ/ホイール入力を受け、
 *  - interaction uniform(32B)を毎フレーム更新
 *  - FOOD ツールのドラッグ中は SpawnRequest 配列を返す
 *  - OBSTACLE/ERASE は obstacleTex(r8unorm 512x288)を円ブラシで塗り替え
 *  - CURRENT は flowTex(rgba8unorm 256x144)にドラッグ方向を描く
 * を担う。DESIGN.md「操作仕様」節に準拠。
 */
import {
  FLOW_TEX_H,
  FLOW_TEX_W,
  type IInteraction,
  OBSTACLE_TEX_H,
  OBSTACLE_TEX_W,
  type SimBuffers,
  type SpawnRequest,
  SPECIES_ALGAE,
  Tool,
  type ToolId,
  type ViewTransform,
  WORLD_H,
  WORLD_W,
} from "../contracts";

// ブラシ半径の下限・上限(ワールド単位)
const BRUSH_MIN = 10;
const BRUSH_MAX = 120;
// FOOD スポーン間隔(約20Hz)
const FOOD_INTERVAL = 1 / 20;
// ペイントのGPUアップロード間隔(ドラッグ中)
const FLUSH_INTERVAL = 0.15;
// FOOD: 1リクエストあたりの散布数と初期エネルギー
const FOOD_COUNT = 25;
const FOOD_ENERGY = 15;
// 1フレームで発行するスポーン要求の上限(バックログ暴走防止)
const MAX_SPAWNS_PER_FRAME = 8;

// ワールド → テクスチャ画素 の縮尺(x/y でアスペクト一致=等倍)
const OBS_SCALE = OBSTACLE_TEX_W / WORLD_W; // 512/1600 = 0.32
const FLOW_SCALE = FLOW_TEX_W / WORLD_W; //   256/1600 = 0.16

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

class Interaction implements IInteraction {
  private currentTool: ToolId = Tool.NONE;
  private radius = 45;
  private strengthVal = 0.6;

  // ポインタ状態
  private pointerDown = false;
  private activePointerId: number | null = null;
  // 直近のマウス位置(ワールド座標)。カーソルリング描画に常時使用。
  private mouseX = WORLD_W * 0.5;
  private mouseY = WORLD_H * 0.5;
  // 直前にペイントした位置(セグメント補間の始点)
  private lastX = WORLD_W * 0.5;
  private lastY = WORLD_H * 0.5;
  // CURRENT の直近方向(移動量が微小なとき再利用)
  private flowDirX = 1;
  private flowDirY = 0;

  // タイマー(秒)
  private foodAccum = 0;
  private flushAccum = 0;

  // オフスクリーンキャンバス
  private readonly obs: OffscreenCanvas;
  private readonly obsCtx: OffscreenCanvasRenderingContext2D;
  private readonly flow: OffscreenCanvas;
  private readonly flowCtx: OffscreenCanvasRenderingContext2D;
  private obstacleDirty = false;
  private flowDirty = false;
  // r8unorm アップロード用の再利用バッファ
  private readonly obsBytes = new Uint8Array(OBSTACLE_TEX_W * OBSTACLE_TEX_H);

  // interaction uniform(32B)。f32×8 / u32 は同一バッファへのビュー。
  private readonly uni = new Float32Array(8);
  private readonly uniU32 = new Uint32Array(this.uni.buffer);

  // スポーン要求の一時配列(呼び出し側へ返す)
  private readonly spawnScratch: SpawnRequest[] = [];

  constructor(
    private readonly device: GPUDevice,
    private readonly buffers: SimBuffers,
    private readonly canvas: HTMLCanvasElement,
    private readonly view: ViewTransform,
  ) {
    this.obs = new OffscreenCanvas(OBSTACLE_TEX_W, OBSTACLE_TEX_H);
    this.flow = new OffscreenCanvas(FLOW_TEX_W, FLOW_TEX_H);
    const oc = this.obs.getContext("2d", { willReadFrequently: true });
    const fc = this.flow.getContext("2d", { willReadFrequently: true });
    if (!oc || !fc) {
      throw new Error("2D コンテキストの取得に失敗しました");
    }
    this.obsCtx = oc;
    this.flowCtx = fc;
    // flow は「中立(dir=0, strength=0)」= (128,128,0) で初期化しておく。
    // 未塗りの領域が誤った流向にならないよう不透明で埋める。
    this.fillFlowNeutral();
    // obstacle は透明のまま(未塗り=障害物なし)。

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  // ------- IInteraction ゲッタ ----------------------------------------
  get tool(): ToolId {
    return this.currentTool;
  }
  get brushRadius(): number {
    return this.radius;
  }
  get strength(): number {
    return this.strengthVal;
  }

  setTool(t: ToolId): void {
    // ツール切替時はドラッグ状態をリセット(進行中の塗りは確定してから)。
    if (this.pointerDown) this.endDrag();
    this.currentTool = t;
  }
  setBrushRadius(r: number): void {
    this.radius = clamp(r, BRUSH_MIN, BRUSH_MAX);
  }
  setStrength(s: number): void {
    this.strengthVal = clamp(s, 0, 1);
  }

  // ------- 毎フレーム更新 ---------------------------------------------
  update(dt: number): SpawnRequest[] {
    // uniform 更新: mouse は常時、isDown は NONE 以外かつドラッグ中のみ。
    const down = this.pointerDown && this.currentTool !== Tool.NONE ? 1 : 0;
    this.uni[0] = this.mouseX;
    this.uni[1] = this.mouseY;
    this.uni[2] = this.radius;
    this.uni[3] = this.strengthVal;
    this.uniU32[4] = this.currentTool >>> 0;
    this.uniU32[5] = down;
    this.uni[6] = 0;
    this.uni[7] = 0;
    this.device.queue.writeBuffer(this.buffers.interaction, 0, this.uni);

    // FOOD: ドラッグ中は約20Hzで藻スポーンを発行。
    this.spawnScratch.length = 0;
    if (this.currentTool === Tool.FOOD && this.pointerDown) {
      this.foodAccum += dt;
      let guard = 0;
      while (this.foodAccum >= FOOD_INTERVAL && guard < MAX_SPAWNS_PER_FRAME) {
        this.foodAccum -= FOOD_INTERVAL;
        guard++;
        this.spawnScratch.push({
          x: this.mouseX,
          y: this.mouseY,
          species: SPECIES_ALGAE,
          count: FOOD_COUNT,
          spread: this.radius,
          energy: FOOD_ENERGY,
        });
      }
      // バックログはためない
      if (this.foodAccum > FOOD_INTERVAL) this.foodAccum = FOOD_INTERVAL;
    }

    // ペイント系: ドラッグ中は 150ms ごとにGPUへ反映。
    if (
      this.pointerDown &&
      (this.currentTool === Tool.OBSTACLE ||
        this.currentTool === Tool.ERASE ||
        this.currentTool === Tool.CURRENT)
    ) {
      this.flushAccum += dt;
      if (this.flushAccum >= FLUSH_INTERVAL) {
        this.flushAccum = 0;
        this.flushDirty();
      }
    }

    return this.spawnScratch;
  }

  clearPaint(): void {
    // 障害物キャンバスを全消去 → 障害物テクスチャをゼロで上書き。
    this.obsCtx.clearRect(0, 0, OBSTACLE_TEX_W, OBSTACLE_TEX_H);
    this.obstacleDirty = false;
    this.uploadObstacle();
    // flow を中立で全埋め → アップロード。
    this.fillFlowNeutral();
    this.flowDirty = false;
    this.uploadFlow();
  }

  // ------- ポインタハンドラ -------------------------------------------
  private onPointerDown = (e: PointerEvent): void => {
    const [wx, wy] = this.view.clientToWorld(e.clientX, e.clientY);
    this.mouseX = wx;
    this.mouseY = wy;
    this.lastX = wx;
    this.lastY = wy;
    if (this.currentTool === Tool.NONE) return; // NONE はドラッグ操作なし

    try {
      this.canvas.setPointerCapture(e.pointerId);
      this.activePointerId = e.pointerId;
    } catch {
      this.activePointerId = null;
    }
    this.pointerDown = true;
    this.foodAccum = FOOD_INTERVAL; // 押下直後に1回まく
    this.flushAccum = 0;
    e.preventDefault();

    if (this.currentTool === Tool.OBSTACLE || this.currentTool === Tool.ERASE) {
      this.stampObstacle(wx, wy);
      this.obstacleDirty = true;
    }
    // CURRENT は移動が生じてから方向を確定する。
  };

  private onPointerMove = (e: PointerEvent): void => {
    const [wx, wy] = this.view.clientToWorld(e.clientX, e.clientY);
    this.mouseX = wx;
    this.mouseY = wy;
    if (!this.pointerDown) return;
    if (
      this.currentTool === Tool.OBSTACLE ||
      this.currentTool === Tool.ERASE ||
      this.currentTool === Tool.CURRENT
    ) {
      this.paintSegment(this.lastX, this.lastY, wx, wy);
    }
    this.lastX = wx;
    this.lastY = wy;
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.pointerDown && this.activePointerId === null) return;
    const [wx, wy] = this.view.clientToWorld(e.clientX, e.clientY);
    this.mouseX = wx;
    this.mouseY = wy;
    this.endDrag();
  };

  private onPointerLeave = (): void => {
    // ドラッグ中に離脱したら確定して終了(未ドラッグ時は座標を保持するだけ)。
    if (this.pointerDown) this.endDrag();
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    // 上スクロールで拡大、下スクロールで縮小。
    const dir = e.deltaY > 0 ? -1 : 1;
    this.setBrushRadius(this.radius + dir * 5);
  };

  // ------- 内部処理 ---------------------------------------------------
  private endDrag(): void {
    if (this.activePointerId !== null) {
      try {
        this.canvas.releasePointerCapture(this.activePointerId);
      } catch {
        // capture 済みでない場合は無視
      }
      this.activePointerId = null;
    }
    this.pointerDown = false;
    this.foodAccum = 0;
    this.flushAccum = 0;
    // 溜まっている塗りを最終アップロード。
    this.flushDirty();
  }

  /** from→to のワールド区間を等間隔にサンプリングして円ブラシを重ね押しする。 */
  private paintSegment(ax: number, ay: number, bx: number, by: number): void {
    const dxw = bx - ax;
    const dyw = by - ay;
    const dist = Math.hypot(dxw, dyw);
    const step = Math.max(2, this.radius * 0.25);
    const n = Math.max(1, Math.ceil(dist / step));

    if (this.currentTool === Tool.CURRENT) {
      // 移動方向を正規化(微小移動時は前回方向を維持)。
      let dirX = dxw;
      let dirY = dyw;
      const m = Math.hypot(dirX, dirY);
      if (m > 1e-4) {
        dirX /= m;
        dirY /= m;
        this.flowDirX = dirX;
        this.flowDirY = dirY;
      } else {
        dirX = this.flowDirX;
        dirY = this.flowDirY;
      }
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        this.stampFlow(ax + dxw * t, ay + dyw * t, dirX, dirY);
      }
      this.flowDirty = true;
    } else {
      // OBSTACLE / ERASE
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        this.stampObstacle(ax + dxw * t, ay + dyw * t);
      }
      this.obstacleDirty = true;
    }
  }

  /** 障害物/消去の円ブラシ1押し。ERASE は destination-out。 */
  private stampObstacle(wx: number, wy: number): void {
    const tx = wx * OBS_SCALE;
    const ty = wy * OBS_SCALE;
    const r = Math.max(1, this.radius * OBS_SCALE);
    const ctx = this.obsCtx;
    ctx.save();
    const g = ctx.createRadialGradient(tx, ty, 0, tx, ty, r);
    if (this.currentTool === Tool.ERASE) {
      ctx.globalCompositeOperation = "destination-out";
      g.addColorStop(0, "rgba(0,0,0,1)");
      g.addColorStop(0.6, "rgba(0,0,0,0.85)");
      g.addColorStop(1, "rgba(0,0,0,0)");
    } else {
      ctx.globalCompositeOperation = "source-over";
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.6, "rgba(255,255,255,0.9)");
      g.addColorStop(1, "rgba(255,255,255,0)");
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(tx, ty, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** 海流の円ブラシ1押し。方向 dir を b=strength とともに半透明で lerp 合成。 */
  private stampFlow(wx: number, wy: number, dirX: number, dirY: number): void {
    const tx = wx * FLOW_SCALE;
    const ty = wy * FLOW_SCALE;
    const r = Math.max(1, this.radius * FLOW_SCALE);
    const rc = Math.round((dirX * 0.5 + 0.5) * 255);
    const gc = Math.round((dirY * 0.5 + 0.5) * 255);
    const bc = Math.round(this.strengthVal * 255);
    const ctx = this.flowCtx;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 0.35; // 方向を約35%ずつ lerp
    const g = ctx.createRadialGradient(tx, ty, 0, tx, ty, r);
    g.addColorStop(0, `rgba(${rc},${gc},${bc},1)`);
    g.addColorStop(1, `rgba(${rc},${gc},${bc},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(tx, ty, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** 汚れているキャンバスのみGPUへアップロード。 */
  private flushDirty(): void {
    if (this.obstacleDirty) {
      this.uploadObstacle();
      this.obstacleDirty = false;
    }
    if (this.flowDirty) {
      this.uploadFlow();
      this.flowDirty = false;
    }
  }

  private uploadObstacle(): void {
    const img = this.obsCtx.getImageData(
      0,
      0,
      OBSTACLE_TEX_W,
      OBSTACLE_TEX_H,
    );
    const src = img.data;
    const out = this.obsBytes;
    // destination-out 消去はアルファのみを削るため、
    // 障害物の濃度はアルファチャンネルから取り出す(白ブラシなので R も同値)。
    for (let i = 0; i < out.length; i++) {
      out[i] = src[i * 4 + 3];
    }
    this.device.queue.writeTexture(
      { texture: this.buffers.obstacleTex },
      out,
      { bytesPerRow: OBSTACLE_TEX_W },
      [OBSTACLE_TEX_W, OBSTACLE_TEX_H],
    );
  }

  private uploadFlow(): void {
    const img = this.flowCtx.getImageData(0, 0, FLOW_TEX_W, FLOW_TEX_H);
    const data = new Uint8Array(
      img.data.buffer,
      img.data.byteOffset,
      img.data.byteLength,
    );
    this.device.queue.writeTexture(
      { texture: this.buffers.flowTex },
      data,
      { bytesPerRow: FLOW_TEX_W * 4 },
      [FLOW_TEX_W, FLOW_TEX_H],
    );
  }

  private fillFlowNeutral(): void {
    const ctx = this.flowCtx;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgb(128,128,0)";
    ctx.fillRect(0, 0, FLOW_TEX_W, FLOW_TEX_H);
    ctx.restore();
  }
}

export function createInteraction(
  device: GPUDevice,
  buffers: SimBuffers,
  canvas: HTMLCanvasElement,
  view: ViewTransform,
): IInteraction {
  return new Interaction(device, buffers, canvas, view);
}

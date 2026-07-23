/**
 * 神の御業 (inter 担当) — 神視点の介入ツール群。
 * canvas のポインタ/ホイール入力を受け、
 *  - interaction uniform(32B)を毎フレーム更新(mouse は world 座標)
 *  - BLESS(恵み)ドラッグ中は約20Hzで SpawnRequest(食料)を返す
 *  - BARRIER/ERASE は obstacleTex(r8unorm 512x288)を円ブラシで塗り替え
 *  - CURRENT は flowTex(rgba8unorm 256x144)にドラッグ方向を描く
 *  - SMITE/BECKON/REPEL/MAELSTROM は uniform を書くだけ(力はシェーダ側)
 * を担う。DESIGN_V2.md「神の御業」節に準拠。
 */
import {
  Divine,
  type DivineTool,
  type IDivine,
  ROLE_FOOD,
  SIG_H,
  SIG_W,
  type SimBuffers2,
  type SpawnRequest,
  type ViewTransform2,
  WORLD_H,
  WORLD_W,
} from "../contracts2";

// 神の手の大きさ(ワールド単位)。生態パラメータではないので UI から可変でよい。
const RADIUS_MIN = 10;
const RADIUS_MAX = 140;
// BLESS(恵み)のスポーン間隔(約20Hz)
const BLESS_INTERVAL = 1 / 20;
// ペイントのGPUアップロード間隔(ドラッグ中)
const FLUSH_INTERVAL = 0.15;
// BLESS: 1リクエストあたりの散布数と初期エネルギー
const BLESS_COUNT = 25;
const BLESS_ENERGY = 16;
// 1フレームで発行するスポーン要求の上限(バックログ暴走防止)
const MAX_SPAWNS_PER_FRAME = 8;

// 障壁テクスチャ(buffers2.ts の OBS_W/OBS_H と一致)
const OBS_W = 512;
const OBS_H = 288;
// 潮流テクスチャ(buffers2.ts で flowTex は SIG_W×SIG_H)
const FLOW_W = SIG_W; // 256
const FLOW_H = SIG_H; // 144

// ワールド → テクスチャ画素 の縮尺(x/y 等倍)
const OBS_SCALE = OBS_W / WORLD_W; //  512/1600 = 0.32
const FLOW_SCALE = FLOW_W / WORLD_W; // 256/1600 = 0.16

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** ドラッグでペイントするツール(障壁/消去/潮流) */
function isPaintTool(t: DivineTool): boolean {
  return t === Divine.BARRIER || t === Divine.ERASE || t === Divine.CURRENT;
}
/** 押下中に uniform へ力を通すツール(シェーダ側で作用) */
function isForceTool(t: DivineTool): boolean {
  return (
    t === Divine.SMITE ||
    t === Divine.BECKON ||
    t === Divine.REPEL ||
    t === Divine.MAELSTROM
  );
}

class DivineHand implements IDivine {
  private currentTool: DivineTool = Divine.OBSERVE;
  private radiusVal = 55;
  private strengthVal = 0.6;

  // ポインタ状態
  private pointerDown = false;
  private activePointerId: number | null = null;
  // 直近のマウス位置(ワールド座標)。カーソルリング等に常時使用。
  private mouseX = WORLD_W * 0.5;
  private mouseY = WORLD_H * 0.5;
  // 直前にペイントした位置(セグメント補間の始点)
  private lastX = WORLD_W * 0.5;
  private lastY = WORLD_H * 0.5;
  // CURRENT の直近方向(移動量が微小なとき再利用)
  private flowDirX = 1;
  private flowDirY = 0;

  // タイマー(秒)
  private blessAccum = 0;
  private flushAccum = 0;

  // オフスクリーンキャンバス
  private readonly obs: OffscreenCanvas;
  private readonly obsCtx: OffscreenCanvasRenderingContext2D;
  private readonly flow: OffscreenCanvas;
  private readonly flowCtx: OffscreenCanvasRenderingContext2D;
  private obstacleDirty = false;
  private flowDirty = false;
  // r8unorm アップロード用の再利用バッファ
  private readonly obsBytes = new Uint8Array(OBS_W * OBS_H);

  // interaction uniform(32B): f32×8 と u32 の同一バッファビュー。
  //   [0]=mouse.x(world) [1]=mouse.y(world) [2]=radius [3]=strength
  //   u32[4]=tool u32[5]=isDown [6][7]=pad
  private readonly uni = new Float32Array(8);
  private readonly uniU32 = new Uint32Array(this.uni.buffer);

  // スポーン要求の一時配列(呼び出し側へ返す)
  private readonly spawnScratch: SpawnRequest[] = [];

  constructor(
    private readonly device: GPUDevice,
    private readonly buffers: SimBuffers2,
    private readonly canvas: HTMLCanvasElement,
    private readonly view: ViewTransform2,
  ) {
    this.obs = new OffscreenCanvas(OBS_W, OBS_H);
    this.flow = new OffscreenCanvas(FLOW_W, FLOW_H);
    const oc = this.obs.getContext("2d", { willReadFrequently: true });
    const fc = this.flow.getContext("2d", { willReadFrequently: true });
    if (!oc || !fc) {
      throw new Error("2D コンテキストの取得に失敗しました");
    }
    this.obsCtx = oc;
    this.flowCtx = fc;
    // flow は「中立(dir=0, strength=0)」= (128,128,0) で初期化。
    // 未塗りの領域が誤った流向にならないよう不透明で埋める。
    this.fillFlowNeutral();
    // obstacle は透明のまま(未塗り=障壁なし)。

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  // ------- IDivine ゲッタ ----------------------------------------------
  get tool(): DivineTool {
    return this.currentTool;
  }
  get radius(): number {
    return this.radiusVal;
  }
  get strength(): number {
    return this.strengthVal;
  }

  setTool(t: DivineTool): void {
    if (t === this.currentTool) return;
    // ツール切替時はドラッグ状態をリセット(進行中の塗りは確定してから)。
    if (this.pointerDown) this.endDrag();
    this.currentTool = t;
  }
  setRadius(r: number): void {
    this.radiusVal = clamp(r, RADIUS_MIN, RADIUS_MAX);
  }
  setStrength(s: number): void {
    this.strengthVal = clamp(s, 0, 1);
  }

  // ------- 毎フレーム更新 ---------------------------------------------
  update(dt: number): SpawnRequest[] {
    // uniform 更新: mouse は常時。isDown は OBSERVE 以外かつドラッグ中のみ 1。
    const down =
      this.pointerDown && this.currentTool !== Divine.OBSERVE ? 1 : 0;
    this.uni[0] = this.mouseX;
    this.uni[1] = this.mouseY;
    this.uni[2] = this.radiusVal;
    this.uni[3] = this.strengthVal;
    this.uniU32[4] = this.currentTool >>> 0;
    this.uniU32[5] = down;
    this.uni[6] = 0;
    this.uni[7] = 0;
    this.device.queue.writeBuffer(this.buffers.interaction, 0, this.uni);

    // BLESS(恵み): ドラッグ中は約20Hzで食料スポーンを発行。
    this.spawnScratch.length = 0;
    if (this.currentTool === Divine.BLESS && this.pointerDown) {
      this.blessAccum += dt;
      let guard = 0;
      while (
        this.blessAccum >= BLESS_INTERVAL &&
        guard < MAX_SPAWNS_PER_FRAME
      ) {
        this.blessAccum -= BLESS_INTERVAL;
        guard++;
        this.spawnScratch.push({
          x: this.mouseX,
          y: this.mouseY,
          role: ROLE_FOOD,
          count: BLESS_COUNT,
          spread: this.radiusVal,
          energy: BLESS_ENERGY,
        });
      }
      // バックログはためない
      if (this.blessAccum > BLESS_INTERVAL) this.blessAccum = BLESS_INTERVAL;
    }

    // ペイント系: ドラッグ中は 150ms ごとにGPUへ反映。
    if (this.pointerDown && isPaintTool(this.currentTool)) {
      this.flushAccum += dt;
      if (this.flushAccum >= FLUSH_INTERVAL) {
        this.flushAccum = 0;
        this.flushDirty();
      }
    }

    return this.spawnScratch;
  }

  clearPaint(): void {
    // 障壁キャンバスを全消去 → 障壁テクスチャをゼロで上書き。
    this.obsCtx.clearRect(0, 0, OBS_W, OBS_H);
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
    if (this.currentTool === Divine.OBSERVE) return; // 観察はドラッグ操作なし

    try {
      this.canvas.setPointerCapture(e.pointerId);
      this.activePointerId = e.pointerId;
    } catch {
      this.activePointerId = null;
    }
    this.pointerDown = true;
    this.blessAccum = BLESS_INTERVAL; // 押下直後に1回まく
    this.flushAccum = 0;
    e.preventDefault();

    if (this.currentTool === Divine.BARRIER || this.currentTool === Divine.ERASE) {
      this.stampObstacle(wx, wy);
      this.obstacleDirty = true;
    }
    // CURRENT は移動が生じてから方向を確定する。
    // SMITE/BECKON/REPEL/MAELSTROM は uniform の isDown で作用(ここでは何もしない)。
  };

  private onPointerMove = (e: PointerEvent): void => {
    const [wx, wy] = this.view.clientToWorld(e.clientX, e.clientY);
    this.mouseX = wx;
    this.mouseY = wy;
    if (!this.pointerDown) return;
    if (isPaintTool(this.currentTool)) {
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
    // 上スクロールで神の手を広げ、下スクロールで縮める。
    const dir = e.deltaY > 0 ? -1 : 1;
    this.setRadius(this.radiusVal + dir * 6);
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
    this.blessAccum = 0;
    this.flushAccum = 0;
    // 溜まっている塗りを最終アップロード。
    this.flushDirty();
  }

  /** from→to のワールド区間を等間隔にサンプリングして円ブラシを重ね押しする。 */
  private paintSegment(ax: number, ay: number, bx: number, by: number): void {
    const dxw = bx - ax;
    const dyw = by - ay;
    const dist = Math.hypot(dxw, dyw);
    const step = Math.max(2, this.radiusVal * 0.25);
    const n = Math.max(1, Math.ceil(dist / step));

    if (this.currentTool === Divine.CURRENT) {
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
      // BARRIER / ERASE
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        this.stampObstacle(ax + dxw * t, ay + dyw * t);
      }
      this.obstacleDirty = true;
    }
  }

  /** 障壁/消去の円ブラシ1押し。ERASE は destination-out。 */
  private stampObstacle(wx: number, wy: number): void {
    const tx = wx * OBS_SCALE;
    const ty = wy * OBS_SCALE;
    const r = Math.max(1, this.radiusVal * OBS_SCALE);
    const ctx = this.obsCtx;
    ctx.save();
    const g = ctx.createRadialGradient(tx, ty, 0, tx, ty, r);
    if (this.currentTool === Divine.ERASE) {
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

  /** 潮流の円ブラシ1押し。方向 dir を b=strength とともに半透明で lerp 合成。 */
  private stampFlow(wx: number, wy: number, dirX: number, dirY: number): void {
    const tx = wx * FLOW_SCALE;
    const ty = wy * FLOW_SCALE;
    const r = Math.max(1, this.radiusVal * FLOW_SCALE);
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
    const img = this.obsCtx.getImageData(0, 0, OBS_W, OBS_H);
    const src = img.data;
    const out = this.obsBytes;
    // destination-out 消去はアルファのみを削るため、
    // 障壁の濃度はアルファチャンネルから取り出す(白ブラシなので R も同値)。
    for (let i = 0; i < out.length; i++) {
      out[i] = src[i * 4 + 3];
    }
    this.device.queue.writeTexture(
      { texture: this.buffers.obstacleTex },
      out,
      { bytesPerRow: OBS_W },
      [OBS_W, OBS_H],
    );
  }

  private uploadFlow(): void {
    const img = this.flowCtx.getImageData(0, 0, FLOW_W, FLOW_H);
    const data = new Uint8Array(
      img.data.buffer,
      img.data.byteOffset,
      img.data.byteLength,
    );
    this.device.queue.writeTexture(
      { texture: this.buffers.flowTex },
      data,
      { bytesPerRow: FLOW_W * 4 },
      [FLOW_W, FLOW_H],
    );
  }

  private fillFlowNeutral(): void {
    const ctx = this.flowCtx;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgb(128,128,0)";
    ctx.fillRect(0, 0, FLOW_W, FLOW_H);
    ctx.restore();
  }
}

export function createDivine(
  device: GPUDevice,
  buffers: SimBuffers2,
  canvas: HTMLCanvasElement,
  view: ViewTransform2,
): IDivine {
  return new DivineHand(device, buffers, canvas, view);
}

/**
 * v2 エントリポイント / 統合(所有: Fable)。
 * 『神の観察』の全モジュールを配線しメインループを回す。
 */
import {
  type GodController,
  type IChronicler,
  type IDivine,
  type IObservatory,
  type IRenderer2,
  type ISimulation2,
  type WorldConfig,
  Divine,
  type DivineTool,
} from "./contracts2";
import { createSimBuffers2 } from "./buffers2";
import { createViewTransform2 } from "./coords2";
import { defaultConfig } from "./contracts2";
import { createSimulation2 } from "./sim2/simulation2";
import { createRenderer2 } from "./render2/renderer2";
import { createDivine } from "./interaction2/divine";
import { createSoundscape2 } from "./audio2/soundscape2";
import { createObservatory } from "./ui2/observatory";
import { createChronicler } from "./chronicle2/chronicle";
import { GENESIS, TEXT } from "./content2/index";

const bootEl = () => document.getElementById("boot")!;
const bootMsg = () => document.getElementById("boot-msg")!;

function fail(message: string): void {
  bootMsg().textContent = message;
  bootEl().classList.remove("hidden");
}

async function boot(): Promise<void> {
  if (!navigator.gpu) {
    fail(TEXT.webgpuUnsupported + "\n" + TEXT.webgpuHint);
    return;
  }
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "high-performance",
  });
  if (!adapter) {
    fail("GPUアダプタを取得できませんでした。");
    return;
  }
  // 神経シミュは1バインドグループで12ストレージバッファを使う(既定上限8を超える)。
  // アダプタが許す範囲で上限を引き上げて要求する。
  const al = adapter.limits;
  const wantStorageBuffers = 12;
  if (al.maxStorageBuffersPerShaderStage < wantStorageBuffers) {
    fail(
      "このGPUは必要なストレージバッファ数に対応していません。\nChrome / Edge の最新版でお試しください。",
    );
    return;
  }
  const device = await adapter.requestDevice({
    requiredLimits: {
      maxStorageBuffersPerShaderStage: Math.min(
        16,
        al.maxStorageBuffersPerShaderStage,
      ),
    },
  });
  device.lost.then((info) => {
    if (info.reason !== "destroyed") {
      fail("GPUデバイスが失われました。再読み込みしてください。");
    }
  });

  const canvas = document.getElementById("gl") as HTMLCanvasElement;
  canvas.style.cursor = "crosshair";
  const ctx = canvas.getContext("webgpu");
  if (!ctx) {
    fail("WebGPU コンテキストを取得できませんでした。");
    return;
  }
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: "opaque" });

  // ---- モジュール生成 ----
  const buffers = createSimBuffers2(device);
  const view = createViewTransform2(canvas);
  const sim: ISimulation2 = createSimulation2(device, buffers);
  const renderer: IRenderer2 = createRenderer2(device, format, buffers, canvas);
  const divine: IDivine = createDivine(device, buffers, canvas, view);
  const audio = createSoundscape2();
  const chronicler: IChronicler = createChronicler();

  const cfg: WorldConfig = defaultConfig();
  let quality: 0 | 1 | 2 = 1;
  sim.reset(GENESIS);
  chronicler.reset();

  let ui: IObservatory;
  const controller: GodController = {
    getConfig: () => cfg,
    setSpeed: (m) => (cfg.speed = Math.min(4, Math.max(0.25, m))),
    togglePause: () => (cfg.paused = !cfg.paused),
    toggleCivilization: () => (cfg.civilization = !cfg.civilization),
    genesis() {
      sim.reset(GENESIS);
      divine.clearPaint();
      chronicler.reset();
    },
    setTool: (t: DivineTool) => {
      divine.setTool(t);
      ui?.syncTool(t);
    },
    setRadius: (r) => divine.setRadius(r),
    setStrength: (s) => divine.setStrength(s),
    setQuality: (q) => {
      quality = q;
      renderer.setQuality(q);
    },
    getQuality: () => quality,
    toggleSound: () => audio.toggle(),
    setVolume: (v) => audio.setVolume(v),
  };
  ui = createObservatory(document.getElementById("ui-root")!, controller);
  divine.setTool(Divine.OBSERVE);
  renderer.setQuality(quality);

  (globalThis as Record<string, unknown>).__dev = {
    device,
    buffers,
    sim,
    getConfig: () => cfg,
  };

  // ---- リサイズ + アダプティブ品質 ----
  let dpr = Math.min(devicePixelRatio || 1, 1.0);
  let frameCostEma = 16;
  const applySize = () => {
    const cssW = Math.max(1, canvas.clientWidth);
    const cssH = Math.max(1, canvas.clientHeight);
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      renderer.resize(cssW, cssH, dpr);
    }
  };
  applySize();
  addEventListener("resize", applySize);

  let qCooldown = 0;
  const adaptQuality = (dt: number) => {
    frameCostEma = frameCostEma * 0.8 + dt * 1000 * 0.2;
    qCooldown -= dt;
    if (qCooldown > 0) return;
    const floor = 0.6;
    const cap = Math.min(devicePixelRatio || 1, 1.5);
    if (frameCostEma > 32 && dpr > floor) {
      dpr = Math.max(floor, dpr - 0.25);
      applySize();
      qCooldown = 3;
    } else if (frameCostEma < 13 && dpr < cap) {
      dpr = Math.min(cap, dpr + 0.25);
      applySize();
      qCooldown = 5;
    }
  };

  // ---- メインループ ----
  const FIXED = 1 / 60;
  let last = performance.now();
  let time = 0;
  let fpsEma = 60;
  let booted = false;

  const frame = (nowMs: number) => {
    try {
    const rawDt = Math.min(0.1, (nowMs - last) / 1000);
    last = nowMs;
    time += rawDt;
    fpsEma = fpsEma * 0.85 + (1 / Math.max(rawDt, 1e-4)) * 0.15;

    const spawns = divine.update(rawDt);
    if (spawns.length > 0) sim.requestSpawns(spawns);
    sim.setConfig(cfg);

    const encoder = device.createCommandEncoder();
    if (!cfg.paused) {
      const substeps = cfg.speed > 2 ? 2 : 1;
      const dtPer = (FIXED * cfg.speed) / substeps;
      for (let i = 0; i < substeps; i++) sim.tick(encoder, dtPer);
    }
    renderer.render(
      encoder,
      ctx.getCurrentTexture().createView(),
      sim.currentCreatures,
      sim.currentSignal,
      sim.structureGrid,
      time,
      rawDt,
    );
    device.queue.submit([encoder.finish()]);
    sim.afterSubmit();

    const events = chronicler.observe(sim.stats);
    if (events.length > 0) ui.pushEvents(events);
    ui.update(sim.stats, fpsEma);
    audio.update(sim.stats, rawDt);
    adaptQuality(rawDt);

    if (!booted && time > 0.5) {
      booted = true;
      bootEl().classList.add("hidden");
    }
    } catch (e) {
      // 1フレームの失敗でループ全体を止めないよう握りつぶしログ
      console.error("frame error:", e);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot().catch((e) => {
  console.error(e);
  fail(`起動に失敗しました。\n${e instanceof Error ? e.message : String(e)}`);
});

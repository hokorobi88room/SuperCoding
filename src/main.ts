/**
 * エントリポイント / 統合(所有: 統合担当)。
 * 全モジュールを配線し、メインループを回す。
 */
import {
  type ISimulation,
  type IRenderer,
  type IInteraction,
  type ISoundscape,
  type IUI,
  type SimParams,
  type ToolId,
  type UIController,
  Tool,
  type SpeciesParams,
} from "./contracts";
import { createSimBuffers } from "./gpu/buffers";
import { createViewTransform } from "./gpu/coords";
import { createSimulation } from "./sim/simulation";
import { createRenderer } from "./render/renderer";
import { createInteraction } from "./interaction/tools";
import { createSoundscape } from "./audio/soundscape";
import { createUI } from "./ui/panel";
import { PRESETS, presetParams } from "./content/index";

const bootEl = () => document.getElementById("boot")!;
const bootMsg = () => document.getElementById("boot-msg")!;

function fail(message: string): void {
  bootMsg().textContent = message;
  bootEl().classList.remove("hidden");
}

async function boot(): Promise<void> {
  if (!navigator.gpu) {
    fail(
      "お使いのブラウザは WebGPU に対応していません。\nChrome / Edge の最新版でお試しください。",
    );
    return;
  }
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "high-performance",
  });
  if (!adapter) {
    fail("GPUアダプタを取得できませんでした。");
    return;
  }
  const device = await adapter.requestDevice();
  device.lost.then((info) => {
    if (info.reason !== "destroyed") {
      fail("GPUデバイスが失われました。ページを再読み込みしてください。");
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

  // ---- モジュール生成 -------------------------------------------------
  const buffers = createSimBuffers(device);
  const view = createViewTransform(canvas);
  const sim: ISimulation = createSimulation(device, buffers);
  const renderer: IRenderer = createRenderer(device, format, buffers, canvas);
  const interaction: IInteraction = createInteraction(
    device,
    buffers,
    canvas,
    view,
  );
  const audio: ISoundscape = createSoundscape();

  // 初期プリセット: 捕食者と被食者が両方いるものを優先
  let currentPreset =
    PRESETS.find((p) => p.seed.predators > 0 && p.seed.prey > 0) ?? PRESETS[0];
  let params: SimParams = presetParams(currentPreset);
  sim.reset(currentPreset.seed);

  // ---- UIコントローラ -------------------------------------------------
  let ui: IUI;
  const controller: UIController = {
    getParams: () => params,
    setSpeciesParam(speciesIdx: number, key: keyof SpeciesParams, value: number) {
      params.species[speciesIdx][key] = value;
    },
    setSpeed(mul: number) {
      params.speed = Math.min(4, Math.max(0.25, mul));
    },
    togglePause() {
      params.paused = !params.paused;
      return params.paused;
    },
    applyPreset(presetId: string) {
      const p = PRESETS.find((x) => x.id === presetId);
      if (!p) return;
      currentPreset = p;
      params = presetParams(p);
      interaction.clearPaint();
      sim.reset(p.seed);
    },
    resetWorld() {
      sim.reset(currentPreset.seed);
    },
    setTool(t: ToolId) {
      interaction.setTool(t);
      ui?.syncToolSelection(t);
    },
    setBrushRadius: (r) => interaction.setBrushRadius(r),
    setStrength: (s) => interaction.setStrength(s),
    toggleSound: () => audio.toggle(),
    setVolume: (v) => audio.setVolume(v),
  };
  ui = createUI(document.getElementById("ui-root")!, controller);
  interaction.setTool(Tool.NONE);

  // デバッグフック(開発時のGPU状態検査用)
  (globalThis as Record<string, unknown>).__ps = {
    device,
    buffers,
    sim,
    getParams: () => params,
  };

  // ---- リサイズ + アダプティブ品質 ------------------------------------
  // 内蔵GPUを想定して控えめに開始(余裕があればadaptQualityが引き上げる)
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
      // renderer.resize は CSS論理サイズ + dpr を受け取り内部で乗算する
      renderer.resize(cssW, cssH, dpr);
    }
  };
  applySize();
  addEventListener("resize", applySize);

  let qualityCooldown = 0;
  const adaptQuality = (dt: number) => {
    // 低fps時にも数秒で反応するよう速いEMA
    frameCostEma = frameCostEma * 0.8 + dt * 1000 * 0.2;
    qualityCooldown -= dt;
    if (qualityCooldown > 0) return;
    const floor = 0.6;
    const cap = Math.min(devicePixelRatio || 1, 1.5);
    if (frameCostEma > 30 && dpr > floor) {
      dpr = Math.max(floor, dpr - 0.25);
      applySize();
      qualityCooldown = 3;
    } else if (frameCostEma < 13 && dpr < cap) {
      dpr = Math.min(cap, dpr + 0.25);
      applySize();
      qualityCooldown = 5;
    }
  };

  // ---- メインループ ---------------------------------------------------
  const FIXED = 1 / 60;
  let last = performance.now();
  let time = 0;
  let fpsEma = 60;
  let booted = false;

  const frame = (nowMs: number) => {
    const rawDt = Math.min(0.1, (nowMs - last) / 1000);
    last = nowMs;
    time += rawDt;
    fpsEma = fpsEma * 0.85 + (1 / Math.max(rawDt, 1e-4)) * 0.15;

    const spawns = interaction.update(rawDt);
    if (spawns.length > 0) sim.requestSpawns(spawns);
    sim.setParams(params);

    const encoder = device.createCommandEncoder();
    if (!params.paused) {
      const substeps = params.speed > 2 ? 2 : 1;
      const dtPer = (FIXED * params.speed) / substeps;
      for (let i = 0; i < substeps; i++) sim.tick(encoder, dtPer);
    }
    renderer.render(
      encoder,
      ctx.getCurrentTexture().createView(),
      sim.currentAgents,
      time,
      rawDt,
    );
    device.queue.submit([encoder.finish()]);
    sim.afterSubmit();

    ui.update(sim.stats, fpsEma);
    audio.update(sim.stats, rawDt);
    adaptQuality(rawDt);

    if (!booted && time > 0.5) {
      booted = true;
      bootEl().classList.add("hidden");
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot().catch((e) => {
  console.error(e);
  fail(`起動に失敗しました。\n${e instanceof Error ? e.message : String(e)}`);
});

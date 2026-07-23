/**
 * UIパネル本体。素のDOMで HUD / ツールバー / 右パネル / 個体数チャートを生成し、
 * UIController 経由でシミュレーションを操作する。所有: ui 担当。
 */
import {
  type IUI,
  PARAM_META,
  type SimStats,
  type SpeciesParams,
  Tool,
  type ToolId,
  type UIController,
} from "../contracts";
import { PRESETS, SPECIES, TEXT } from "../content/index";
import { clamp, el, fmtByStep, hdrToCss } from "./dom";
import { createChart } from "./chart";

// ツールの並び順(NONE含む全9種)
const TOOL_ORDER: ToolId[] = [
  Tool.NONE,
  Tool.FOOD,
  Tool.ATTRACT,
  Tool.REPEL,
  Tool.VORTEX,
  Tool.FEAR,
  Tool.OBSTACLE,
  Tool.ERASE,
  Tool.CURRENT,
];

// ツールの絵文字アイコン
const TOOL_ICON: Record<number, string> = {
  [Tool.NONE]: "✋",
  [Tool.FOOD]: "🌱",
  [Tool.ATTRACT]: "🧲",
  [Tool.REPEL]: "💨",
  [Tool.VORTEX]: "🌀",
  [Tool.FEAR]: "👻",
  [Tool.OBSTACLE]: "🪨",
  [Tool.ERASE]: "🧽",
  [Tool.CURRENT]: "🌊",
};

const BRUSH_MIN = 10;
const BRUSH_MAX = 120;
const BRUSH_DEFAULT = 45;
const STRENGTH_DEFAULT = 0.6;
const VOLUME_DEFAULT = 0.7;
const DOM_INTERVAL = 250; // HUD等のDOM更新間引き(ms)

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${String(ss).padStart(2, "0")}`;
}

export function createUI(root: HTMLElement, controller: UIController): IUI {
  // --- 状態 ---
  let activeSpecies = 0;
  let currentTool: ToolId = Tool.NONE;
  let lastDom = 0;
  const everSeen = [false, false, false]; // 一度でも生存を確認したか
  const extinctFlag = [false, false, false]; // 絶滅トースト発火済みか

  // 種の表示色・名前
  const speciesColors: string[] = [0, 1, 2].map((i) =>
    hdrToCss(SPECIES[i].baseColor)
  );
  const speciesNames: string[] = [0, 1, 2].map((i) => SPECIES[i].name);

  // ===================================================================
  // 左上 HUD
  // ===================================================================
  const hudFps = el("span", { class: "ps-stat-val", text: "0" });
  const hudTime = el("span", { class: "ps-stat-val", text: "0:00" });
  const hudPops: HTMLSpanElement[] = [];

  const hudSpeciesRows = [0, 1, 2].map((sp) => {
    const popVal = el("span", { class: "ps-sppop", text: "0" });
    hudPops.push(popVal);
    return el(
      "div",
      { class: "ps-sprow" },
      el("span", {
        class: "ps-dot",
        attrs: { style: `background:${speciesColors[sp]}` },
      }),
      el("span", { class: "ps-spname", text: speciesNames[sp] }),
      popVal,
    );
  });

  const hud = el(
    "div",
    { class: "ps-panel ps-hud" },
    el(
      "div",
      { class: "ps-hud-head" },
      el("div", { class: "ps-hud-title", text: TEXT.title }),
      el("div", { class: "ps-hud-sub", text: TEXT.subtitle }),
    ),
    el(
      "div",
      { class: "ps-hud-stats" },
      el(
        "div",
        { class: "ps-stat" },
        el("span", { class: "ps-stat-key", text: TEXT.fps }),
        hudFps,
      ),
      el(
        "div",
        { class: "ps-stat" },
        el("span", { class: "ps-stat-key", text: "⏱" }),
        hudTime,
      ),
    ),
    el(
      "div",
      { class: "ps-hud-species" },
      el("div", { class: "ps-mini-title", text: TEXT.population }),
      ...hudSpeciesRows,
    ),
  );

  // ===================================================================
  // 左端 縦ツールバー
  // ===================================================================
  const toolButtons = new Map<number, HTMLButtonElement>();

  function setActiveTool(t: ToolId): void {
    currentTool = t;
    for (const [id, btn] of toolButtons) {
      btn.classList.toggle("active", id === t);
    }
  }

  const toolBtnEls = TOOL_ORDER.map((t) => {
    const btn = el("button", {
      class: "ps-tool",
      title: `${TEXT.toolNames[t]} — ${TEXT.toolHints[t]}`,
      text: TOOL_ICON[t] ?? "?",
      onclick: () => {
        controller.setTool(t);
        setActiveTool(t);
      },
    });
    toolButtons.set(t, btn);
    return btn;
  });

  // ブラシ半径スライダー
  const brushInput = el("input", {
    class: "ps-range",
    type: "range",
    min: BRUSH_MIN,
    max: BRUSH_MAX,
    step: 1,
    value: BRUSH_DEFAULT,
  }) as HTMLInputElement;
  const brushVal = el("span", { class: "ps-slider-val", text: String(BRUSH_DEFAULT) });
  function commitBrush(v: number): void {
    v = clamp(Math.round(v), BRUSH_MIN, BRUSH_MAX);
    brushInput.value = String(v);
    brushVal.textContent = String(v);
    controller.setBrushRadius(v);
  }
  brushInput.addEventListener("input", () => commitBrush(+brushInput.value));

  // 強度スライダー
  const strengthInput = el("input", {
    class: "ps-range",
    type: "range",
    min: 0,
    max: 1,
    step: 0.01,
    value: STRENGTH_DEFAULT,
  }) as HTMLInputElement;
  const strengthVal = el("span", {
    class: "ps-slider-val",
    text: `${Math.round(STRENGTH_DEFAULT * 100)}%`,
  });
  function commitStrength(v: number): void {
    v = clamp(v, 0, 1);
    strengthInput.value = String(v);
    strengthVal.textContent = `${Math.round(v * 100)}%`;
    controller.setStrength(v);
  }
  strengthInput.addEventListener("input", () => commitStrength(+strengthInput.value));

  const toolbar = el(
    "div",
    { class: "ps-panel ps-toolbar" },
    el("div", { class: "ps-tool-grid" }, ...toolBtnEls),
    el("div", { class: "ps-tool-sep" }),
    el(
      "div",
      { class: "ps-slider-block" },
      el(
        "div",
        { class: "ps-slider-head" },
        el("span", { class: "ps-slider-label", text: TEXT.brushRadius }),
        brushVal,
      ),
      brushInput,
    ),
    el(
      "div",
      { class: "ps-slider-block" },
      el(
        "div",
        { class: "ps-slider-head" },
        el("span", { class: "ps-slider-label", text: TEXT.brushStrength }),
        strengthVal,
      ),
      strengthInput,
    ),
  );

  // ===================================================================
  // 右パネル
  // ===================================================================
  // 種タブ
  const tabButtons: HTMLButtonElement[] = [];
  const tabs = el(
    "div",
    { class: "ps-tabs" },
    ...[0, 1, 2].map((sp) => {
      const btn = el("button", {
        class: "ps-tab",
        text: TEXT.speciesTab[sp],
        onclick: () => selectSpecies(sp),
      });
      btn.style.setProperty("--tab-col", speciesColors[sp]);
      tabButtons.push(btn);
      return btn;
    }),
  );

  const paramsContainer = el("div", { class: "ps-params" });

  // 遺伝子表示(平均遺伝子バー)
  const geneFills: HTMLDivElement[] = [];
  const geneVals: HTMLSpanElement[] = [];
  const geneRows = [0, 1, 2, 3].map((g) => {
    const fill = el("div", { class: "ps-gene-fill" });
    const val = el("span", { class: "ps-gene-val", text: "–" });
    geneFills.push(fill);
    geneVals.push(val);
    return el(
      "div",
      { class: "ps-gene-row" },
      el("span", { class: "ps-gene-label", text: TEXT.geneNames[g] }),
      el("div", { class: "ps-gene-bar" }, fill),
      val,
    );
  });
  const geneSection = el(
    "div",
    { class: "ps-genes" },
    el("div", { class: "ps-section-title", text: TEXT.generationInfo }),
    ...geneRows,
  );

  function selectSpecies(sp: number): void {
    activeSpecies = sp;
    tabButtons.forEach((b, i) => b.classList.toggle("active", i === sp));
    buildSpeciesSliders(sp);
  }

  function buildSpeciesSliders(sp: number): void {
    paramsContainer.replaceChildren();
    const p = controller.getParams();
    const spec = p.species[sp] as SpeciesParams;
    for (const meta of PARAM_META) {
      if (meta.onlySpecies && !meta.onlySpecies.includes(sp)) continue;
      const cur = spec[meta.key];
      const valSpan = el("span", {
        class: "ps-pval",
        text: fmtByStep(cur, meta.step),
      });
      const input = el("input", {
        class: "ps-range",
        type: "range",
        min: meta.min,
        max: meta.max,
        step: meta.step,
        value: cur,
      }) as HTMLInputElement;
      input.addEventListener("input", () => {
        const v = +input.value;
        valSpan.textContent = fmtByStep(v, meta.step);
        controller.setSpeciesParam(sp, meta.key, v);
      });
      paramsContainer.append(
        el(
          "div",
          { class: "ps-prow" },
          el(
            "div",
            { class: "ps-prow-head" },
            el("span", {
              class: "ps-plabel",
              text: TEXT.paramLabels[meta.key] ?? meta.key,
            }),
            valSpan,
          ),
          input,
        ),
      );
    }
  }

  // プリセットカード
  const presetCards = el(
    "div",
    { class: "ps-presets" },
    ...PRESETS.map((preset: (typeof PRESETS)[number]) =>
      el(
        "button",
        {
          class: "ps-preset",
          onclick: () => {
            controller.applyPreset(preset.id);
            handleReset();
          },
        },
        el("span", { class: "ps-preset-name", text: preset.name }),
        el("span", { class: "ps-preset-desc", text: preset.description }),
      )
    ),
  );

  // 下部コントロール(速度・一時停止・リセット・サウンド・音量)
  const speedInput = el("input", {
    class: "ps-range",
    type: "range",
    min: 0.25,
    max: 4,
    step: 0.05,
    value: 1,
  }) as HTMLInputElement;
  const speedVal = el("span", { class: "ps-pval", text: "×1.00" });
  function commitSpeed(v: number): void {
    v = clamp(v, 0.25, 4);
    speedInput.value = String(v);
    speedVal.textContent = `×${v.toFixed(2)}`;
    controller.setSpeed(v);
  }
  speedInput.addEventListener("input", () => commitSpeed(+speedInput.value));

  const pauseBtn = el("button", {
    class: "ps-btn ps-btn-wide",
    text: TEXT.pause,
    onclick: () => togglePauseUI(),
  });
  function refreshPauseButton(paused: boolean): void {
    pauseBtn.textContent = paused ? TEXT.resume : TEXT.pause;
    pauseBtn.classList.toggle("paused", paused);
  }
  function togglePauseUI(): void {
    refreshPauseButton(controller.togglePause());
  }

  const resetBtn = el("button", {
    class: "ps-btn ps-btn-danger",
    text: TEXT.reset,
    onclick: () => {
      controller.resetWorld();
      handleReset();
    },
  });

  const soundBtn = el("button", {
    class: "ps-btn ps-btn-wide",
    text: TEXT.soundOff,
    onclick: () => {
      void controller.toggleSound().then((on) => refreshSound(on));
    },
  });
  function refreshSound(on: boolean): void {
    soundBtn.textContent = on ? TEXT.soundOn : TEXT.soundOff;
    soundBtn.classList.toggle("active", on);
  }

  const volumeInput = el("input", {
    class: "ps-range",
    type: "range",
    min: 0,
    max: 1,
    step: 0.01,
    value: VOLUME_DEFAULT,
  }) as HTMLInputElement;
  const volumeVal = el("span", {
    class: "ps-pval",
    text: `${Math.round(VOLUME_DEFAULT * 100)}%`,
  });
  volumeInput.addEventListener("input", () => {
    const v = clamp(+volumeInput.value, 0, 1);
    volumeVal.textContent = `${Math.round(v * 100)}%`;
    controller.setVolume(v);
  });

  const controls = el(
    "div",
    { class: "ps-controls" },
    el(
      "div",
      { class: "ps-prow" },
      el(
        "div",
        { class: "ps-prow-head" },
        el("span", { class: "ps-plabel", text: TEXT.speed }),
        speedVal,
      ),
      speedInput,
    ),
    el("div", { class: "ps-btn-row" }, pauseBtn, resetBtn),
    el(
      "div",
      { class: "ps-prow" },
      el(
        "div",
        { class: "ps-prow-head" },
        el("span", { class: "ps-plabel", text: TEXT.volume }),
        volumeVal,
      ),
      volumeInput,
    ),
    el("div", { class: "ps-btn-row" }, soundBtn),
  );

  // 折りたたみ
  const collapseBtn = el("button", {
    class: "ps-collapse",
    title: "パネル開閉",
    text: "›",
  });
  const sideBody = el(
    "div",
    { class: "ps-side-body" },
    tabs,
    el("div", { class: "ps-section-title", text: TEXT.paramSection }),
    paramsContainer,
    geneSection,
    el("div", { class: "ps-section-title", text: TEXT.presetSection }),
    presetCards,
    el("div", { class: "ps-divider" }),
    controls,
  );
  const sidePanel = el(
    "div",
    { class: "ps-panel ps-side" },
    el(
      "div",
      { class: "ps-side-head" },
      el("span", { class: "ps-side-title", text: TEXT.paramSection }),
      collapseBtn,
    ),
    sideBody,
  );
  collapseBtn.addEventListener("click", () => {
    const c = sidePanel.classList.toggle("collapsed");
    collapseBtn.textContent = c ? "‹" : "›";
  });

  // ===================================================================
  // 下部中央 個体数チャート
  // ===================================================================
  const chartCanvas = el("canvas", { class: "ps-chart-canvas" }) as HTMLCanvasElement;
  const chartPanel = el(
    "div",
    { class: "ps-panel ps-chart" },
    el(
      "div",
      { class: "ps-chart-head" },
      el("span", { class: "ps-mini-title", text: TEXT.statsSection }),
      el(
        "div",
        { class: "ps-chart-legend" },
        ...[0, 1, 2].map((sp) =>
          el(
            "span",
            { class: "ps-legend-item" },
            el("span", {
              class: "ps-dot",
              attrs: { style: `background:${speciesColors[sp]}` },
            }),
            el("span", { text: speciesNames[sp] }),
          )
        ),
      ),
    ),
    chartCanvas,
  );
  const chart = createChart(chartCanvas, speciesColors, speciesNames);
  const ro = new ResizeObserver(() => {
    chart.resize(chartCanvas.clientWidth, chartCanvas.clientHeight);
    chart.render();
  });
  ro.observe(chartCanvas);

  // ===================================================================
  // トースト(絶滅通知)
  // ===================================================================
  const toastLayer = el("div", { class: "ps-toast-layer" });
  function showToast(msg: string): void {
    const t = el("div", { class: "ps-toast", text: msg });
    toastLayer.append(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => {
      t.classList.remove("show");
      t.classList.add("hide");
      setTimeout(() => t.remove(), 600);
    }, 4200);
  }

  // ===================================================================
  // リセット系の共通処理
  // ===================================================================
  function handleReset(): void {
    chart.clear();
    for (let i = 0; i < 3; i++) {
      everSeen[i] = false;
      extinctFlag[i] = false;
    }
    refreshControls();
  }

  function refreshControls(): void {
    const p = controller.getParams();
    speedInput.value = String(p.speed);
    speedVal.textContent = `×${p.speed.toFixed(2)}`;
    refreshPauseButton(p.paused);
    buildSpeciesSliders(activeSpecies);
  }

  // ===================================================================
  // キーボードショートカット
  // ===================================================================
  function onKey(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "BUTTON" || tag === "TEXTAREA") return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.code === "Space") {
      e.preventDefault();
      togglePauseUI();
      return;
    }
    const k = e.key;
    if (k === "r" || k === "R") {
      controller.resetWorld();
      handleReset();
      return;
    }
    if (k === "[") {
      commitBrush(+brushInput.value - 10);
      return;
    }
    if (k === "]") {
      commitBrush(+brushInput.value + 10);
      return;
    }
    // 数字 1..9 → ツール
    if (k >= "1" && k <= "9") {
      const idx = k.charCodeAt(0) - 49; // '1' → 0
      if (idx < TOOL_ORDER.length) {
        const t = TOOL_ORDER[idx];
        controller.setTool(t);
        setActiveTool(t);
      }
    }
  }
  window.addEventListener("keydown", onKey);

  // ===================================================================
  // マウント & 初期化
  // ===================================================================
  root.append(hud, toolbar, sidePanel, chartPanel, toastLayer);

  setActiveTool(Tool.NONE);
  selectSpecies(0);
  commitBrush(BRUSH_DEFAULT);
  commitStrength(STRENGTH_DEFAULT);
  controller.setVolume(VOLUME_DEFAULT);
  refreshSound(false);
  refreshControls();

  // ===================================================================
  // 毎フレーム更新(DOMは250msに間引き / チャート追記は毎回)
  // ===================================================================
  function update(stats: SimStats, fps: number): void {
    chart.push(stats.simTime, stats.populations);

    const now = performance.now();
    if (now - lastDom < DOM_INTERVAL) return;
    lastDom = now;

    // HUD
    hudFps.textContent = String(Math.round(fps));
    hudTime.textContent = formatTime(stats.simTime);
    for (let sp = 0; sp < 3; sp++) {
      hudPops[sp].textContent = (stats.populations[sp] || 0).toLocaleString();
    }

    // 絶滅検知(藻以外)
    for (let sp = 0; sp < 3; sp++) {
      const pop = stats.populations[sp] || 0;
      if (pop > 0) {
        everSeen[sp] = true;
        extinctFlag[sp] = false;
      } else if (sp !== 0 && everSeen[sp] && !extinctFlag[sp]) {
        extinctFlag[sp] = true;
        showToast(TEXT.extinction.replace("{name}", speciesNames[sp]));
      }
    }

    // 平均遺伝子バー(選択中の種)
    const genes = stats.avgGenes[activeSpecies] || [];
    for (let g = 0; g < 4; g++) {
      const v = clamp(genes[g] ?? 0, 0, 1);
      geneFills[g].style.width = `${(v * 100).toFixed(0)}%`;
      geneVals[g].textContent = v > 0 ? v.toFixed(2) : "–";
    }

    chart.render();
  }

  function syncToolSelection(t: ToolId): void {
    setActiveTool(t);
  }

  return { update, syncToolSelection };
}

/**
 * 神視点UI(神託の観測所)。所有: ui 担当。
 * 素のDOMで荘厳な神託UIを組む。神は数値(生態パラメータ)を弄らない —
 * 御業ツールで介入し、形質・部族・年代記を観察する。
 *   - 左上   神託HUD(タイトル/FPS/世代/個体数/部族数)
 *   - 左端   御業パレット(Divine 全9種 + 神の手の半径/強度)
 *   - 右上   系譜パネル(平均形質バー + 部族の代表色。初期折りたたみ)
 *   - 下中央 年代記(創発イベントを時刻付きで流す)
 *   - 左下   設定(速度/停止/創世/文明/画質/音)
 *   - 中央   タイトル演出(起動・創世時に3秒フェード)
 */
import { Divine } from "../contracts2";
import type {
  ChronicleEvent,
  ChronicleKind,
  DivineTool,
  GodController,
  IObservatory,
  WorldStats,
} from "../contracts2";
import { TEXT, TRIBE_PALETTE } from "../content2/index";
import { clamp, el, formatClock, hdrToCss } from "./dom2";

// 御業ツールの並び(全9種)。数字キー 1..9 はこの順に対応。
const TOOL_ORDER: DivineTool[] = [
  Divine.OBSERVE,
  Divine.BLESS,
  Divine.SMITE,
  Divine.BECKON,
  Divine.REPEL,
  Divine.MAELSTROM,
  Divine.BARRIER,
  Divine.ERASE,
  Divine.CURRENT,
];

const TOOL_ICON: Record<number, string> = {
  [Divine.OBSERVE]: "◉",
  [Divine.BLESS]: "✿",
  [Divine.SMITE]: "↯",
  [Divine.BECKON]: "❈",
  [Divine.REPEL]: "❊",
  [Divine.MAELSTROM]: "❋",
  [Divine.BARRIER]: "⛰",
  [Divine.ERASE]: "✧",
  [Divine.CURRENT]: "≈",
};

// 年代記 kind ごとのアイコン(色は styles2.css の .ch-<kind>)。
const CH_ICON: Record<ChronicleKind, string> = {
  genesis: "✦",
  bloom: "❀",
  crash: "⚠",
  extinction: "☠",
  carnivore: "⚔",
  herbivore: "☘",
  tribe: "⬡",
  civilization: "⛩",
  divine: "✋",
};

const RADIUS_MIN = 10;
const RADIUS_MAX = 140;
const RADIUS_DEFAULT = 48;
const RADIUS_STEP = 8;
const STRENGTH_DEFAULT = 0.6;
const VOLUME_DEFAULT = 0.7;
const DOM_INTERVAL = 250; // HUD/形質バーのDOM更新間引き(ms)
const MAX_CHRONICLE = 8;

export function createObservatory(
  root: HTMLElement,
  controller: GodController,
): IObservatory {
  let currentTool: DivineTool = Divine.OBSERVE;
  let lastDom = 0;
  let paused = controller.getConfig().paused;

  // ===================================================================
  // 左上 神託HUD
  // ===================================================================
  const hudFps = el("span", { class: "ob-stat-v", text: "0" });
  const hudEpoch = el("span", { class: "ob-stat-v", text: "0" });
  const hudLife = el("span", { class: "ob-stat-v", text: "0" });
  const hudFood = el("span", { class: "ob-stat-v ob-food", text: "0" });
  const hudTribes = el("span", { class: "ob-stat-v", text: "0" });

  const statCell = (
    key: string,
    valEl: HTMLElement,
  ): HTMLElement =>
    el(
      "div",
      { class: "ob-stat" },
      el("span", { class: "ob-stat-k", text: key }),
      valEl,
    );

  const hud = el(
    "div",
    { class: "ob-panel ob-hud" },
    el("div", { class: "ob-title", text: TEXT.title }),
    el("div", { class: "ob-subtitle", text: TEXT.subtitle }),
    el(
      "div",
      { class: "ob-hud-grid" },
      statCell(TEXT.fps, hudFps),
      statCell(TEXT.epoch, hudEpoch),
      statCell(TEXT.creatureName, hudLife),
      statCell(TEXT.foodName, hudFood),
      statCell(TEXT.tribes, hudTribes),
    ),
  );

  // ===================================================================
  // 左端 御業パレット(縦)
  // ===================================================================
  const toolButtons = new Map<number, HTMLButtonElement>();

  function highlightTool(t: DivineTool): void {
    currentTool = t;
    for (const [id, btn] of toolButtons) {
      btn.classList.toggle("active", id === t);
    }
  }

  const toolBtns = TOOL_ORDER.map((t) => {
    const btn = el("button", {
      class: "ob-tool",
      title: `${TEXT.toolNames[t]} — ${TEXT.toolHints[t]}`,
      text: TOOL_ICON[t] ?? "?",
      onclick: () => controller.setTool(t),
    });
    toolButtons.set(t, btn);
    return btn;
  });

  // 神の手: 半径スライダー
  const radiusInput = el("input", {
    class: "ob-range",
    type: "range",
    min: RADIUS_MIN,
    max: RADIUS_MAX,
    step: 1,
    value: RADIUS_DEFAULT,
  }) as HTMLInputElement;
  const radiusVal = el("span", {
    class: "ob-range-v",
    text: String(RADIUS_DEFAULT),
  });
  function commitRadius(v: number): void {
    v = clamp(Math.round(v), RADIUS_MIN, RADIUS_MAX);
    radiusInput.value = String(v);
    radiusVal.textContent = String(v);
    controller.setRadius(v);
  }
  radiusInput.addEventListener("input", () => commitRadius(+radiusInput.value));

  // 神の手: 強度スライダー
  const strengthInput = el("input", {
    class: "ob-range",
    type: "range",
    min: 0,
    max: 1,
    step: 0.01,
    value: STRENGTH_DEFAULT,
  }) as HTMLInputElement;
  const strengthVal = el("span", {
    class: "ob-range-v",
    text: `${Math.round(STRENGTH_DEFAULT * 100)}%`,
  });
  function commitStrength(v: number): void {
    v = clamp(v, 0, 1);
    strengthInput.value = String(v);
    strengthVal.textContent = `${Math.round(v * 100)}%`;
    controller.setStrength(v);
  }
  strengthInput.addEventListener("input", () =>
    commitStrength(+strengthInput.value)
  );

  const rangeBlock = (
    label: string,
    valEl: HTMLElement,
    input: HTMLInputElement,
  ): HTMLElement =>
    el(
      "div",
      { class: "ob-range-block" },
      el(
        "div",
        { class: "ob-range-head" },
        el("span", { class: "ob-range-l", text: label }),
        valEl,
      ),
      input,
    );

  const palette = el(
    "div",
    { class: "ob-panel ob-palette" },
    el("div", { class: "ob-tool-grid" }, ...toolBtns),
    el("div", { class: "ob-sep" }),
    rangeBlock(TEXT.radius, radiusVal, radiusInput),
    rangeBlock(TEXT.strength, strengthVal, strengthInput),
  );

  // ===================================================================
  // 右上 系譜パネル(初期折りたたみ)
  // ===================================================================
  interface TraitDef {
    label: string;
    get: (s: WorldStats) => number;
    bipolar?: boolean;
  }
  const traitDefs: TraitDef[] = [
    {
      label: `${TEXT.dietPoles[0]} ⇄ ${TEXT.dietPoles[1]}`,
      get: (s) => s.avgDiet,
      bipolar: true,
    },
    { label: TEXT.traitNames.aggression, get: (s) => s.avgAggression },
    { label: TEXT.traitNames.social, get: (s) => s.avgSocial },
    { label: TEXT.traitNames.speed, get: (s) => s.avgSpeed },
    { label: TEXT.traitNames.culture, get: (s) => s.avgCulture },
    { label: TEXT.traitNames.size, get: (s) => s.avgSize },
  ];

  const traitFills: HTMLDivElement[] = [];
  const traitVals: HTMLSpanElement[] = [];
  const traitRows = traitDefs.map((def) => {
    const fill = el("div", {
      class: def.bipolar ? "ob-trait-fill ob-trait-diet" : "ob-trait-fill",
    });
    const val = el("span", { class: "ob-trait-v", text: "–" });
    traitFills.push(fill);
    traitVals.push(val);
    return el(
      "div",
      { class: "ob-trait-row" },
      el("span", { class: "ob-trait-l", text: def.label }),
      el("div", { class: "ob-trait-bar" }, fill),
      val,
    );
  });

  const tribeCountEl = el("span", { class: "ob-tribe-count", text: "0" });
  const tribeSwatches = el("div", { class: "ob-tribe-swatches" });

  const lineageBody = el(
    "div",
    { class: "ob-lineage-body" },
    el("div", { class: "ob-mini-title", text: TEXT.lineageTitle }),
    ...traitRows,
    el("div", { class: "ob-sep" }),
    el(
      "div",
      { class: "ob-tribe-head" },
      el("span", { class: "ob-mini-title", text: TEXT.tribes }),
      tribeCountEl,
    ),
    tribeSwatches,
  );

  const lineageToggle = el("button", {
    class: "ob-collapse",
    title: TEXT.lineageTitle,
    text: "‹",
  });
  const lineagePanel = el(
    "div",
    { class: "ob-panel ob-lineage collapsed" },
    el(
      "div",
      { class: "ob-lineage-head" },
      lineageToggle,
      el("span", { class: "ob-lineage-title", text: TEXT.lineageTitle }),
    ),
    lineageBody,
  );
  lineageToggle.addEventListener("click", () => {
    const c = lineagePanel.classList.toggle("collapsed");
    lineageToggle.textContent = c ? "‹" : "›";
  });

  // ===================================================================
  // 下中央 年代記
  // ===================================================================
  const chronicleList = el("div", { class: "ob-chronicle-list" });
  const chroniclePanel = el(
    "div",
    { class: "ob-panel ob-chronicle" },
    el("div", { class: "ob-mini-title", text: TEXT.chronicleTitle }),
    chronicleList,
  );

  function pushEvents(events: ChronicleEvent[]): void {
    for (const ev of events) {
      const row = el(
        "div",
        { class: `ob-ch-row ch-${ev.kind}` },
        el("span", { class: "ob-ch-time", text: formatClock(ev.time) }),
        el("span", { class: "ob-ch-icon", text: CH_ICON[ev.kind] ?? "•" }),
        el("span", { class: "ob-ch-text", text: ev.text }),
      );
      chronicleList.prepend(row);
      // 次フレームで .show を付けてフェードイン
      requestAnimationFrame(() => row.classList.add("show"));
      while (chronicleList.childElementCount > MAX_CHRONICLE) {
        chronicleList.lastElementChild?.remove();
      }
    }
  }

  // ===================================================================
  // 左下 設定(小)
  // ===================================================================
  // 速度
  const speedInput = el("input", {
    class: "ob-range",
    type: "range",
    min: 0.25,
    max: 4,
    step: 0.05,
    value: controller.getConfig().speed,
  }) as HTMLInputElement;
  const speedVal = el("span", {
    class: "ob-range-v",
    text: `×${controller.getConfig().speed.toFixed(2)}`,
  });
  speedInput.addEventListener("input", () => {
    const v = clamp(+speedInput.value, 0.25, 4);
    speedVal.textContent = `×${v.toFixed(2)}`;
    controller.setSpeed(v);
  });

  // 一時停止 / 再開
  const pauseBtn = el("button", {
    class: "ob-btn ob-btn-wide",
    text: paused ? TEXT.resume : TEXT.pause,
    onclick: () => doTogglePause(),
  });
  function refreshPause(): void {
    pauseBtn.textContent = paused ? TEXT.resume : TEXT.pause;
    pauseBtn.classList.toggle("active", paused);
  }
  function doTogglePause(): void {
    paused = controller.togglePause();
    refreshPause();
  }

  // 創世
  const genesisBtn = el("button", {
    class: "ob-btn ob-btn-wide ob-btn-genesis",
    text: TEXT.genesis,
    onclick: () => doGenesis(),
  });
  function doGenesis(): void {
    controller.genesis();
    flashTitle();
  }

  // 文明ステージ ON/OFF
  const civBtn = el("button", {
    class: "ob-btn ob-btn-wide",
    text: `${TEXT.civilization}: ${
      controller.getConfig().civilization ? TEXT.civOn : TEXT.civOff
    }`,
    onclick: () => {
      const on = controller.toggleCivilization();
      civBtn.textContent = `${TEXT.civilization}: ${on ? TEXT.civOn : TEXT.civOff}`;
      civBtn.classList.toggle("active", on);
    },
  });
  civBtn.classList.toggle("active", controller.getConfig().civilization);

  // 画質(3段セグメント)
  const qualityBtns: HTMLButtonElement[] = [];
  function refreshQuality(q: 0 | 1 | 2): void {
    qualityBtns.forEach((b, i) => b.classList.toggle("active", i === q));
  }
  const qualitySeg = el(
    "div",
    { class: "ob-seg" },
    ...([0, 1, 2] as const).map((q) => {
      const b = el("button", {
        class: "ob-seg-btn",
        text: TEXT.qualityNames[q],
        onclick: () => {
          controller.setQuality(q);
          refreshQuality(q);
        },
      });
      qualityBtns.push(b);
      return b;
    }),
  );

  // 音 ON/OFF + 音量
  const soundBtn = el("button", {
    class: "ob-btn ob-btn-wide",
    text: TEXT.soundOff,
    onclick: () => {
      void controller.toggleSound().then((on) => {
        soundBtn.textContent = on ? TEXT.soundOn : TEXT.soundOff;
        soundBtn.classList.toggle("active", on);
      });
    },
  });
  const volumeInput = el("input", {
    class: "ob-range",
    type: "range",
    min: 0,
    max: 1,
    step: 0.01,
    value: VOLUME_DEFAULT,
  }) as HTMLInputElement;
  const volumeVal = el("span", {
    class: "ob-range-v",
    text: `${Math.round(VOLUME_DEFAULT * 100)}%`,
  });
  volumeInput.addEventListener("input", () => {
    const v = clamp(+volumeInput.value, 0, 1);
    volumeVal.textContent = `${Math.round(v * 100)}%`;
    controller.setVolume(v);
  });

  const settingsBody = el(
    "div",
    { class: "ob-settings-body" },
    rangeBlock(TEXT.speed, speedVal, speedInput),
    el("div", { class: "ob-btn-row" }, pauseBtn),
    el("div", { class: "ob-btn-row" }, genesisBtn),
    el("div", { class: "ob-btn-row" }, civBtn),
    el(
      "div",
      { class: "ob-setting-line" },
      el("span", { class: "ob-range-l", text: TEXT.quality }),
      qualitySeg,
    ),
    el("div", { class: "ob-btn-row" }, soundBtn),
    rangeBlock(TEXT.volume, volumeVal, volumeInput),
  );
  const settingsToggle = el("button", {
    class: "ob-collapse",
    title: "設定",
    text: "⚙",
  });
  const settingsPanel = el(
    "div",
    { class: "ob-panel ob-settings" },
    el(
      "div",
      { class: "ob-settings-head" },
      settingsToggle,
      el("span", { class: "ob-settings-title", text: TEXT.speed }),
    ),
    settingsBody,
  );
  settingsToggle.addEventListener("click", () => {
    settingsPanel.classList.toggle("collapsed");
  });

  // ===================================================================
  // 中央 タイトル演出(起動・創世)
  // ===================================================================
  const titleOverlay = el(
    "div",
    { class: "ob-title-overlay" },
    el("div", { class: "ob-title-big", text: TEXT.title }),
    el("div", { class: "ob-title-sub", text: TEXT.subtitle }),
  );
  let titleTimer = 0;
  function flashTitle(): void {
    titleOverlay.classList.remove("fade");
    // 再トリガのため強制リフロー
    void titleOverlay.offsetWidth;
    titleOverlay.classList.add("show");
    window.clearTimeout(titleTimer);
    titleTimer = window.setTimeout(() => {
      titleOverlay.classList.remove("show");
      titleOverlay.classList.add("fade");
    }, 3000);
  }

  // ===================================================================
  // キーボード
  // ===================================================================
  function onKey(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "BUTTON" || tag === "TEXTAREA") return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.code === "Space") {
      e.preventDefault();
      doTogglePause();
      return;
    }
    const k = e.key;
    if (k === "g" || k === "G") {
      doGenesis();
      return;
    }
    if (k === "[") {
      commitRadius(+radiusInput.value - RADIUS_STEP);
      return;
    }
    if (k === "]") {
      commitRadius(+radiusInput.value + RADIUS_STEP);
      return;
    }
    if (k >= "1" && k <= "9") {
      const idx = k.charCodeAt(0) - 49; // '1' → 0
      if (idx < TOOL_ORDER.length) controller.setTool(TOOL_ORDER[idx]);
    }
  }
  window.addEventListener("keydown", onKey);

  // ===================================================================
  // マウント & 初期化
  // ===================================================================
  root.append(
    hud,
    palette,
    lineagePanel,
    chroniclePanel,
    settingsPanel,
    titleOverlay,
  );

  highlightTool(Divine.OBSERVE);
  commitRadius(RADIUS_DEFAULT);
  commitStrength(STRENGTH_DEFAULT);
  controller.setVolume(VOLUME_DEFAULT);
  refreshQuality(controller.getQuality());
  flashTitle();

  // ===================================================================
  // 毎フレーム更新(DOMは250msに間引き)
  // ===================================================================
  function update(stats: WorldStats, fps: number): void {
    const now = performance.now();
    if (now - lastDom < DOM_INTERVAL) return;
    lastDom = now;

    hudFps.textContent = String(Math.round(fps));
    hudEpoch.textContent = String(Math.max(0, stats.epoch | 0));
    hudLife.textContent = Math.max(0, stats.populations[1] | 0).toLocaleString();
    hudFood.textContent = Math.max(0, stats.populations[0] | 0).toLocaleString();
    hudTribes.textContent = String(Math.max(0, stats.tribes | 0));

    // 平均形質バー
    for (let i = 0; i < traitDefs.length; i++) {
      const v = clamp(traitDefs[i].get(stats), 0, 1);
      traitFills[i].style.width = `${(v * 100).toFixed(0)}%`;
      traitVals[i].textContent = v.toFixed(2);
    }

    // 部族の代表色
    const tribes = clamp(stats.tribes | 0, 0, TRIBE_PALETTE.length);
    tribeCountEl.textContent = String(tribes);
    if (tribeSwatches.childElementCount !== tribes) {
      tribeSwatches.replaceChildren();
      for (let i = 0; i < tribes; i++) {
        tribeSwatches.append(
          el("span", {
            class: "ob-swatch",
            attrs: { style: `background:${hdrToCss(TRIBE_PALETTE[i])}` },
          }),
        );
      }
    }
  }

  function syncTool(t: DivineTool): void {
    highlightTool(t);
  }

  return { update, pushEvents, syncTool };
}

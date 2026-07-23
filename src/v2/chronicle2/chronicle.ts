/**
 * 年代記検出。所有: ui 担当。
 * WorldStats の前回状態との差分から創発イベント(ChronicleEvent)を生成する。
 * TEXT.chronicle[kind] のテンプレをランダム選択し {n}/{t} を置換。
 * クールダウン + 閾値ヒステリシスで連続発火を防ぐ。
 * reset() は状態を初期化し、次回 observe で genesis を1度だけ発火させる。
 */
import type {
  ChronicleEvent,
  ChronicleKind,
  IChronicler,
  WorldStats,
} from "../contracts2";
import { TEXT } from "../content2/index";

/** 差分評価の最小間隔(秒)。フレーム毎の微振動を吸収する。 */
const EVAL_INTERVAL = 2.4;

/** kind ごとのクールダウン(秒)。この間は同種を再発火しない。 */
const COOLDOWN: Record<ChronicleKind, number> = {
  genesis: 4,
  bloom: 14,
  crash: 14,
  extinction: 30,
  carnivore: 24,
  herbivore: 24,
  tribe: 18,
  civilization: 999,
  divine: 3,
};

type DietMode = "herb" | "mid" | "carn";

function dietModeOf(diet: number): DietMode {
  if (diet > 0.55) return "carn";
  if (diet < 0.35) return "herb";
  return "mid";
}

export function createChronicler(): IChronicler {
  let started = false;
  let pendingGenesis = false;

  let initialLife = 1;
  let evalLife = 0;
  let lastEval = 0;

  let dietMode: DietMode = "mid";
  let announcedTribes = 1;
  let tribePeak = 1;
  let tribePeakSince = 0;
  let civAnnounced = false;
  let extinctLatched = false;

  const lastFire: Record<ChronicleKind, number> = {
    genesis: -1e9,
    bloom: -1e9,
    crash: -1e9,
    extinction: -1e9,
    carnivore: -1e9,
    herbivore: -1e9,
    tribe: -1e9,
    civilization: -1e9,
    divine: -1e9,
  };

  const rand = (n: number): number => (Math.random() * n) | 0;

  /** テンプレを選び {n}/{t} を置換して1行の叙事詩にする。 */
  function compose(kind: ChronicleKind, n: number, t: number): string {
    const pool = TEXT.chronicle[kind];
    const tmpl = pool && pool.length > 0 ? pool[rand(pool.length)] : "";
    return tmpl
      .replace(/\{n\}/g, String(n))
      .replace(/\{t\}/g, String(t));
  }

  function canFire(kind: ChronicleKind, now: number): boolean {
    return now - lastFire[kind] >= COOLDOWN[kind];
  }

  function fire(
    out: ChronicleEvent[],
    kind: ChronicleKind,
    now: number,
    n: number,
    t: number,
  ): void {
    lastFire[kind] = now;
    out.push({ kind, text: compose(kind, n, t), time: now });
  }

  function observe(stats: WorldStats): ChronicleEvent[] {
    const events: ChronicleEvent[] = [];
    const now = stats.simTime;
    const life = stats.populations[1] | 0;

    // ---- 初回(reset直後): 基準値を記録し、genesis を1度発火 ----
    if (!started) {
      started = true;
      initialLife = Math.max(1, life);
      evalLife = life;
      lastEval = now;
      dietMode = dietModeOf(stats.avgDiet);
      announcedTribes = Math.max(1, stats.tribes | 0);
      tribePeak = announcedTribes;
      tribePeakSince = now;
      civAnnounced = stats.buildsPerSec > 0;
      extinctLatched = false;
      for (const k in lastFire) lastFire[k as ChronicleKind] = -1e9;
      if (pendingGenesis) {
        pendingGenesis = false;
        fire(events, "genesis", now, initialLife, Math.max(1, stats.epoch | 0));
      }
      return events;
    }

    // ---- 食性の台頭(ヒステリシス) ----
    if (stats.avgDiet > 0.55 && dietMode !== "carn" && canFire("carnivore", now)) {
      dietMode = "carn";
      fire(events, "carnivore", now, Math.round(stats.avgDiet * 100), life);
    } else if (
      stats.avgDiet < 0.35 &&
      dietMode !== "herb" &&
      canFire("herbivore", now)
    ) {
      dietMode = "herb";
      fire(events, "herbivore", now, Math.round((1 - stats.avgDiet) * 100), life);
    } else if (stats.avgDiet >= 0.35 && stats.avgDiet <= 0.55) {
      dietMode = "mid";
    }

    // ---- 部族(文化)の誕生: ピークが一定時間安定したら告知 ----
    const tribes = stats.tribes | 0;
    if (tribes >= tribePeak) {
      if (tribes > tribePeak) {
        tribePeak = tribes;
        tribePeakSince = now;
      }
    } else {
      tribePeak = tribes;
      tribePeakSince = now;
    }
    if (
      tribePeak > announcedTribes &&
      tribePeak >= 2 &&
      now - tribePeakSince >= 3 &&
      canFire("tribe", now)
    ) {
      announcedTribes = tribePeak;
      fire(events, "tribe", now, tribePeak, Math.max(1, stats.epoch | 0));
    }

    // ---- 文明の始まり: 建造が初めて発生 ----
    if (!civAnnounced && stats.buildsPerSec > 0 && canFire("civilization", now)) {
      civAnnounced = true;
      fire(events, "civilization", now, life, Math.max(1, stats.epoch | 0));
    }

    // ---- 絶滅の危機: 生命が初期の5%未満(ラッチで一度だけ) ----
    if (life < initialLife * 0.05 && life > 0) {
      if (!extinctLatched && canFire("extinction", now)) {
        extinctLatched = true;
        fire(events, "extinction", now, life, Math.max(1, stats.epoch | 0));
      }
    } else if (life > initialLife * 0.2) {
      extinctLatched = false;
    }

    // ---- 繁栄 / 大量死: 一定間隔ごとに個体数の変化率を評価 ----
    if (now - lastEval >= EVAL_INTERVAL) {
      const ref = Math.max(1, evalLife);
      const ratio = life / ref;
      if (ratio > 1.5 && life > 60 && canFire("bloom", now)) {
        fire(events, "bloom", now, life, Math.max(1, stats.epoch | 0));
      } else if (ratio < 0.6 && evalLife > 80 && canFire("crash", now)) {
        const lost = Math.max(0, evalLife - life);
        fire(events, "crash", now, lost, life);
      }
      evalLife = life;
      lastEval = now;
    }

    return events;
  }

  function reset(): void {
    started = false;
    pendingGenesis = true;
  }

  return { observe, reset };
}

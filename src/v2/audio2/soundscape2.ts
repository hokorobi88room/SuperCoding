/**
 * 生成音響 (inter 担当) — 神の視座から見下ろす生命の海のサウンドスケープ。
 * WebAudio プリミティブのみで、常駐アンビエント(荘厳な低音ドローン+潮騒ノイズ)と
 * 使い捨てイベント音(採餌の柔らかな粒 / 捕食の低い衝撃 / 誕生の澄んだ鈴 /
 * 大量死の低い唸り)を生成する。
 *
 * 契約: createSoundscape2(): ISoundscape2。
 *  - toggle() 初回でユーザー操作イベント内から AudioContext を生成+resume。
 *    2回目以降はマスターフェードで ON/OFF。戻り値=ON かどうか。
 *  - update(stats, dt) は enabled=false の間は即 return。
 *  - 常駐ノードは初回のみ生成し、以降はパラメータ変調のみ(連打で壊れない)。
 */
import type { WorldStats } from "../contracts2";

/** 生成音響インターフェース(DESIGN_V2「統合が期待するファクトリ」節)。 */
export interface ISoundscape2 {
  readonly enabled: boolean;
  toggle(): Promise<boolean>;
  setVolume(v: number): void;
  update(stats: WorldStats, dt: number): void;
}

// --- 定数 -------------------------------------------------------------
/** ON/OFF フェード時間 (s) */
const FADE_TIME = 0.8;
/** マスター出力のヘッドルーム(クリップ回避) */
const MASTER_HEADROOM = 0.85;
/** 生命の総数の明るさ正規化上限(0..1 へ写像) */
const LIFE_BRIGHT_CAP = 3200;
/** ドローン基音 (Hz) — 深く荘厳に */
const ROOT_HZ = 43.65; // ≈ F1

// --- 小物 -------------------------------------------------------------
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** 常駐グラフのうち、後から変調・参照するノード群 */
interface Graph {
  /** ON/OFF フェード母線(全音源はここへ集約) */
  fadeBus: GainNode;
  /** 音量(指数カーブ) */
  masterGain: GainNode;
  /** 和音の第3音(短調 root*1.2 〜 長調 root*1.25 を生命数で補間) */
  thirdOsc: OscillatorNode;
  /** 第3音のゲイン(明るいほど前へ) */
  thirdGain: GainNode;
  /** ドローンの明るさ(ローパス開閉) */
  droneLP: BiquadFilterNode;
  /** 天上のパッド(高倍音の合唱。生命数で開く) */
  choirGain: GainNode;
  choirLP: BiquadFilterNode;
  /** 潮騒バンドパス(中心周波数を生命数と LFO で変調) */
  surfBP: BiquadFilterNode;
  /** 潮騒ゲイン(基準値+LFO スウェル) */
  surfGain: GainNode;
}

export function createSoundscape2(): ISoundscape2 {
  let ctx: AudioContext | null = null;
  let graph: Graph | null = null;
  let enabled = false;
  let volume = 0.7;

  // アンビエントの平滑化明るさ(生命数由来 0..1、ゆっくり追従)
  let brightness = 0;
  // イベント用クールダウン/参照値(秒)
  let bellCooldown = 0;
  let growlCooldown = 0;
  let impactCooldown = 0;
  // 大量死検出用: 死亡率のゆるやかなベースライン(EMA)
  let deathEma = 0;
  let deathEmaInit = false;
  // OFF 後に CPU を落とすための suspend タイマ
  let suspendTimer: ReturnType<typeof setTimeout> | null = null;

  // --- ノイズバッファ(白色、2秒ループ) --------------------------------
  function makeNoise(c: AudioContext): AudioBuffer {
    const len = Math.floor(c.sampleRate * 2);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // --- 常駐グラフ構築(初回 toggle でのみ実行) ------------------------
  function buildGraph(c: AudioContext): Graph {
    // 出力段: fadeBus -> masterGain -> limiter -> destination
    const masterGain = c.createGain();
    masterGain.gain.value = 0.0001;
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 12;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    const fadeBus = c.createGain();
    fadeBus.gain.value = 0; // 起動時は無音。ON で 1 へフェード
    fadeBus.connect(masterGain);
    masterGain.connect(limiter);
    limiter.connect(c.destination);

    // --- 荘厳な低音ドローン(根音/五度/オクターブ/可変第3音) ---
    const droneMix = c.createGain();
    droneMix.gain.value = 0.5;
    const droneLP = c.createBiquadFilter();
    droneLP.type = "lowpass";
    droneLP.frequency.value = 280;
    droneLP.Q.value = 0.7;
    droneMix.connect(droneLP);
    droneLP.connect(fadeBus);

    // 根音(三角波)
    const root = c.createOscillator();
    root.type = "triangle";
    root.frequency.value = ROOT_HZ;
    root.detune.value = -4;
    const rootG = c.createGain();
    rootG.gain.value = 0.5;
    root.connect(rootG).connect(droneMix);

    // 五度(正弦波)
    const fifth = c.createOscillator();
    fifth.type = "sine";
    fifth.frequency.value = ROOT_HZ * 1.5;
    fifth.detune.value = 3;
    const fifthG = c.createGain();
    fifthG.gain.value = 0.26;
    fifth.connect(fifthG).connect(droneMix);

    // オクターブ(正弦波・厚みの土台)
    const octave = c.createOscillator();
    octave.type = "sine";
    octave.frequency.value = ROOT_HZ * 2;
    octave.detune.value = -2;
    const octaveG = c.createGain();
    octaveG.gain.value = 0.18;
    octave.connect(octaveG).connect(droneMix);

    // 第3音: 短調(root*1.2)〜長調(root*1.25)を生命数で補間
    const thirdOsc = c.createOscillator();
    thirdOsc.type = "triangle";
    thirdOsc.frequency.value = ROOT_HZ * 1.2;
    thirdOsc.detune.value = 6;
    const thirdGain = c.createGain();
    thirdGain.gain.value = 0.15;
    thirdOsc.connect(thirdGain).connect(droneMix);

    // デチューン LFO(ゆっくり揺らして厚みを出す、単位=セント)
    const lfoDetune = c.createOscillator();
    lfoDetune.type = "sine";
    lfoDetune.frequency.value = 0.05;
    const lfoDetuneG = c.createGain();
    lfoDetuneG.gain.value = 5;
    lfoDetune.connect(lfoDetuneG);
    lfoDetuneG.connect(root.detune);
    lfoDetuneG.connect(fifth.detune);
    lfoDetuneG.connect(octave.detune);
    lfoDetuneG.connect(thirdOsc.detune);

    // --- 天上のパッド(高倍音の合唱。生命が満ちるほど開く) ---
    const choirLP = c.createBiquadFilter();
    choirLP.type = "lowpass";
    choirLP.frequency.value = 500;
    choirLP.Q.value = 0.6;
    const choirGain = c.createGain();
    choirGain.gain.value = 0.0; // 生命数で開く
    choirLP.connect(choirGain).connect(fadeBus);
    // 根音の上部倍音(オクターブ+五度)をわずかに重ねて荘厳さを出す
    const ch1 = c.createOscillator();
    ch1.type = "sine";
    ch1.frequency.value = ROOT_HZ * 4; // 2オクターブ上
    ch1.detune.value = 4;
    const ch1g = c.createGain();
    ch1g.gain.value = 0.5;
    ch1.connect(ch1g).connect(choirLP);
    const ch2 = c.createOscillator();
    ch2.type = "sine";
    ch2.frequency.value = ROOT_HZ * 6; // 上部五度
    ch2.detune.value = -5;
    const ch2g = c.createGain();
    ch2g.gain.value = 0.32;
    ch2.connect(ch2g).connect(choirLP);
    // パッドのゆらぎ LFO(ゆっくり音量スウェル)
    const lfoChoir = c.createOscillator();
    lfoChoir.type = "sine";
    lfoChoir.frequency.value = 0.07;
    const lfoChoirG = c.createGain();
    lfoChoirG.gain.value = 0.015;
    lfoChoir.connect(lfoChoirG).connect(choirGain.gain);

    // --- 潮騒(白色ノイズ -> バンドパス) ---
    const noise = c.createBufferSource();
    noise.buffer = makeNoise(c);
    noise.loop = true;
    const surfBP = c.createBiquadFilter();
    surfBP.type = "bandpass";
    surfBP.frequency.value = 520;
    surfBP.Q.value = 0.9;
    const surfGain = c.createGain();
    surfGain.gain.value = 0.09;
    noise.connect(surfBP).connect(surfGain).connect(fadeBus);

    // 潮騒 LFO(バンドパスの開閉 + 音量スウェルをゆっくり)
    const lfoSurf = c.createOscillator();
    lfoSurf.type = "sine";
    lfoSurf.frequency.value = 0.045;
    const lfoSurfFreq = c.createGain();
    lfoSurfFreq.gain.value = 240;
    lfoSurf.connect(lfoSurfFreq).connect(surfBP.frequency);
    const lfoSurfAmp = c.createGain();
    lfoSurfAmp.gain.value = 0.045;
    lfoSurf.connect(lfoSurfAmp).connect(surfGain.gain);

    // 常駐音源は一度だけ start(以降 stop しない。無音は fadeBus/suspend で担保)
    root.start();
    fifth.start();
    octave.start();
    thirdOsc.start();
    lfoDetune.start();
    ch1.start();
    ch2.start();
    lfoChoir.start();
    lfoSurf.start();
    noise.start();

    return {
      fadeBus,
      masterGain,
      thirdOsc,
      thirdGain,
      droneLP,
      choirGain,
      choirLP,
      surfBP,
      surfGain,
    };
  }

  // --- 音量(指数=2乗カーブ) ------------------------------------------
  function applyVolume(): void {
    if (!ctx || !graph) return;
    const lin = volume <= 0 ? 0.0001 : volume * volume;
    graph.masterGain.gain.setTargetAtTime(
      lin * MASTER_HEADROOM,
      ctx.currentTime,
      0.05,
    );
  }

  // --- ON/OFF フェード -------------------------------------------------
  function rampFade(target: number): void {
    if (!ctx || !graph) return;
    const now = ctx.currentTime;
    const p = graph.fadeBus.gain;
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.linearRampToValueAtTime(target, now + FADE_TIME);
  }

  function cancelSuspend(): void {
    if (suspendTimer !== null) {
      clearTimeout(suspendTimer);
      suspendTimer = null;
    }
  }

  // フェード完了後に suspend して CPU を落とす(連打時は最新状態を確認)
  function scheduleSuspend(): void {
    cancelSuspend();
    suspendTimer = setTimeout(() => {
      suspendTimer = null;
      if (!enabled && ctx && ctx.state === "running") {
        ctx.suspend().catch(() => {});
      }
    }, Math.ceil(FADE_TIME * 1000) + 80);
  }

  // --- toggle ---------------------------------------------------------
  async function toggle(): Promise<boolean> {
    if (!ctx) {
      // 初回のみ: ユーザー操作イベント内で AudioContext を生成しグラフを構築
      const AC: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ctx = new AC();
      graph = buildGraph(ctx);
      applyVolume();
    }
    enabled = !enabled;
    if (enabled) {
      cancelSuspend();
      if (ctx.state !== "running") {
        try {
          await ctx.resume();
        } catch {
          /* 一部ブラウザで resume が拒否されても無音のまま継続 */
        }
      }
      // await 中に連打で OFF へ戻された場合はフェードアップしない
      if (enabled) rampFade(1);
    } else {
      rampFade(0);
      scheduleSuspend();
    }
    return enabled;
  }

  // --- 音量 API -------------------------------------------------------
  function setVolume(v: number): void {
    volume = clamp(v, 0, 1);
    applyVolume();
  }

  // --- アンビエント変調(生命数→明るさ/和音/合唱) --------------------
  function updateAmbient(
    c: AudioContext,
    g: Graph,
    life: number,
    dt: number,
  ): void {
    // 明るさ目標: 生命が多いほど明るく(0..1、緩めのカーブ)
    const t = clamp(life / LIFE_BRIGHT_CAP, 0, 1);
    const target = Math.pow(t, 0.6);
    // ゆっくり追従(時定数 ~1.6s 相当)
    brightness += (target - brightness) * Math.min(1, dt * 0.6);

    const now = c.currentTime;
    const b = brightness;
    // 暗い(短調・こもる)〜明るい(長調・開く)
    g.droneLP.frequency.setTargetAtTime(220 + b * 1200, now, 0.3);
    g.thirdOsc.frequency.setTargetAtTime(
      ROOT_HZ * 1.2 + b * (ROOT_HZ * 0.05), // 短3度 → 長3度
      now,
      0.5,
    );
    g.thirdGain.gain.setTargetAtTime(0.13 + b * 0.13, now, 0.4);
    // 天上のパッド: 生命が満ちるほど開き、荘厳さが増す
    g.choirLP.frequency.setTargetAtTime(500 + b * 2400, now, 0.5);
    g.choirGain.gain.setTargetAtTime(b * b * 0.11, now, 0.6);
    // 潮騒: 基準中心周波数と音量が明るさで上がる(LFO は加算で揺らす)
    g.surfBP.frequency.setTargetAtTime(400 + b * 1500, now, 0.4);
    g.surfGain.gain.setTargetAtTime(0.07 + b * 0.05, now, 0.4);
  }

  // --- イベント音: 採餌の柔らかな粒(丸い正弦の一滴) ------------------
  function playGrain(c: AudioContext, g: Graph): void {
    const t0 = c.currentTime;
    // 明るいほど高めに寄る、丸い水滴音
    const f = Math.min(1900, 640 + Math.random() * 700 + brightness * 420);
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(f, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(120, f * 0.6), t0 + 0.11);
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(0.08, t0 + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.16);
    const pan = c.createStereoPanner();
    pan.pan.value = (Math.random() * 2 - 1) * 0.55;
    osc.connect(env).connect(pan).connect(g.fadeBus);
    osc.start(t0);
    osc.stop(t0 + 0.18);
    osc.onended = () => {
      try {
        osc.disconnect();
        env.disconnect();
        pan.disconnect();
      } catch {
        /* noop */
      }
    };
  }

  // --- イベント音: 捕食の低い衝撃(サブ正弦+ノイズの打撃) ------------
  function playImpact(c: AudioContext, g: Graph): void {
    const t0 = c.currentTime;
    // 低いサブ正弦の一撃(素早く沈む)
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, t0);
    osc.frequency.exponentialRampToValueAtTime(48, t0 + 0.18);
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(0.16, t0 + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0006, t0 + 0.32);
    // 打撃のアタック(短いローパスノイズ)
    const nz = c.createBufferSource();
    nz.buffer = makeNoise(c);
    const nlp = c.createBiquadFilter();
    nlp.type = "lowpass";
    nlp.frequency.value = 380;
    const nenv = c.createGain();
    nenv.gain.setValueAtTime(0.06, t0);
    nenv.gain.exponentialRampToValueAtTime(0.0004, t0 + 0.09);
    const pan = c.createStereoPanner();
    pan.pan.value = (Math.random() * 2 - 1) * 0.4;
    osc.connect(env).connect(pan).connect(g.fadeBus);
    nz.connect(nlp).connect(nenv).connect(pan);
    osc.start(t0);
    osc.stop(t0 + 0.34);
    nz.start(t0);
    nz.stop(t0 + 0.1);
    osc.onended = () => {
      try {
        osc.disconnect();
        env.disconnect();
        nz.disconnect();
        nlp.disconnect();
        nenv.disconnect();
        pan.disconnect();
      } catch {
        /* noop */
      }
    };
  }

  // --- イベント音: 誕生の澄んだ鈴(倍音2つの三角波) ------------------
  function playBell(c: AudioContext, g: Graph): void {
    const t0 = c.currentTime;
    // 明るいペンタトニック上の音(ドローンと協和)
    const notes = [523.25, 587.33, 659.25, 783.99, 880.0, 987.77];
    const f0 = notes[(Math.random() * notes.length) | 0];
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(0.085, t0 + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0005, t0 + 1.8);
    const pan = c.createStereoPanner();
    pan.pan.value = (Math.random() * 2 - 1) * 0.4;
    env.connect(pan).connect(g.fadeBus);

    const o1 = c.createOscillator();
    o1.type = "triangle";
    o1.frequency.value = f0;
    o1.detune.value = -3;
    o1.connect(env);

    const o2 = c.createOscillator();
    o2.type = "triangle";
    o2.frequency.value = f0 * 2.01; // オクターブ上倍音(わずかにずらして煌めき)
    const o2g = c.createGain();
    o2g.gain.value = 0.4;
    o2.connect(o2g).connect(env);

    o1.start(t0);
    o2.start(t0);
    o1.stop(t0 + 1.9);
    o2.stop(t0 + 1.9);
    o2.onended = () => {
      try {
        o1.disconnect();
        o2.disconnect();
        o2g.disconnect();
        env.disconnect();
        pan.disconnect();
      } catch {
        /* noop */
      }
    };
  }

  // --- イベント音: 大量死の低い唸り(sub saw をローパス、~2.4秒) -----
  function playGrowl(c: AudioContext, g: Graph): void {
    const t0 = c.currentTime;
    const osc = c.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(72, t0);
    osc.frequency.linearRampToValueAtTime(58, t0 + 2.4); // ゆっくり沈む
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(110, t0);
    lp.frequency.linearRampToValueAtTime(220, t0 + 0.7);
    lp.frequency.linearRampToValueAtTime(80, t0 + 2.4);
    lp.Q.value = 6;
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(0.22, t0 + 0.35);
    env.gain.linearRampToValueAtTime(0.18, t0 + 1.6);
    env.gain.exponentialRampToValueAtTime(0.0008, t0 + 2.5);
    osc.connect(lp).connect(env).connect(g.fadeBus);
    osc.start(t0);
    osc.stop(t0 + 2.55);
    osc.onended = () => {
      try {
        osc.disconnect();
        lp.disconnect();
        env.disconnect();
      } catch {
        /* noop */
      }
    };
  }

  // --- 毎フレーム更新 -------------------------------------------------
  function update(stats: WorldStats, dt: number): void {
    // enabled=false の間は即 return(常駐音源はフェード済み/suspend 済み)
    if (!enabled || !ctx || !graph) return;
    const c = ctx;
    const g = graph;
    if (c.state !== "running") return;
    // dt の異常値(タブ復帰など)を丸める
    const d = clamp(dt, 0, 0.1);

    // アンビエント(生命の総数 = populations[1])
    updateAmbient(c, g, stats.populations[1], d);

    // クールダウン更新
    bellCooldown = Math.max(0, bellCooldown - d);
    growlCooldown = Math.max(0, growlCooldown - d);
    impactCooldown = Math.max(0, impactCooldown - d);

    // 1フレーム最大3個のイベント音
    let events = 0;

    // 採餌の粒: eatsPerSec が高いほど頻度up(上限9Hz)
    const eatHz = 9 * (1 - Math.exp(-Math.max(0, stats.eatsPerSec) / 30));
    if (events < 3 && Math.random() < eatHz * d) {
      playGrain(c, g);
      events++;
    }

    // 捕食の衝撃: killsPerSec に応じて発火(上限4Hz、最短120ms間隔)
    const killHz = 4 * (1 - Math.exp(-Math.max(0, stats.killsPerSec) / 14));
    if (events < 3 && impactCooldown <= 0 && Math.random() < killHz * d) {
      playImpact(c, g);
      impactCooldown = 0.12;
      events++;
    }

    // 誕生の鈴: birthsPerSec に応じて確率発火、最短3秒間隔
    if (
      events < 3 &&
      bellCooldown <= 0 &&
      stats.birthsPerSec > 0.2 &&
      Math.random() < Math.min(1, stats.birthsPerSec * 0.06)
    ) {
      playBell(c, g);
      events++;
      bellCooldown = 3 + Math.random() * 2.5;
    }

    // 大量死の唸り: 死亡率がベースライン(EMA)より急騰したとき、クールダウン12秒
    const deaths = Math.max(0, stats.deathsPerSec);
    if (!deathEmaInit) {
      deathEma = deaths;
      deathEmaInit = true;
    } else {
      // ゆるやかに追従(時定数 ~4s)
      deathEma += (deaths - deathEma) * Math.min(1, d * 0.25);
    }
    if (
      events < 3 &&
      growlCooldown <= 0 &&
      deaths > 12 &&
      deaths > deathEma * 2.2 + 6
    ) {
      playGrowl(c, g);
      growlCooldown = 12;
      // 唸りの後はベースラインを引き上げ、連続発火を抑える
      deathEma = deaths;
      events++;
    }
  }

  return {
    get enabled(): boolean {
      return enabled;
    },
    toggle,
    setVolume,
    update,
  };
}

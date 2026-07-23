/**
 * 生成音響 (audio 担当) — 深海のサウンドスケープ。
 * WebAudio プリミティブのみで、常駐アンビエント(低音ドローン+潮騒ノイズ)と
 * 使い捨てイベント音(捕食プラック / 誕生の鈴 / 個体数急落の唸り)を生成する。
 *
 * 契約: createSoundscape(): ISoundscape。
 *  - toggle() 初回でユーザー操作イベント内から AudioContext を生成+resume。
 *    2回目以降はマスターフェードで ON/OFF。戻り値=ON かどうか。
 *  - update() は enabled=false の間は即 return。
 *  - 常駐ノードは起動時に一度だけ生成し、以降はパラメータ変調のみ。
 */
import type { ISoundscape, SimStats } from "../contracts";

// --- 定数 -------------------------------------------------------------
/** ON/OFF フェード時間 (s) */
const FADE_TIME = 0.6;
/** マスター出力のヘッドルーム(クリップ回避) */
const MASTER_HEADROOM = 0.9;
/** 小魚個体数の明るさ正規化上限(0〜40000 を 0..1 に) */
const PREY_BRIGHT_CAP = 40000;
/** ドローン基音 (Hz) */
const ROOT_HZ = 55;

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
  /** 和音の第3音(短調66Hz〜長調68.75Hz を個体数で補間) */
  thirdOsc: OscillatorNode;
  /** 第3音のゲイン(明るいほど前へ) */
  thirdGain: GainNode;
  /** ドローンの明るさ(ローパス開閉) */
  droneLP: BiquadFilterNode;
  /** 潮騒バンドパス(中心周波数を個体数と LFO で変調) */
  surfBP: BiquadFilterNode;
  /** 潮騒ゲイン(基準値+LFO スウェル) */
  surfGain: GainNode;
}

export function createSoundscape(): ISoundscape {
  let ctx: AudioContext | null = null;
  let graph: Graph | null = null;
  let enabled = false;
  let volume = 0.7;

  // アンビエントの平滑化明るさ(個体数由来 0..1、ゆっくり追従)
  let brightness = 0;
  // イベント用クールダウン/参照値
  let bellCooldown = 0;
  let growlCooldown = 0;
  let popRef = -1;
  let popRefTimer = 1.5;
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

    // --- 低音ドローン(3オシレータ: 根音/五度/可変第3音) ---
    const droneMix = c.createGain();
    droneMix.gain.value = 0.5;
    const droneLP = c.createBiquadFilter();
    droneLP.type = "lowpass";
    droneLP.frequency.value = 300;
    droneLP.Q.value = 0.7;
    droneMix.connect(droneLP);
    droneLP.connect(fadeBus);

    // 根音 55Hz 三角波
    const root = c.createOscillator();
    root.type = "triangle";
    root.frequency.value = ROOT_HZ;
    root.detune.value = -4;
    const rootG = c.createGain();
    rootG.gain.value = 0.5;
    root.connect(rootG).connect(droneMix);

    // 五度 82.5Hz 正弦波
    const fifth = c.createOscillator();
    fifth.type = "sine";
    fifth.frequency.value = ROOT_HZ * 1.5; // 82.5
    fifth.detune.value = 3;
    const fifthG = c.createGain();
    fifthG.gain.value = 0.26;
    fifth.connect(fifthG).connect(droneMix);

    // 第3音: 短調(66Hz=root*1.2)〜長調(68.75Hz=root*1.25)を個体数で補間
    const thirdOsc = c.createOscillator();
    thirdOsc.type = "triangle";
    thirdOsc.frequency.value = ROOT_HZ * 1.2;
    thirdOsc.detune.value = 6;
    const thirdGain = c.createGain();
    thirdGain.gain.value = 0.16;
    thirdOsc.connect(thirdGain).connect(droneMix);

    // デチューン LFO(ゆっくり揺らして厚みを出す、単位=セント)
    const lfoDetune = c.createOscillator();
    lfoDetune.type = "sine";
    lfoDetune.frequency.value = 0.06;
    const lfoDetuneG = c.createGain();
    lfoDetuneG.gain.value = 5;
    lfoDetune.connect(lfoDetuneG);
    lfoDetuneG.connect(root.detune);
    lfoDetuneG.connect(fifth.detune);
    lfoDetuneG.connect(thirdOsc.detune);

    // --- 潮騒(白色ノイズ -> バンドパス) ---
    const noise = c.createBufferSource();
    noise.buffer = makeNoise(c);
    noise.loop = true;
    const surfBP = c.createBiquadFilter();
    surfBP.type = "bandpass";
    surfBP.frequency.value = 600;
    surfBP.Q.value = 0.9;
    const surfGain = c.createGain();
    surfGain.gain.value = 0.09;
    noise.connect(surfBP).connect(surfGain).connect(fadeBus);

    // 潮騒 LFO(バンドパスの開閉 + 音量スウェルをゆっくり)
    const lfoSurf = c.createOscillator();
    lfoSurf.type = "sine";
    lfoSurf.frequency.value = 0.05;
    const lfoSurfFreq = c.createGain();
    lfoSurfFreq.gain.value = 260; // 中心周波数の揺れ幅(基準値へ加算)
    lfoSurf.connect(lfoSurfFreq).connect(surfBP.frequency);
    const lfoSurfAmp = c.createGain();
    lfoSurfAmp.gain.value = 0.05; // 音量スウェル(基準値へ加算)
    lfoSurf.connect(lfoSurfAmp).connect(surfGain.gain);

    // 常駐音源は一度だけ start(以降 stop しない。無音は fadeBus/suspend で担保)
    root.start();
    fifth.start();
    thirdOsc.start();
    lfoDetune.start();
    lfoSurf.start();
    noise.start();

    return { fadeBus, masterGain, thirdOsc, thirdGain, droneLP, surfBP, surfGain };
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

  // --- アンビエント変調(個体数→明るさ/和音) --------------------------
  function updateAmbient(c: AudioContext, g: Graph, prey: number, dt: number): void {
    // 明るさ目標: 小魚が多いほど明るく(0..1、緩めのカーブ)
    const t = clamp(prey / PREY_BRIGHT_CAP, 0, 1);
    const target = Math.pow(t, 0.6);
    // ゆっくり追従(時定数 ~1.6s 相当)
    brightness += (target - brightness) * Math.min(1, dt * 0.6);

    const now = c.currentTime;
    const b = brightness;
    // 暗い(短調・こもる)〜明るい(長調・開く)
    g.droneLP.frequency.setTargetAtTime(240 + b * 1200, now, 0.3);
    g.thirdOsc.frequency.setTargetAtTime(
      ROOT_HZ * 1.2 + b * (ROOT_HZ * 0.05), // 66 → 68.75
      now,
      0.5,
    );
    g.thirdGain.gain.setTargetAtTime(0.15 + b * 0.13, now, 0.4);
    // 潮騒: 基準中心周波数と音量が明るさで上がる(LFO は加算で揺らす)
    g.surfBP.frequency.setTargetAtTime(420 + b * 1500, now, 0.4);
    g.surfGain.gain.setTargetAtTime(0.07 + b * 0.06, now, 0.4);
  }

  // --- イベント音: 捕食プラック(水滴) --------------------------------
  function playPluck(c: AudioContext, g: Graph): void {
    const t0 = c.currentTime;
    // ランダムピッチ 800〜2400Hz。明るいほど高めに寄る
    const f = Math.min(2400, 800 + Math.random() * 1000 + brightness * 500);
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(f, t0);
    // 落下感: 短時間で下降
    osc.frequency.exponentialRampToValueAtTime(Math.max(120, f * 0.55), t0 + 0.13);
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(0.12, t0 + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0006, t0 + 0.14);
    const pan = c.createStereoPanner();
    pan.pan.value = (Math.random() * 2 - 1) * 0.6;
    osc.connect(env).connect(pan).connect(g.fadeBus);
    osc.start(t0);
    osc.stop(t0 + 0.16);
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

  // --- イベント音: 誕生の柔らかい鈴(倍音2つの三角波) ----------------
  function playBell(c: AudioContext, g: Graph): void {
    const t0 = c.currentTime;
    // 明るいペンタトニック上の音から選ぶ(ドローンと協和)
    const notes = [523.25, 587.33, 659.25, 783.99, 880.0, 987.77];
    const f0 = notes[(Math.random() * notes.length) | 0];
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(0.09, t0 + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0005, t0 + 1.6);
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
    o1.stop(t0 + 1.7);
    o2.stop(t0 + 1.7);
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

  // --- イベント音: 個体数急落の低い唸り(80Hz saw をローパス、2秒) ---
  function playGrowl(c: AudioContext, g: Graph): void {
    const t0 = c.currentTime;
    const osc = c.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(84, t0);
    osc.frequency.linearRampToValueAtTime(72, t0 + 2); // ゆっくり沈む
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(120, t0);
    lp.frequency.linearRampToValueAtTime(220, t0 + 0.6);
    lp.frequency.linearRampToValueAtTime(90, t0 + 2);
    lp.Q.value = 6;
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(0.22, t0 + 0.3);
    env.gain.linearRampToValueAtTime(0.18, t0 + 1.4);
    env.gain.exponentialRampToValueAtTime(0.0008, t0 + 2.1);
    osc.connect(lp).connect(env).connect(g.fadeBus);
    osc.start(t0);
    osc.stop(t0 + 2.15);
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
  function update(stats: SimStats, dt: number): void {
    // enabled=false の間は即 return(常駐音源はフェード済み/suspend 済み)
    if (!enabled || !ctx || !graph) return;
    const c = ctx;
    const g = graph;
    if (c.state !== "running") return;

    // アンビエント(個体数=小魚 populations[1])
    updateAmbient(c, g, stats.populations[1], dt);

    // クールダウン更新
    bellCooldown = Math.max(0, bellCooldown - dt);
    growlCooldown = Math.max(0, growlCooldown - dt);

    // 1フレーム最大2個のイベント音
    let events = 0;

    // 捕食プラック: eatsPerSec が高いほど頻度up(上限10Hz)
    const eatRate = 10 * (1 - Math.exp(-Math.max(0, stats.eatsPerSec) / 25));
    if (events < 2 && Math.random() < eatRate * dt) {
      playPluck(c, g);
      events++;
    }

    // 誕生の鈴: birthsPerSec に応じて確率発火、最短4秒間隔
    if (
      events < 2 &&
      bellCooldown <= 0 &&
      stats.birthsPerSec > 0.2 &&
      Math.random() < Math.min(1, stats.birthsPerSec * 0.06)
    ) {
      playBell(c, g);
      events++;
      bellCooldown = 4 + Math.random() * 2.5;
    }

    // 個体数急落の唸り: 直前比(~1.5秒前)で小魚が20%以上減、クールダウン10秒
    popRefTimer -= dt;
    if (popRefTimer <= 0) {
      const prey = stats.populations[1];
      if (
        events < 2 &&
        popRef >= 0 &&
        growlCooldown <= 0 &&
        popRef > 80 &&
        prey < popRef * 0.8
      ) {
        playGrowl(c, g);
        growlCooldown = 10;
        events++;
      }
      popRef = prey;
      popRefTimer = 1.5;
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

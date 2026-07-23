# 『原初の海 (Primordial Sea)』設計書

WebGPUコンピュートシェーダで駆動する、10万体規模の進化する生態系シミュレーション。
藻(食料)→ 小魚(被食者)→ 捕食魚 の3栄養段階。個体は遺伝子を持ち、繁殖時に突然変異する。

- 設計: Fable 5 / 実装: Opus 4.8 並列エージェント
- スタック: TypeScript + Vite (Deno経由) / 依存ライブラリなし / 日本語UI
- 契約: [src/contracts.ts](src/contracts.ts) が全モジュール共通の型・定数・レイアウトの正。
  GPUバッファ生成とuniformパックは [src/gpu/buffers.ts](src/gpu/buffers.ts) が正。
  **この2ファイルと本書を必ず読んでから実装すること。編集は禁止。**

## 全エージェント共通ルール

1. 自分の担当ファイル以外を **絶対に作成・編集しない**(下の所有権表を参照)。
2. プレースホルダ・TODO・スタブ禁止。完動するコードのみ。
3. 外部依存の追加禁止(npm install等も禁止)。TypeScript strict で型エラーゼロを目指す。
4. WGSL は `src/<module>/wgsl/*.wgsl` に置き、`import src from "./wgsl/x.wgsl?raw"` で読み込む。
5. `deno task typecheck` を実行してよいが、**他モジュール未完成によるimportエラーは無視**し、自分のファイル内のエラーのみ修正する。vite の起動・ビルドはしない(統合担当が行う)。
6. UI文言はすべて日本語。文言は content モジュールの `TEXT`(UIText型)から取得する(content担当以外はハードコードしない)。
7. ワールドはトーラス。距離は必ずラップ距離: `d = pos_b - pos_a; d -= round(d / world) * world;`

## モジュール所有権

| モジュール | 担当 | ファイル |
|---|---|---|
| 契約・基盤 | 統合(編集禁止) | src/contracts.ts, src/gpu/buffers.ts, src/gpu/coords.ts, index.html, src/styles/base.css, vite等設定 |
| シミュレーション | sim | src/sim/simulation.ts, src/sim/wgsl/*.wgsl |
| 描画 | render | src/render/renderer.ts, src/render/wgsl/*.wgsl |
| UI | ui | src/ui/*.ts, src/styles/panel.css |
| 操作 | interaction | src/interaction/*.ts |
| 音響 | audio | src/audio/*.ts |
| コンテンツ | content | src/content/*.ts, README.md |
| 統合 | main | src/main.ts |

## 統合が期待するファクトリ(シグネチャ厳守)

```ts
// src/sim/simulation.ts
export function createSimulation(device: GPUDevice, buffers: SimBuffers): ISimulation;
// src/render/renderer.ts
export function createRenderer(device: GPUDevice, format: GPUTextureFormat,
  buffers: SimBuffers, canvas: HTMLCanvasElement): IRenderer;
// src/interaction/tools.ts
export function createInteraction(device: GPUDevice, buffers: SimBuffers,
  canvas: HTMLCanvasElement, view: ViewTransform): IInteraction;
// src/audio/soundscape.ts
export function createSoundscape(): ISoundscape;
// src/ui/panel.ts
export function createUI(root: HTMLElement, controller: UIController): IUI;
// src/content/index.ts (re-export でも可)
export const SPECIES: [SpeciesDef, SpeciesDef, SpeciesDef];
export const PRESETS: Preset[];           // 6種以上
export const TEXT: UIText;
export function defaultParams(): SimParams; // SPECIES[].params の deep copy, speed=1
export function presetParams(p: Preset): SimParams; // defaults + overrides を deep merge
```

メインループ(統合が実装、参考):
```
per frame:
  spawnReqs = interaction.update(dt)
  sim.requestSpawns(spawnReqs); sim.setParams(params)
  encoder = device.createCommandEncoder()
  for (i < substeps) sim.tick(encoder, fixedDt)   // paused なら 0 回
  renderer.render(encoder, ctx.getCurrentTexture().createView(), sim.currentAgents, time, dt)
  queue.submit([encoder.finish()]); sim.afterSubmit()
  ui.update(sim.stats, fps); audio.update(sim.stats, dt)
```
fixedDt = 1/60 * params.speed。substeps は速度>2 のとき 2。

---

## シミュレーション仕様 (sim 担当)

エージェント構造体・バッファは contracts.ts のコメント参照。ping-pong: tick開始時の
読み側を A、書き側を B とし、tick 終了時に swap(`currentAgents` は常に最新=直近の書き側)。
reset(seed) は `seedWorld(device, buffers, seed)` を呼び、ping-pong を index0 読み側に戻し、
累積カウンタ差分の基準もリセットする。

### 遺伝子のマッピング(behavior 内)
- speedMul = 0.6 + 0.8*genes.x → maxSpeed, accel に乗算
- visionMul = 0.6 + 0.8*genes.y → vision に乗算
- sizeMul = 0.6 + 0.8*genes.z → eatRadius に乗算、metabolism に (0.7+0.6*genes.z) 乗算
- wariMul = 0.5 + 1.0*genes.w → flee に乗算
- 代謝ペナルティ: metabolism × speedMul² (速いほど燃費が悪い=進化のトレードオフ)

### tick のパス実行順(すべて WORKGROUP_SIZE=256)

0. **spawn** dispatch(1): thread i < MAX_SPAWN_REQUESTS。spawnRequests[i] を処理:
   count 回 freelist を pop し、読み側Aに個体を書き flags=1。乱数はハッシュ
   (`pcg/wang hash of (slot, frame, i)`)。処理後 thread0 が header.count=0 に。
   genes は 0.5±0.15、pos は spread 内、energy は req.energy。
1. **clearGrid** dispatch(⌈NUM_CELLS/256⌉): cellCount=0。i==0 のとき counters の
   POP_* (1..3) と GENE_SUM (8..19) を 0 に(FREE_TOP と BIRTHS/DEATHS/EATS は触らない)。
2. **buildGrid** dispatch(⌈MAX/256⌉): flags[i]==1 のとき pos→cell、
   k=atomicAdd(cellCount)、k<CELL_CAPACITY なら cellAgents[cell*CAP+k]=i。
3. **behavior** dispatch(⌈MAX/256⌉): A読み → B書き。flags[i]==1 のみ。近傍探索は
   種の vision に応じ 3x3(vision≦12.5)または 5x5 セル。種別ルール:
   - **藻(0)**: 操舵なし。flow場に強く流され(係数40)、微小ゆらぎ(ハッシュノイズ)、
     速度減衰 ×exp(-2dt)。energy += photoRate*dt。同セル同種数を数え crowd とする。
   - **小魚(1)**: 同種近傍で boids(separation/alignment/cohesion)。捕食魚が視野内
     なら flee(重み×wariMul、距離反比例)。energy<reproThreshold*0.8 のとき視野内の
     最近傍の藻へ seek。eatRadius 内の藻に対し `atomicCompareExchangeWeak(flags[j],1,2)`
     成功で energy+=eatGain, EATS++(1tickにつき1回まで)。
   - **捕食魚(2)**: 同種とは separation のみ強め。視野内の小魚の重心+最近傍個体へ
     seek(hunt)。捕食は小魚と同じ CAS 方式で eatRadius 内の小魚を狩る。
   - **共通**: 障害物 obstacleTex を pos/world の uv でサンプル。値>0.05 で勾配の
     逆方向(±4 world unitの4点サンプルで勾配推定)へ強い斥力+速度×0.9。
     flow場: vel += flowDir*mag*係数*dt(小魚12, 捕食魚8)。
     interaction uniform: isDown==1 のとき tool に応じ:
       ATTRACT: radius内で mouse へ引力(strength×250, 縁で減衰)
       REPEL: 逆向き / VORTEX: 接線方向+弱い引力 / FEAR: 小魚のみ flee 対象に追加
     vel = clamp(vel + steer*accel*dt, maxSpeed*speedMul); pos = wrap(pos+vel*dt)
     energy -= metabolism*speedMul²*(0.7+0.6*genes.z)*dt; age += dt
     B[i] に全フィールド書き込み(seed は LCG で進める)。
4. **death** dispatch(⌈MAX/256⌉): B読み。flags==2 → 回収。flags==1 かつ
   (energy≦0 または age>maxAge) → 回収。回収 = freelist push + flags=0 + DEATHS++。
5. **birth** dispatch(⌈MAX/256⌉): B読み書き。flags[i]==1 かつ energy>reproThreshold
   かつ rand<reproChance*dt かつ 自セルの同種数<crowdLimit のとき:
   freelist pop → 子スロット c。B[c] = 親コピー、pos±3、vel±10%、
   energy=reproCost、親 energy-=reproCost。遺伝子: gene += (rand-0.5)*2*mutation
   (藻は mutation 0.02固定でよい)、clamp(0,1)。flags[c]=1(atomicStore)、BIRTHS++。
6. **census** dispatch(⌈MAX/256⌉): flags==1 → POP_*++、GENE_SUM[sp*4+g] +=
   u32(gene*1024)。
7. 10tickごと: `copyBufferToBuffer(counters → countersStaging)`(staging がマップ中なら
   スキップ)。

### afterSubmit() / stats
staging を `mapAsync(READ)` し、取得後: populations=POP_*、avgGenes=GENE_SUM/1024/pop、
births/deaths/eatsPerSec は累積値の差分÷経過時間(指数移動平均で平滑化)。
simTime を加算し stats に反映。マップ中の多重呼び出しに注意(フラグ管理)。

### 乱数(WGSL)
wang hash / pcg など決定的整数ハッシュを使用。シードは (agent.seed, frame) から。

---

## 描画仕様 (render 担当)

方針: HDR加算合成 + 残像 + ブルームで「深海の発光生態系」。rgba16float 中間ターゲット。
canvas サイズ変更に追従(resize() で再生成)。ワールド→クリップ変換は
`createViewTransform(canvas).worldToClip()`(gpu/coords.ts)の scale/offset を uniform へ。
ワールド矩形の外はレターボックス(黒帯)。

パス構成(推奨、同等以上の見た目なら構成変更可):
1. **trailFade**: trailTex(ping-pong, キャンバス解像度, rgba16float)を
   前フレーム×pow(0.82, dt*60/…)≒0.92/frame で減衰コピー。
2. **agentGlow**: 生存個体を加算ブレンドのソフト円スプライト(半径 = 体長×2.5, α低)
   で trail へ instanced 描画(頂点シェーダで flags==0 は退化三角形に)。
3. **composite→sceneTex**: フルスクリーン: 縦グラデ深海背景 + fbmノイズの淡いオーロラ
   /コースティクス(time でゆっくり流れる。flowTex を歪みに利用すると良い)+
   obstacleTex の岩(暗色+輪郭リムライト)+ trail×強度。
4. **agents**: sceneTex へ instanced 魚形状(6〜10頂点のストリップ。vel 方向に整列、
   尾は sin(time*8+seed) で揺らす。藻は丸い胞子型で energy により明滅)。
   色 = SPECIES[sp].baseColor を遺伝子で変調:
   小魚 hue を speed遺伝子でシアン→紫へ、サイズ遺伝子で明度、age<1s は白発光(誕生)、
   energy 低下で減光。捕食魚は深紅、速度で橙へ。HDR強度(1.5〜4)。
   カーソルブラシリング(interaction uniform 読取、ツール色)もここで。
5. **bloom**: sceneTex → 輝度抽出(threshold≒1.0)→ 5段 downsample blur →
   加算 upsample 合成。
6. **final→swapchain**: ACES トーンマップ、ビネット、微細ノイズグレイン、レターボックス。

SPECIES の baseColor は `src/content/index.ts` から import(型は contracts の SpeciesDef)。
uniform 更新は render() 冒頭で queue.writeBuffer。MAX_AGENTS インスタンス×2パスは許容。

---

## 操作仕様 (interaction 担当)

canvas に pointer イベントを張る。`view.clientToWorld()` でワールド座標へ。
- interaction uniform(32B, contracts参照)を毎フレーム writeBuffer。
- **FOOD**: ドラッグ中 約20Hz で SpawnRequest{species:0, count≒25, spread=brushRadius,
  energy=15} を update() の戻り値で返す(それ以外は空配列)。
- **OBSTACLE/ERASE**: OffscreenCanvas(512x288) に円ブラシで描画/消去(soft edge)。
  dirty 時のみ getImageData→R チャンネルを Uint8Array へ→ writeTexture(r8unorm)。
  ※ bytesPerRow=512 は 256 の倍数なのでそのまま書ける。
- **CURRENT**: OffscreenCanvas(256x144, rgba)。ドラッグ方向ベクトル→
  r=dx*0.5+0.5, g=dy*0.5+0.5, b=強度 を円ブラシで合成(lerp)。dirty時 writeTexture。
  ※ bytesPerRow=256*4=1024 ✓
- clearPaint(): 両キャンバスをクリアし、flow は (128,128,0,255) で埋めて再アップロード。
- ホイールでブラシ半径変更(10〜120)。強度 setStrength 0..1。
- ATTRACT/REPEL/VORTEX/FEAR は uniform を書くだけ(力はシェーダ側)。

## 音響仕様 (audio 担当)

WebAudio のみ(サンプル素材なし)。toggle() 初回で AudioContext 生成+resume。
- アンビエント: 低音ドローン(検波2〜3osc, 55/82.5/110Hz 近辺, ゆっくりLFO)+
  帯域通過ノイズの潮騒。小魚個体数(0〜4万)でフィルタ明るさ/コード変化。
- イベント(update内で stats のレート差分から確率的にスケジュール):
  eatsPerSec → 短い水滴プラック(sine ping, ランダムピッチ)。捕食魚の狩り
  (eats高騰時)は低いドスン。birthsPerSec → 柔らかい鈴。個体数急落 → 低い唸り。
- setVolume はマスターゲイン。CPU軽量に(常時ノード数を一定に保つ)。

## UI仕様 (ui 担当)

すべて #ui-root 内に DOM 生成(pointer-events: auto を要素ごとに)。文言は
`import { TEXT, SPECIES, PRESETS } from "../content/index"`。スタイルは
src/styles/panel.css(ダークガラスモーフィズム、シアン基調、日本語書体)。
- **左上HUD**: FPS / シミュ時間 / 種別個体数(色ドット付き, 4Hz更新)。
- **左端ツールバー(縦)**: Tool 全9種のボタン(絵文字かinline SVG)+ツールチップ
  (TEXT.toolNames/toolHints)。下にブラシ半径・強度の縦スライダー。
  syncToolSelection() で外部変更を反映。
- **右パネル(折りたたみ可)**: 種タブ(3)→ PARAM_META から onlySpecies に従い
  スライダー生成(ラベル TEXT.paramLabels[key]、値表示付き、input で
  controller.setSpeciesParam)。プリセット節: PRESETS をカード表示→ applyPreset。
  下部: 速度スライダー(0.25〜4)、一時停止/再開、リセット、サウンドON/OFF+音量。
- **下部中央**: 個体数チャート(Canvas2D, 幅~640px, 直近120s, 種別色ライン,
  現在値ラベル)。种が絶滅(pop→0)したら TEXT.extinction のトースト表示。
- **キーボード**: Space=pause, R=リセット, 1..9=ツール, [ ]=ブラシ半径。
  window keydown で controller を呼び syncToolSelection を更新。
- update(stats, fps) は内部で 250ms に間引いてDOM更新(チャートは毎回追記)。

## コンテンツ仕様 (content 担当)

src/content/index.ts(species.ts / presets.ts / text.ts に分割し re-export 推奨)。
- SPECIES 3種: 名前(藻/小魚/捕食魚 — もっと詩的な和名も可。例:「光藻」「銀鱗」「紅牙」)、
  説明文、baseColor(線形RGB, HDR係数込み。例 藻[0.1,1.2,0.5] 小魚[0.3,1.5,2.2]
  捕食魚[2.5,0.35,0.3])、params 既定値。
- 既定パラメータの出発点(調整可、生態系が数分間安定振動することが目標):
  - 藻: maxSpeed6 accel20 vision8 sep0.3 align0 coh0 flee0 seek0 eatR0 eatGain0
    metab0.4 reproTh30 reproCost12 reproCh0.5 mut0.02 maxAge80 photo6 crowd10
  - 小魚: maxSpeed85 accel260 vision14 sep1.4 align1.0 coh0.8 flee3.2 seek1.2
    eatR3.5 eatGain14 metab2.2 reproTh70 reproCost30 reproCh0.8 mut0.08 maxAge70
    photo0 crowd22
  - 捕食魚: maxSpeed105 accel220 vision24 sep1.8 align0.3 coh0.2 flee0 seek2.4
    eatR5 eatGain55 metab3.0 reproTh160 reproCost70 reproCh0.35 mut0.08 maxAge110
    photo0 crowd6
- PRESETS 6種以上: 「大群泳」(小魚6万・捕食0・群れ多数)「狩りの時間」(捕食800)
  「進化の箱庭」(mutation高め・中規模)「藻の楽園」「絶滅の淵」(捕食過多)
  「嵐の海」(高速・高加速のカオス)。各 seed と overrides を調整。
- TEXT: UIText 全キー。日本語で、短く詩的に。README.md(操作説明・技術解説)も担当。

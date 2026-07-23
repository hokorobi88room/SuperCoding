# 『神の観察 (Deus Ex Vita)』設計書 — v2

各個体が**進化するニューラルネットの脳**を持つ人工生命シミュレータ。人間は数値を弄らず、
**神**として御業ツールで介入し、生命の進化・文化・文明の創発を観察する。

- 設計: Fable 5 / 実装: Opus 4.8 並列 / TypeScript+Vite+WGSL / 依存なし / 日本語UI
- ターゲット: Mac mini ローカル最大限(テストは iGPU なので個体数を絞って検証可能に)
- 契約: [src/v2/contracts2.ts](src/v2/contracts2.ts) と [src/v2/buffers2.ts](src/v2/buffers2.ts) が正。**編集禁止・熟読必須。**
- v1(`src/` 直下)は参照用に残す。v2 は全て `src/v2/` に置き、index.html は最後に統合担当が v2 へ差し替える。

## 全エージェント共通ルール
1. 担当ファイル以外を作成・編集しない。2. プレースホルダ/TODO/スタブ禁止、完動コードのみ。
3. 外部依存追加・vite起動禁止(devサーバは統合担当が監視、保存でHMR)。4. TypeScript strict。
5. WGSLは `src/v2/<module>/wgsl/*.wgsl`、`import s from "./wgsl/x.wgsl?raw"`。
6. WGSL予約語注意(`mut`等)。`textureSample`は非uniform制御フロー禁止→`textureSampleLevel`。
7. トーラス距離: `d -= round(d/WORLD)*WORLD`。8. UI文言は content2 の `TEXT` から。ハードコード禁止。
9. 完了前に `deno task typecheck`(自分のファイルのエラーゼロ。他モジュール未実装のimportエラーは無視)。

## モジュール所有権
| モジュール | 担当 | ファイル |
|---|---|---|
| 契約・基盤 | Fable(編集禁止) | src/v2/contracts2.ts, buffers2.ts, coords2.ts |
| 神経シミュ+文化 | sim | src/v2/sim2/simulation2.ts, src/v2/sim2/wgsl/*.wgsl |
| 描画 | render | src/v2/render2/renderer2.ts, src/v2/render2/wgsl/*.wgsl |
| 神視点UI+年代記 | ui | src/v2/ui2/*.ts, src/v2/chronicle2/chronicle.ts, src/v2/styles2.css |
| 神の御業+音 | inter | src/v2/interaction2/divine.ts, src/v2/audio2/soundscape2.ts |
| コンテンツ | content | src/v2/content2/*.ts |
| 統合 | Fable | src/v2/main2.ts |

## 統合が期待するファクトリ(厳守)
```ts
export function createSimulation2(device, buffers: SimBuffers2): ISimulation2;       // sim2/simulation2.ts
export function createRenderer2(device, format, buffers, canvas): IRenderer2;        // render2/renderer2.ts
export function createDivine(device, buffers, canvas, view): IDivine;                // interaction2/divine.ts
export function createSoundscape2(): ISoundscape2;  // 音: enabled/toggle()/setVolume/update(stats,dt)
export function createObservatory(root, controller: GodController): IObservatory;    // ui2/observatory.ts
export function createChronicler(): IChronicler;                                     // chronicle2/chronicle.ts
export const TEXT: UIText2; export const GENESIS: GenesisSpec; export const TRIBE_PALETTE: [number,number,number][]; // content2/index.ts
```
`ISoundscape2` は `readonly enabled; toggle():Promise<boolean>; setVolume(v); update(stats:WorldStats,dt)`。

メインループ(統合実装):
```
spawns = divine.update(dt); sim.requestSpawns(spawns); sim.setConfig(cfg)
enc = device.createCommandEncoder()
if(!paused) for(i<substeps) sim.tick(enc, fixedDt)
renderer.render(enc, view, sim.currentCreatures, sim.currentSignal, sim.structureGrid, time, dt)
queue.submit([enc.finish()]); sim.afterSubmit()
events = chronicler.observe(sim.stats); ui.pushEvents(events); ui.update(sim.stats, fps); audio.update(sim.stats, dt)
```

---

## 神経シミュレーション (sim 担当)

構造体・バッファは contracts2.ts のコメント参照。ping-pong は creatureData と signalField の**両方**。
`currentCreatures`/`currentSignal` は常に直近の書き側。reset(g) は `seedGenesis()` を呼び ping-pong を index0 へ。
setConfig は `packConfig()`(buffers2)で config uniform へ writeBuffer(dt/time/frame も毎tick)。

### tick パス順(全 WORKGROUP_SIZE=256)
0. **spawn** dispatch(1): spawnRequests を処理(神の恵み=食料)。freelist pop→creatureA へ role=FOOD 個体を書き flags=1。thread0 が header.count=0。
1. **clearGrid** dispatch(⌈NUM_CELLS/256⌉): cellCount=0。i==0 で POP_*(1,2)と SUM_*(8..13)を0(FREE_TOP/BIRTHS/DEATHS/EATS/KILLS/BUILDS は触らない)。
2. **buildGrid** dispatch(⌈MAX/256⌉): flags==1 を creatureA.pos→cell へ登録。
3. **behavior** dispatch(⌈MAX/256⌉): creatureA読み→creatureB書き。flags==1 のみ。
   - **food(role=0)**: 操舵なし。flow場に流され+微小ゆらぎ+速度減衰。energy += photo(=4/s)。信号場 g(食料の匂い)を signalAccum へ atomicAdd。障害物斥力。energy 上限35。
   - **creature(role=1)**:
     a. **buildSenses**: contracts2 の NIN=16 入力を組み立てる。近傍探索は 3x3 セル。最寄り食料/最寄り他個体/近傍平均進行/密度を集める。kinship = 1-距離(gene+meme)。信号場は `textureSampleLevel(sigRead, samp, pos/WORLD)` の r(culture)と b(danger)。
     b. **脳フォワード**: brainWeights[slot*BRAIN_STRIDE+..] を読み `h=tanh(W1·x+B1); o=tanh(W2·h+B2)`。ループ展開でよい(NIN/NHID/NOUT小)。
     c. **行動適用**:
       - 操舵: steer=vec2(o0,o1); maxSpeed=(70 + 60*size)*(0.75+0.5*(o7*0.5+0.5)); accel=260。
       - eat(o2>0.2): eatRadius=4+3*size 内の最寄り食料を `atomicCompareExchangeWeak(flags[j],1,2)`。成功で energy+=14, EATS++。
       - attack(o4>0.3 かつ diet>0.35): eatRadius 内の他 creature を同方式で捕食。成功で energy += 20+30*diet, KILLS++, その cell の signal b(danger)を大きく atomicAdd。被食側 flags=2。
       - reproduce(o3>0.4 かつ energy>reproThreshold=90): birthパスに委ねず**ここでは繁殖フラグを立てない**。繁殖は専用パスで行う(下記 birth)。ここでは o3 を creatureB.signalMem 等に退避し energy 条件のみ後段で使う…ではなく、簡潔化のため **birthパスで o3 を再計算せず、behaviorが reproduce 意図を creatureB の未使用ビットに保存**するのは複雑。→ 方針: behavior で reproduce 条件成立時に `size` はいじらず、`signalMem` に「繁殖意図>0」を格納(例 signalMem = o3)。birthパスが signalMem>0.4 && energy>閾 で繁殖。
       - emit(o5): relu(o5) を signal r(culture)として自 cell に atomicAdd。emit>0.1 を SUM_EMIT に加算(×1024)。
       - meme ドリフト: meme += (o6)*0.02 の微小自己変調 + 近傍の高エネルギー個体の meme を lerp(水平伝播, 係数0.03*kinship)。clamp[0,1]。
       - diet の進化は繁殖時のみ(behaviorでは変えない)。
     d. 神の御業(interaction uniform, isDown==1): BLESS=CPUがspawn / SMITE=範囲内 flags=2 / BECKON=引力 / REPEL=斥力 / MAELSTROM=渦 / FEARなし。BARRIER/ERASE/CURRENT は CPU がテクスチャ描画。
     e. 障害物斥力 + flow場 + 積分: vel=clamp(vel+steer*accel*dt+ext*dt, maxSpeed); pos=wrap(pos+vel*dt); age+=dt; energy -= (0.9 + 1.6*size + 2.2*diet + 0.6*speed²)*dt(代謝)。energy 上限=reproThreshold*1.6。
     f. SUM_DIET/AGGR(relu o4)/SOCIAL(density)/SPEED/SIZE を ×1024 で atomicAdd。
     g. seed を LCG 前進。creatureB[i] = 全フィールド。
4. **signalBake** dispatch(⌈SIG_W*SIG_H/256⌉): 各texel `field_write = decay * blur5(field_read) + accum/1024`; clamp[0,8]; accum=0。decay=exp(-signalDecay*dt)。blur は上下左右+中心の5タップ。書き込みは storage texture(`textureStore`)。read は `textureLoad`。
5. **death** dispatch(⌈MAX/256⌉): flags==2→回収(freelist push, flags=0, DEATHS++, その cell に danger 沈着)。flags==1 かつ (energy<=0 || age>maxAge=90+40*size) →回収。
6. **birth** dispatch(⌈MAX/256⌉): flags==1 かつ creatureB.signalMem>0.4 かつ energy>reproThreshold のとき: freelist pop→子c。子 = 親コピー、pos±4、energy=reproCost=45、親energy-=reproCost、age=0。
   - **神経進化**: 子の脳 = 親の脳 + gauss()*mutation*0.4(全408重み)。brainWeights[c] へ書く。
   - **遺伝進化**: diet/size に ±mutation*0.15 の変異、clamp[0,1]。meme も微小変異。lineage は親コピー+微小ドリフト(±0.01)。
   - signalMem=0 に戻す。flags[c]=1(atomicStore)。BIRTHS++。
   ※ birthパスは creatureB を読み書き。親の脳読み込みは brainWeights[parent]。
7. **structBake**(civ有効時のみ dispatch、無効なら skip): structAccum を structureGrid へ焼き込み(緩やか減衰)、accum=0。※stage1では civ=false なので実質no-op。build行動自体は behavior の attack/emit と別に、civ時のみ「余剰energyの個体が自cellに構造沈着(structAccum atomicAdd)」を behavior 内で行う。BUILDS++。
8. **census** dispatch(⌈MAX/256⌉): flags==1 を role別に POP_*++。
9. 10tickごと counters→countersStaging コピー(マップ中skip)。同時に creatureB の先頭 SAMPLE_COUNT 個体の {meme.xyzw, lineage, diet, energy, role} を sampleStaging へ(専用 dispatch か copyBufferToBuffer では構造体stride不一致なので、**sample収集用の小 compute パス**で sampleStaging 相当の storage バッファに詰める→コピー)。簡潔化: sample は creatureData から該当フィールドだけを別 storage に書く sampleGather パスを用意し、それを sampleStaging へコピー。

### afterSubmit / stats
countersStaging を mapAsync。populations=POP_*、rates=累積差分÷経過(EMA)。avg* = SUM_*/1024/POP_CREATURE。
epoch = floor(累積BIRTHS / max(1,初期creature数)) など目安。tribes は sampleStaging の meme を CPU で軽量クラスタリング(グリッド量子化してユニークセル数、上限32)。reset世代ガードで古い読み戻し破棄。

### 乱数(WGSL)
pcg/wang ハッシュ。seed を毎tick LCG 前進。

---

## 描画 (render 担当)
「神が見下ろす生命の海」。HDR+残像+ブルーム(v1の美学を踏襲)。中間ターゲット rgba16float。setQuality(0/1/2)で
bloom/trail解像度を可変(0=bloom無し・trail半分, 1=標準, 2=強bloom)。resize で全ターゲット再生成。
- **信号場の可視化**: signalField を背景レイヤーとして描く。r(culture)を各部族色(TRIBE_PALETTE を lineage/meme で選択)に、b(danger)を赤みに。これが「文化の縄張り・フェロモンの道」に見える主役演出。`textureSampleLevel` で歪ませ発光。
- **structureGrid**: civ有効時、建造物を明るいグリッド模様で重畳。
- **生命の描画**: creatureData を instanced 描画。flags!=1 は退化。色 = lineage(始祖色相 HSV)× meme(文化の微調整)× diet(草食=寒色寄り, 肉食=暖色/赤)。size で大きさ、age<1s 白発光(誕生)、energy低で減光。捕食者(diet>0.6)は鋭い形、草食は丸い。食料(role=0)は小さな緑の胞子で明滅。
- 背景: 深い宇宙/深海のグラデ+微fbm。神の視点を感じる広がり。カーソルに神の御業リング(ツール色)。
- 最終: ACESトーンマップ+ビネット+微グレイン+黒レターボックス。座標は coords2 の worldToClip。
- パイプライン/バインドは初期化時に全生成、render内生成はresize時のみ。creatures/signal の GPUBuffer/Texture 同一性でbind groupを2組キャッシュ(ping-pong対応)。

## 神の御業 (inter 担当: divine.ts)
v1 tools を神視点に再構成。canvas pointer + wheel(半径)。interaction uniform(32B: mouse.xy,radius,strength,tool u32,isDown u32,pad)を毎フレーム writeBuffer(mouseはworld座標)。
- BLESS: ドラッグ中20Hzで SpawnRequest{role:FOOD,count:25,spread:radius,energy:16}。
- SMITE/BECKON/REPEL/MAELSTROM: uniform書くだけ(力はシェーダ)。
- BARRIER/ERASE: OffscreenCanvas(512x288)円ブラシ→r8unorm(bytesPerRow=512)。ERASEはdestination-out→アルファ抽出。
- CURRENT: OffscreenCanvas(256x144)方向色→rgba8unorm(bytesPerRow=1024)。
- clearPaint: 障害物消去+flow中立(128,128,0,255)再アップロード。OBSERVE時はisDown=0固定。
音(soundscape2.ts): WebAudioのみ。生命の総数・誕生・捕食・大量死に反応する生成アンビエント。toggle()初回でAudioContext生成+resume。詳細はv1音仕様に準拠。

## 神視点UI+年代記 (ui 担当)
数値スライダーは作らない(神は数値を弄らない)。全て #ui-root。文言は content2 の TEXT。スタイル styles2.css(荘厳な暗色+金/白の細字、神託感)。
- **左上 神託HUD**: タイトル「神の観察」+ FPS + 世代(epoch)+ 個体数(生命/食料)+ 部族数。
- **左端 御業パレット(縦)**: Divine 全9種のボタン(絵文字/SVG)+ツールチップ。下に半径・強度スライダー(これは"神の手の大きさ"であり生態パラメータではないのでOK)。syncTool で外部変更反映。
- **右 系譜パネル(折りたたみ, 初期は畳む)**: 平均形質バー(diet 草食⇄肉食, aggression, social, speed, culture, size を stats から)。部族数と代表色(TRIBE_PALETTE)。
- **下 年代記(Chronicle)**: 中央下に、創発イベントを時刻付きで流す荘厳なログ(最新が上、フェードイン、最大8行)。ui.pushEvents で追記。kind ごとに色/アイコン。
- **設定(小)**: 速度(0.25〜4), 一時停止/再開, 創世(genesis), 文明ステージ ON/OFF, 画質3段, 音ON/OFF+音量。
- **タイトル演出**: 起動時と創世時に画面中央へ「神の観察」+subtitle を大きく出し3秒でフェード(pointer-events:none)。
- キーボード: Space=停止, G=創世, 1..9=御業, [ ]=半径。update(stats,fps)は250msに間引き。

## 年代記検出 (ui担当: chronicle2/chronicle.ts)
`observe(stats)`が前回stateとの差分から ChronicleEvent を生成(TEXT.chronicle テンプレをランダム選択し {n}/{t} 置換):
- genesis(reset直後), bloom(生命が急増), crash(急減), extinction(生命<初期の5%), carnivore(avgDiet>0.55へ上昇), herbivore(avgDiet<0.35へ低下), tribe(tribes が増えて安定), civilization(buildsPerSec>0 初回)。
連続発火を防ぐクールダウンと閾値ヒステリシスを持つ。reset()で状態クリア。

## コンテンツ (content 担当)
content2/index.ts から TEXT(UIText2 全キー・日本語で荘厳に詩的), GENESIS(初期世界: 例 food 9000 / creatures 2500 / clusters 6。iGPUでも動く規模), TRIBE_PALETTE(32色, 視認性の高い多様な色相のHDR線形RGB)を export。
年代記テンプレ TEXT.chronicle は各 kind に3〜5文のバリエーション。神が世界を見つめて綴る一行叙事詩。
README2.md も作成(神の観察の世界観・操作・技術=神経進化/信号場/ミーム文化の解説)。

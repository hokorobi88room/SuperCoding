/**
 * 描画エンジン v2 — 「神が見下ろす生命の海」を HDR + 残像 + ブルームで描く。
 * パス構成: trailFade → creatureGlow → background(信号場+建造+障壁+残像) →
 *           creatures(本体) → bloom(bright/down/up) → final(トーンマップ+リング)。
 * 中間ターゲットは rgba16float。resize()/setQuality() で全ターゲットを再生成。
 *
 * 主役演出は信号フェロモン場の可視化(文化=部族色の縄張り・道、危険=赤み)。
 * creatures は creatureData を instanced 描画し、lineage×diet×meme で染める。
 * 所有: render 担当。
 */
import {
  type IRenderer2,
  MAX_CREATURES,
  ROLE_CREATURE,
  ROLE_FOOD,
  type SimBuffers2,
  STRUCT_H,
  STRUCT_W,
  WORLD_H,
  WORLD_W,
} from "../contracts2";
import { createViewTransform2 } from "../coords2";
import { TRIBE_PALETTE } from "../content2/index";

import common2Src from "./wgsl/common2.wgsl?raw";
import trailFadeSrc from "./wgsl/trailfade.wgsl?raw";
import glowSrc from "./wgsl/glow.wgsl?raw";
import backgroundSrc from "./wgsl/background.wgsl?raw";
import creaturesSrc from "./wgsl/creatures.wgsl?raw";
import bloomSrc from "./wgsl/bloom.wgsl?raw";
import finalSrc from "./wgsl/final.wgsl?raw";

const HDR_FORMAT: GPUTextureFormat = "rgba16float";
const BLOOM_MIPS = 5;
const TRAIL_FADE_BASE = 0.9; // /frame (60fps基準)

// contracts2 由来の const を WGSL 先頭に連結(定数の drift を防ぐ)。
const WGSL_CONSTS = `
const ROLE_FOOD : u32 = ${ROLE_FOOD}u;
const ROLE_CREATURE : u32 = ${ROLE_CREATURE}u;
const STRUCT_W : f32 = ${STRUCT_W}.0;
const STRUCT_H : f32 = ${STRUCT_H}.0;
`;

interface Tex {
  tex: GPUTexture;
  view: GPUTextureView;
}

interface CreatureBG {
  glow: GPUBindGroup;
  body: GPUBindGroup;
}

export function createRenderer2(
  device: GPUDevice,
  format: GPUTextureFormat,
  buffers: SimBuffers2,
  canvas: HTMLCanvasElement,
): IRenderer2 {
  const view = createViewTransform2(canvas);

  // ---- 静的 uniform / パレット ----
  const uniformBuf = device.createBuffer({
    size: 64,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const uniformData = new Float32Array(16);

  // 部族色パレット(array<vec4f,32> = 512B)。lineage/meme→縄張り色に使う。
  const paletteBuf = device.createBuffer({
    size: 32 * 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  {
    const pal = new Float32Array(32 * 4);
    const n = TRIBE_PALETTE.length;
    for (let i = 0; i < 32; i++) {
      const c = TRIBE_PALETTE[n > 0 ? i % n : 0] ?? [0.6, 0.6, 0.6];
      pal[i * 4 + 0] = c[0];
      pal[i * 4 + 1] = c[1];
      pal[i * 4 + 2] = c[2];
      pal[i * 4 + 3] = 1;
    }
    device.queue.writeBuffer(paletteBuf, 0, pal);
  }

  const clampSampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
  });
  const wrapSampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
    addressModeU: "repeat",
    addressModeV: "repeat",
  });

  // ---- シェーダモジュール(consts + common を連結) ----
  const mod = (src: string) =>
    device.createShaderModule({
      code: WGSL_CONSTS + "\n" + common2Src + "\n" + src,
    });
  const trailFadeMod = mod(trailFadeSrc);
  const glowMod = mod(glowSrc);
  const backgroundMod = mod(backgroundSrc);
  const creaturesMod = mod(creaturesSrc);
  const bloomMod = mod(bloomSrc);
  const finalMod = mod(finalSrc);

  const ADD: GPUBlendState = {
    color: { srcFactor: "one", dstFactor: "one", operation: "add" },
    alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
  };

  // ---- 背景パスは r32float(structureGrid)を含むため明示レイアウト ----
  const bgLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      { binding: 6, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "unfilterable-float" } },
      { binding: 7, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      { binding: 8, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
    ],
  });
  const bgPipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bgLayout],
  });

  // ---- パイプライン(初期化時に全生成) ----
  const trailFadePipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: trailFadeMod, entryPoint: "vs_full" },
    fragment: {
      module: trailFadeMod,
      entryPoint: "fs_fade",
      targets: [{ format: HDR_FORMAT }],
    },
    primitive: { topology: "triangle-list" },
  });

  const glowPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: glowMod, entryPoint: "vs_glow" },
    fragment: {
      module: glowMod,
      entryPoint: "fs_glow",
      targets: [{ format: HDR_FORMAT, blend: ADD }],
    },
    primitive: { topology: "triangle-strip" },
  });

  const backgroundPipeline = device.createRenderPipeline({
    layout: bgPipelineLayout,
    vertex: { module: backgroundMod, entryPoint: "vs_full" },
    fragment: {
      module: backgroundMod,
      entryPoint: "fs_bg",
      targets: [{ format: HDR_FORMAT }],
    },
    primitive: { topology: "triangle-list" },
  });

  const creaturesPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: creaturesMod, entryPoint: "vs_creatures" },
    fragment: {
      module: creaturesMod,
      entryPoint: "fs_creatures",
      targets: [{ format: HDR_FORMAT, blend: ADD }],
    },
    primitive: { topology: "triangle-strip" },
  });

  const brightPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: bloomMod, entryPoint: "vs_full" },
    fragment: {
      module: bloomMod,
      entryPoint: "fs_bright",
      targets: [{ format: HDR_FORMAT }],
    },
    primitive: { topology: "triangle-list" },
  });

  const downPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: bloomMod, entryPoint: "vs_full" },
    fragment: {
      module: bloomMod,
      entryPoint: "fs_down",
      targets: [{ format: HDR_FORMAT }],
    },
    primitive: { topology: "triangle-list" },
  });

  const upPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: bloomMod, entryPoint: "vs_full" },
    fragment: {
      module: bloomMod,
      entryPoint: "fs_up",
      targets: [{ format: HDR_FORMAT, blend: ADD }],
    },
    primitive: { topology: "triangle-list" },
  });

  const finalPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: finalMod, entryPoint: "vs_full" },
    fragment: {
      module: finalMod,
      entryPoint: "fs_final",
      targets: [{ format }],
    },
    primitive: { topology: "triangle-list" },
  });

  // ---- 品質設定 ----
  let quality: 0 | 1 | 2 = 1;
  const bloomStrengthFor = (q: 0 | 1 | 2): number =>
    q === 0 ? 0 : q === 2 ? 0.95 : 0.55;
  const trailScaleFor = (q: 0 | 1 | 2): number => (q === 0 ? 0.5 : 1);

  // ---- リサイズ依存リソース ----
  let pw = 1; // scene 解像度(描画ピクセル)
  let ph = 1;
  let tw = 1; // trail 解像度(品質で半分になりうる)
  let th = 1;
  let trail: [Tex, Tex] | null = null;
  let scene: Tex | null = null;
  let bloom: Tex[] = [];
  let trailFadeBG: [GPUBindGroup, GPUBindGroup] | null = null;
  let brightBG: GPUBindGroup | null = null;
  let downBG: GPUBindGroup[] = [];
  let upBG: GPUBindGroup[] = [];
  let finalBG: GPUBindGroup | null = null;

  let trailSrc = 0; // 現在の trail 読み側
  let time = 0;

  // creatureData バッファ毎に glow/body バインドグループをキャッシュ(ping-pong 2組)
  const creatureBGCache = new Map<GPUBuffer, CreatureBG>();
  const creatureBGFor = (creatures: GPUBuffer): CreatureBG => {
    let bg = creatureBGCache.get(creatures);
    if (bg) return bg;
    const entries: GPUBindGroupEntry[] = [
      { binding: 0, resource: { buffer: uniformBuf } },
      { binding: 1, resource: { buffer: creatures } },
      { binding: 2, resource: { buffer: buffers.aliveFlags } },
    ];
    bg = {
      glow: device.createBindGroup({
        layout: glowPipeline.getBindGroupLayout(0),
        entries,
      }),
      body: device.createBindGroup({
        layout: creaturesPipeline.getBindGroupLayout(0),
        entries,
      }),
    };
    creatureBGCache.set(creatures, bg);
    return bg;
  };

  // 背景バインドグループ: signalField 毎に [trailSrc用, trailDst用] をキャッシュ。
  // resize で trail が変わるため resize 時に破棄する。
  const bgCache = new Map<GPUTexture, [GPUBindGroup, GPUBindGroup]>();
  const backgroundBGFor = (
    signal: GPUTexture,
    structures: GPUTexture,
    trailIdx: number,
  ): GPUBindGroup => {
    let pair = bgCache.get(signal);
    if (!pair) {
      const make = (k: number) =>
        device.createBindGroup({
          layout: bgLayout,
          entries: [
            { binding: 0, resource: { buffer: uniformBuf } },
            { binding: 1, resource: { buffer: paletteBuf } },
            { binding: 2, resource: clampSampler },
            { binding: 3, resource: wrapSampler },
            { binding: 4, resource: trail![k].view },
            { binding: 5, resource: signal.createView() },
            { binding: 6, resource: structures.createView() },
            { binding: 7, resource: buffers.obstacleTex.createView() },
            { binding: 8, resource: buffers.flowTex.createView() },
          ],
        });
      pair = [make(0), make(1)];
      bgCache.set(signal, pair);
    }
    return pair[trailIdx];
  };

  const makeTex = (w: number, h: number): Tex => {
    const tex = device.createTexture({
      size: [w, h],
      format: HDR_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    return { tex, view: tex.createView() };
  };

  const rebuildTargets = (): void => {
    // 旧ターゲット破棄
    if (trail) {
      trail[0].tex.destroy();
      trail[1].tex.destroy();
    }
    if (scene) scene.tex.destroy();
    for (const b of bloom) b.tex.destroy();
    bgCache.clear(); // 背景BGは trail を参照するので無効化

    const ts = trailScaleFor(quality);
    tw = Math.max(1, Math.round(pw * ts));
    th = Math.max(1, Math.round(ph * ts));

    trail = [makeTex(tw, th), makeTex(tw, th)];
    scene = makeTex(pw, ph);
    bloom = [];
    for (let i = 0; i < BLOOM_MIPS; i++) {
      const w = Math.max(1, pw >> (i + 1));
      const h = Math.max(1, ph >> (i + 1));
      bloom.push(makeTex(w, h));
    }
    trailSrc = 0;

    // trailFade: trail[k] をサンプル
    trailFadeBG = [
      device.createBindGroup({
        layout: trailFadePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniformBuf } },
          { binding: 1, resource: clampSampler },
          { binding: 2, resource: trail[0].view },
        ],
      }),
      device.createBindGroup({
        layout: trailFadePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniformBuf } },
          { binding: 1, resource: clampSampler },
          { binding: 2, resource: trail[1].view },
        ],
      }),
    ];

    // bloom bright: scene をサンプル
    brightBG = device.createBindGroup({
      layout: brightPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: clampSampler },
        { binding: 1, resource: scene.view },
      ],
    });

    downBG = [];
    for (let i = 0; i < BLOOM_MIPS - 1; i++) {
      downBG.push(
        device.createBindGroup({
          layout: downPipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: clampSampler },
            { binding: 1, resource: bloom[i].view },
          ],
        }),
      );
    }
    upBG = [];
    for (let i = 0; i < BLOOM_MIPS; i++) {
      upBG.push(
        device.createBindGroup({
          layout: upPipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: clampSampler },
            { binding: 1, resource: bloom[i].view },
          ],
        }),
      );
    }

    // final: scene + bloom[0] + interaction
    finalBG = device.createBindGroup({
      layout: finalPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuf } },
        { binding: 1, resource: clampSampler },
        { binding: 2, resource: scene.view },
        { binding: 3, resource: bloom[0].view },
        { binding: 4, resource: { buffer: buffers.interaction } },
      ],
    });
  };

  const resize = (width: number, height: number, dpr: number): void => {
    pw = Math.max(1, Math.round(width * dpr));
    ph = Math.max(1, Math.round(height * dpr));
    rebuildTargets();
  };

  const setQuality = (q: 0 | 1 | 2): void => {
    if (q === quality) return;
    quality = q;
    rebuildTargets(); // trail 解像度が変わりうるので再生成
  };

  // 初期サイズ(main が正式な resize を呼ぶまでの保険)
  resize(canvas.width || 1, canvas.height || 1, 1);

  const render = (
    encoder: GPUCommandEncoder,
    target: GPUTextureView,
    creatures: GPUBuffer,
    signal: GPUTexture,
    structures: GPUTexture,
    t: number,
    dt: number,
  ): void => {
    time = t;
    if (!trail || !scene || !trailFadeBG || !brightBG || !finalBG) return;

    // uniform 更新
    const wc = view.worldToClip();
    const fade = Math.pow(TRAIL_FADE_BASE, Math.min(4, dt * 60));
    const bloomStr = bloomStrengthFor(quality);
    uniformData[0] = wc.scale[0];
    uniformData[1] = wc.scale[1];
    uniformData[2] = wc.offset[0];
    uniformData[3] = wc.offset[1];
    uniformData[4] = pw;
    uniformData[5] = ph;
    uniformData[6] = WORLD_W;
    uniformData[7] = WORLD_H;
    uniformData[8] = time;
    uniformData[9] = dt;
    uniformData[10] = fade;
    uniformData[11] = bloomStr;
    uniformData[12] = quality;
    device.queue.writeBuffer(uniformBuf, 0, uniformData);

    const cbg = creatureBGFor(creatures);
    const src = trailSrc;
    const dst = 1 - src;

    // 1. trailFade: trail[src] を減衰して trail[dst] へ
    {
      const p = encoder.beginRenderPass({
        colorAttachments: [{
          view: trail[dst].view,
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        }],
      });
      p.setPipeline(trailFadePipeline);
      p.setBindGroup(0, trailFadeBG[src]);
      p.draw(3);
      p.end();
    }

    // 2. creatureGlow: 生存個体のソフト円を trail[dst] へ加算
    {
      const p = encoder.beginRenderPass({
        colorAttachments: [{
          view: trail[dst].view,
          loadOp: "load",
          storeOp: "store",
        }],
      });
      p.setPipeline(glowPipeline);
      p.setBindGroup(0, cbg.glow);
      p.draw(4, MAX_CREATURES);
      p.end();
    }

    // 3. background: 信号場+建造+障壁+残像を sceneTex へ
    {
      const p = encoder.beginRenderPass({
        colorAttachments: [{
          view: scene.view,
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        }],
      });
      p.setPipeline(backgroundPipeline);
      p.setBindGroup(0, backgroundBGFor(signal, structures, dst));
      p.draw(3);
      p.end();
    }

    // 4. creatures: 生命の本体を sceneTex へ加算
    {
      const p = encoder.beginRenderPass({
        colorAttachments: [{
          view: scene.view,
          loadOp: "load",
          storeOp: "store",
        }],
      });
      p.setPipeline(creaturesPipeline);
      p.setBindGroup(0, cbg.body);
      p.draw(4, MAX_CREATURES);
      p.end();
    }

    // 5. bloom(品質0では省略)
    if (bloomStr > 0) {
      // 5a. bright: scene → bloom[0]
      {
        const p = encoder.beginRenderPass({
          colorAttachments: [{
            view: bloom[0].view,
            loadOp: "clear",
            storeOp: "store",
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
          }],
        });
        p.setPipeline(brightPipeline);
        p.setBindGroup(0, brightBG);
        p.draw(3);
        p.end();
      }
      // 5b. down: bloom[i] → bloom[i+1]
      for (let i = 0; i < BLOOM_MIPS - 1; i++) {
        const p = encoder.beginRenderPass({
          colorAttachments: [{
            view: bloom[i + 1].view,
            loadOp: "clear",
            storeOp: "store",
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
          }],
        });
        p.setPipeline(downPipeline);
        p.setBindGroup(0, downBG[i]);
        p.draw(3);
        p.end();
      }
      // 5c. up: bloom[i] → bloom[i-1](加算)
      for (let i = BLOOM_MIPS - 1; i >= 1; i--) {
        const p = encoder.beginRenderPass({
          colorAttachments: [{
            view: bloom[i - 1].view,
            loadOp: "load",
            storeOp: "store",
          }],
        });
        p.setPipeline(upPipeline);
        p.setBindGroup(0, upBG[i]);
        p.draw(3);
        p.end();
      }
    }

    // 6. final: scene + bloom → swapchain
    {
      const p = encoder.beginRenderPass({
        colorAttachments: [{
          view: target,
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        }],
      });
      p.setPipeline(finalPipeline);
      p.setBindGroup(0, finalBG);
      p.draw(3);
      p.end();
    }

    trailSrc = dst;
  };

  return { resize, render, setQuality };
}

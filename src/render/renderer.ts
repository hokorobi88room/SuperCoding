/**
 * 描画エンジン — 「深海の発光生態系」を HDR + 残像 + ブルームで描く。
 * パス構成: trailFade → agentGlow → composite(背景) → agents(本体) → bloom → final。
 * 中間ターゲットは rgba16float。resize() で全ターゲットを再生成。
 * 所有: render 担当。
 */
import {
  type IRenderer,
  MAX_AGENTS,
  type SimBuffers,
  WORLD_H,
  WORLD_W,
} from "../contracts";
import { createViewTransform } from "../gpu/coords";
import { SPECIES } from "../content/index";

import commonSrc from "./wgsl/common.wgsl?raw";
import trailFadeSrc from "./wgsl/trailfade.wgsl?raw";
import glowSrc from "./wgsl/glow.wgsl?raw";
import compositeSrc from "./wgsl/composite.wgsl?raw";
import agentsSrc from "./wgsl/agents.wgsl?raw";
import bloomSrc from "./wgsl/bloom.wgsl?raw";
import finalSrc from "./wgsl/final.wgsl?raw";

const HDR_FORMAT: GPUTextureFormat = "rgba16float";
const BLOOM_MIPS = 5;
const TRAIL_FADE_BASE = 0.9; // /frame (60fps基準)
const BLOOM_STRENGTH = 0.55;

interface Tex {
  tex: GPUTexture;
  view: GPUTextureView;
}

interface AgentBG {
  glow: GPUBindGroup;
  agents: GPUBindGroup;
}

export function createRenderer(
  device: GPUDevice,
  format: GPUTextureFormat,
  buffers: SimBuffers,
  canvas: HTMLCanvasElement,
): IRenderer {
  const view = createViewTransform(canvas);

  // ---- 静的リソース ----
  // 描画uniform: RenderU (48バイト)
  const uniformBuf = device.createBuffer({
    size: 48,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const uniformData = new Float32Array(12);

  // 種の基本色 (array<vec4f,3>)
  const spColorBuf = device.createBuffer({
    size: 48,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  {
    const sc = new Float32Array(12);
    for (let i = 0; i < 3; i++) {
      const c = SPECIES[i].baseColor;
      sc[i * 4 + 0] = c[0];
      sc[i * 4 + 1] = c[1];
      sc[i * 4 + 2] = c[2];
      sc[i * 4 + 3] = 0;
    }
    device.queue.writeBuffer(spColorBuf, 0, sc);
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

  // ---- シェーダモジュール(common を連結) ----
  const mod = (src: string) =>
    device.createShaderModule({ code: commonSrc + "\n" + src });
  const trailFadeMod = mod(trailFadeSrc);
  const glowMod = mod(glowSrc);
  const compositeMod = mod(compositeSrc);
  const agentsMod = mod(agentsSrc);
  const bloomMod = mod(bloomSrc);
  const finalMod = mod(finalSrc);

  const ADD: GPUBlendState = {
    color: { srcFactor: "one", dstFactor: "one", operation: "add" },
    alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
  };

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

  const compositePipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: compositeMod, entryPoint: "vs_full" },
    fragment: {
      module: compositeMod,
      entryPoint: "fs_comp",
      targets: [{ format: HDR_FORMAT }],
    },
    primitive: { topology: "triangle-list" },
  });

  const agentsPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: agentsMod, entryPoint: "vs_agents" },
    fragment: {
      module: agentsMod,
      entryPoint: "fs_agents",
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

  // ---- リサイズ依存リソース ----
  let pw = 1;
  let ph = 1;
  let trail: [Tex, Tex] | null = null;
  let scene: Tex | null = null;
  let bloom: Tex[] = [];
  let trailFadeBG: [GPUBindGroup, GPUBindGroup] | null = null; // [k]=trail[k]をサンプル
  let compositeBG: [GPUBindGroup, GPUBindGroup] | null = null; // [k]=trail[k]をサンプル
  let brightBG: GPUBindGroup | null = null;
  let downBG: GPUBindGroup[] = []; // [i]=bloom[i]をサンプル (i:0..MIPS-2)
  let upBG: GPUBindGroup[] = []; // [i]=bloom[i]をサンプル (i:1..MIPS-1)
  let finalBG: GPUBindGroup | null = null;

  let trailSrc = 0; // 現在の trail 読み側
  let time = 0;

  // agentData バッファごとのバインドグループをキャッシュ(ping-pong 2組)
  const agentBGCache = new Map<GPUBuffer, AgentBG>();
  const agentBGFor = (agents: GPUBuffer): AgentBG => {
    let bg = agentBGCache.get(agents);
    if (bg) return bg;
    const glow = device.createBindGroup({
      layout: glowPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuf } },
        { binding: 1, resource: { buffer: agents } },
        { binding: 2, resource: { buffer: buffers.aliveFlags } },
        { binding: 3, resource: { buffer: spColorBuf } },
      ],
    });
    const ag = device.createBindGroup({
      layout: agentsPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuf } },
        { binding: 1, resource: { buffer: agents } },
        { binding: 2, resource: { buffer: buffers.aliveFlags } },
        { binding: 3, resource: { buffer: spColorBuf } },
      ],
    });
    bg = { glow, agents: ag };
    agentBGCache.set(agents, bg);
    return bg;
  };

  const makeTex = (w: number, h: number): Tex => {
    const tex = device.createTexture({
      size: [w, h],
      format: HDR_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    return { tex, view: tex.createView() };
  };

  const resize = (width: number, height: number, dpr: number): void => {
    pw = Math.max(1, Math.round(width * dpr));
    ph = Math.max(1, Math.round(height * dpr));

    // 旧ターゲット破棄
    if (trail) {
      trail[0].tex.destroy();
      trail[1].tex.destroy();
    }
    if (scene) scene.tex.destroy();
    for (const b of bloom) b.tex.destroy();

    trail = [makeTex(pw, ph), makeTex(pw, ph)];
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

    // composite: trail[k] をサンプル + 障害物 + 流れ場
    const compBG = (k: number) =>
      device.createBindGroup({
        layout: compositePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniformBuf } },
          { binding: 1, resource: clampSampler },
          { binding: 2, resource: wrapSampler },
          { binding: 3, resource: trail![k].view },
          { binding: 4, resource: buffers.obstacleTex.createView() },
          { binding: 5, resource: buffers.flowTex.createView() },
        ],
      });
    compositeBG = [compBG(0), compBG(1)];

    // bloom bright: scene をサンプル
    brightBG = device.createBindGroup({
      layout: brightPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: clampSampler },
        { binding: 1, resource: scene.view },
      ],
    });

    // down: bloom[i] をサンプル → bloom[i+1] へ
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
    // up: bloom[i] をサンプル → bloom[i-1] へ加算
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

  // 初期サイズ(main が正式な resize を呼ぶまでの保険)
  resize(canvas.width || 1, canvas.height || 1, 1);

  const render = (
    encoder: GPUCommandEncoder,
    target: GPUTextureView,
    agents: GPUBuffer,
    t: number,
    dt: number,
  ): void => {
    time = t;
    if (!trail || !scene || !trailFadeBG || !compositeBG || !brightBG || !finalBG) {
      return;
    }

    // uniform 更新
    const wc = view.worldToClip();
    const fade = Math.pow(TRAIL_FADE_BASE, Math.min(4, dt * 60));
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
    uniformData[11] = BLOOM_STRENGTH;
    device.queue.writeBuffer(uniformBuf, 0, uniformData);

    const abg = agentBGFor(agents);
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

    // 2. agentGlow: 生存個体のソフト円を trail[dst] へ加算
    {
      const p = encoder.beginRenderPass({
        colorAttachments: [{
          view: trail[dst].view,
          loadOp: "load",
          storeOp: "store",
        }],
      });
      p.setPipeline(glowPipeline);
      p.setBindGroup(0, abg.glow);
      p.draw(4, MAX_AGENTS);
      p.end();
    }

    // 3. composite: 背景 + trail[dst] を sceneTex へ
    {
      const p = encoder.beginRenderPass({
        colorAttachments: [{
          view: scene.view,
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        }],
      });
      p.setPipeline(compositePipeline);
      p.setBindGroup(0, compositeBG[dst]);
      p.draw(3);
      p.end();
    }

    // 4. agents: 魚・藻の本体を sceneTex へ加算
    {
      const p = encoder.beginRenderPass({
        colorAttachments: [{
          view: scene.view,
          loadOp: "load",
          storeOp: "store",
        }],
      });
      p.setPipeline(agentsPipeline);
      p.setBindGroup(0, abg.agents);
      p.draw(16, MAX_AGENTS);
      p.end();
    }

    // 5a. bloom bright: scene → bloom[0]
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
    // 5b. downsample bloom[i] → bloom[i+1]
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
    // 5c. upsample bloom[i] → bloom[i-1](加算)
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

    // 6. final: scene + bloom → swapchain(ACES/ビネット/グレイン/リング/レターボックス)
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

  return { resize, render };
}

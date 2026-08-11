import type { ElectrobunConfig } from "electrobun";
export default {
  app: {
    name: "SpiritVale Drops Overlay",
    identifier: "dev.spiritvale.dropsoverlay",
    version: "1.0.0",
    description: "Portable rare-drop sound and grind overlay for SpiritVale — by MrNexus.",
  },
  build: {
    bun: { entrypoint: "src/bun/index.ts" },
    views: {
      overlayview: { entrypoint: "src/overlayview/index.tsx" },
    },
    copy: {
      "src/overlayview/index.html": "views/overlayview/index.html",
      "src/overlayview/index.css": "views/overlayview/index.css",
      "sounds/lure_boss.wav": "sounds/lure_boss.wav",
      "sounds/eggs.wav": "sounds/eggs.wav",
      "sounds/card_boss.mp3": "sounds/card_boss.mp3",
      "sounds/card_normal.wav": "sounds/card_normal.wav",
      "sounds/gem_boss.mp3": "sounds/gem_boss.mp3",
      "sounds/gem_normal.wav": "sounds/gem_normal.wav",
      "sounds/essence.wav": "sounds/essence.wav",
    },
    buildFolder: "dist/electrobun",
    artifactFolder: "dist/artifacts",
    targets: "win-x64",
    win: { bundleCEF: false, defaultRenderer: "native" },
  },
  runtime: { exitOnLastWindowClosed: true },
} satisfies ElectrobunConfig;
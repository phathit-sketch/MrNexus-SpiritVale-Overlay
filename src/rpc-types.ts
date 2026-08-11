import type { RPCSchema } from "electrobun";

export type OverlayRpc = {
  bun: RPCSchema<{
    requests: {
      setSize: { params: { width: number; height: number }; response: boolean };
      getFrame: { params: Record<string, never>; response: { x: number; y: number; width: number; height: number } };
      focus: { params: Record<string, never>; response: boolean };
      setOpacity: { params: { alpha: number }; response: boolean };
      setVolume: { params: { volume: number }; response: boolean };
      setOwnOnly: { params: { on: boolean }; response: boolean };
      getSettings: { params: Record<string, never>; response: unknown };
      setSoundEnabled: { params: { key: string; enabled: boolean }; response: unknown };
      listSoundPacks: { params: Record<string, never>; response: string[] };
      setSoundPack: { params: { name: string }; response: unknown };
      openConfig: { params: Record<string, never>; response: boolean };
      openSounds: { params: Record<string, never>; response: boolean };
      getAbout: { params: Record<string, never>; response: { name: string; version: string; author: string; hotkey: string } };
      setActiveProfile: { params: { name: string }; response: unknown };
      createProfile: { params: { name: string }; response: unknown };
      deleteProfile: { params: { name: string }; response: unknown };
      startGrind: { params: { durationMin: number }; response: boolean };
      stopGrind: { params: Record<string, never>; response: boolean };
      toggleOverlay: { params: Record<string, never>; response: boolean };
      quit: { params: Record<string, never>; response: boolean };
    };
  }>;
  webview: RPCSchema<{ messages: Record<string, never> }>;
};
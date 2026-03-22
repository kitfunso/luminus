'use client';

// Backwards-compatible re-export.
// Map.tsx and workspace-presets.ts import LayerKey from this path.
export type { LayerKey } from '@/lib/store';
export { default } from './sidebar/SidebarShell';

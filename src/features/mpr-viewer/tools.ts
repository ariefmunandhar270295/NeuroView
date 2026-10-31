import {
  addTool,
  CrosshairsTool,
  Enums as ToolEnums,
  PanTool,
  StackScrollTool,
  ToolGroupManager,
  WindowLevelTool,
  ZoomTool,
} from '@cornerstonejs/tools';

const { MouseBindings, KeyboardBindings } = ToolEnums;

// Tombol pointer terakhir (1 = kiri / satu jari). Cornerstone memeriksa kedekatan anotasi untuk
// tombol apa pun, jadi tanpa ini drag kanan (W/L) atau tengah (pan) yang dimulai di dekat garis
// crosshair ikut menyeret crosshair — dan garisnya membentang di seluruh viewport.
let lastPointerButtons = 0;
window.addEventListener('pointerdown', (event) => (lastPointerButtons = event.buttons), { capture: true });
const isPrimaryPointer = () => lastPointerButtons === 1;

/**
 * CrosshairsTool memakai satu flag (`getReferenceLineDraggableRotatable`) untuk geser *dan*
 * rotasi. Flag itu dibiarkan true agar crosshair selalu bisa digeser/diklik, lalu rotasi dikunci
 * di sini kecuali mode oblik aktif. Handle rotasi hanya ditampilkan saat `.mpr-viewer.is-oblique` (CSS).
 */
class MprCrosshairsTool extends CrosshairsTool {
  static toolName = 'MprCrosshairs';

  constructor(...args: ConstructorParameters<typeof CrosshairsTool>) {
    super(...args);
    const isPointNearTool = this.isPointNearTool;
    this.isPointNearTool = (...params) => isPrimaryPointer() && isPointNearTool(...params);
  }

  getHandleNearImagePoint(...params: Parameters<CrosshairsTool['getHandleNearImagePoint']>) {
    return isPrimaryPointer() ? super.getHandleNearImagePoint(...params) : undefined;
  }

  _getRotationHandleNearImagePoint(viewport: unknown, annotation: unknown, canvasCoords: unknown, proximity: unknown) {
    const isOblique = (this.configuration as { isOblique?: () => boolean }).isOblique;
    if (!isOblique?.()) return null;
    return super._getRotationHandleNearImagePoint(viewport, annotation, canvasCoords, proximity);
  }
}

export interface MprTool {
  name: string;
  label: string;
  /** Pintasan keyboard di desktop. */
  key: string;
}

/** Tool untuk drag kiri / satu jari di mode MPR. */
export const MPR_PRIMARY_TOOLS: MprTool[] = [
  { name: MprCrosshairsTool.toolName, label: 'Crosshair', key: 'c' },
  { name: StackScrollTool.toolName, label: 'Irisan', key: 's' },
  { name: WindowLevelTool.toolName, label: 'W/L', key: 'w' },
  { name: PanTool.toolName, label: 'Geser', key: 'p' },
  { name: ZoomTool.toolName, label: 'Zoom', key: 'z' },
];

export interface MprToolOptions {
  toolGroupId: string;
  renderingEngineId: string;
  viewportIds: string[];
  /** Warna garis referensi per viewport (garis bidang viewport itu di viewport lain). */
  colors: Record<string, string>;
  /** Dibaca saat crosshair disentuh; true = handle rotasi boleh diseret (oblique MPR). */
  isOblique: () => boolean;
}

const coarsePointer = window.matchMedia('(pointer: coarse)').matches;

/**
 * Binding mengikuti stack viewer agar kebiasaan tangan sama:
 * - kiri / 1 jari: tool aktif (default Crosshair: klik untuk pindah, seret garis/pusat)
 * - kanan: window/level · tengah / 3 jari: geser · roda: irisan · Ctrl+roda / pinch: zoom
 */
export function createMprToolGroup({ toolGroupId, renderingEngineId, viewportIds, colors, isOblique }: MprToolOptions) {
  for (const Tool of [MprCrosshairsTool, WindowLevelTool, PanTool, ZoomTool, StackScrollTool]) addTool(Tool);

  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  if (!toolGroup) throw new Error(`Tool group ${toolGroupId} sudah ada`);

  toolGroup.addTool(MprCrosshairsTool.toolName, {
    isOblique,
    getReferenceLineColor: (viewportId: string) => colors[viewportId],
    getReferenceLineControllable: () => true,
    getReferenceLineDraggableRotatable: () => true,
    // Slab/MIP belum dipakai; sembunyikan handle-nya agar tidak membingungkan.
    getReferenceLineSlabThicknessControlsOn: () => false,
    // Mode mobile bawaan selalu menampilkan handle rotasi & slab; cukup perbesar handle untuk jari.
    mobile: { enabled: false },
    handleRadius: coarsePointer ? 8 : 4,
  });
  for (const { name } of MPR_PRIMARY_TOOLS.slice(1)) toolGroup.addTool(name);
  for (const viewportId of viewportIds) toolGroup.addViewport(viewportId, renderingEngineId);

  toolGroup.setToolActive(WindowLevelTool.toolName, { bindings: [{ mouseButton: MouseBindings.Secondary }] });
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Wheel, modifierKey: KeyboardBindings.Ctrl }, { numTouchPoints: 2 }],
  });
  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Auxiliary }, { numTouchPoints: 3 }],
  });
  toolGroup.setToolActive(StackScrollTool.toolName, { bindings: [{ mouseButton: MouseBindings.Wheel }] });

  let primary = '';

  function setPrimaryTool(toolName: string) {
    if (toolName === primary) return;
    if (primary) toolGroup!.setToolPassive(primary);
    toolGroup!.setToolActive(toolName, { bindings: [{ mouseButton: MouseBindings.Primary }] });
    primary = toolName;
  }

  setPrimaryTool(MprCrosshairsTool.toolName);

  return {
    setPrimaryTool,
    getPrimaryTool: () => primary,
    /** Kembalikan semua bidang ke ortogonal, reset zoom/pan, dan pusatkan crosshair. */
    resetCrosshairs: () => (toolGroup.getToolInstance(MprCrosshairsTool.toolName) as CrosshairsTool).resetCrosshairs(),
    destroy: () => ToolGroupManager.destroyToolGroup(toolGroupId),
  };
}

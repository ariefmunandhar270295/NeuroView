import {
  addTool,
  AngleTool,
  Enums as ToolEnums,
  LengthTool,
  PanTool,
  ProbeTool,
  StackScrollTool,
  ToolGroupManager,
  WindowLevelTool,
  ZoomTool,
} from '@cornerstonejs/tools';

const { MouseBindings, KeyboardBindings } = ToolEnums;

export interface PrimaryTool {
  name: string;
  label: string;
  /** Pintasan keyboard di desktop. */
  key: string;
}

/** Tool yang bisa dipasang ke tombol kiri mouse / satu jari. */
export const PRIMARY_TOOLS: PrimaryTool[] = [
  { name: StackScrollTool.toolName, label: 'Irisan', key: 's' },
  { name: WindowLevelTool.toolName, label: 'W/L', key: 'w' },
  { name: PanTool.toolName, label: 'Geser', key: 'p' },
  { name: ZoomTool.toolName, label: 'Zoom', key: 'z' },
  { name: LengthTool.toolName, label: 'Jarak', key: 'l' },
  { name: AngleTool.toolName, label: 'Sudut', key: 'a' },
  { name: ProbeTool.toolName, label: 'Probe', key: 'h' },
];

let toolsRegistered = false;

function registerTools() {
  if (toolsRegistered) return;
  for (const Tool of [WindowLevelTool, PanTool, ZoomTool, StackScrollTool, LengthTool, AngleTool, ProbeTool]) {
    addTool(Tool);
  }
  toolsRegistered = true;
}

/**
 * Binding default (desktop + iPad):
 * - kiri / 1 jari: tool aktif dari toolbar (default Irisan → swipe untuk ganti irisan)
 * - kanan: window/level
 * - roda mouse: ganti irisan; Ctrl+roda (juga pinch trackpad Mac): zoom
 * - pinch 2 jari: zoom
 * - tengah / 3 jari: geser
 */
export function createToolGroup(toolGroupId: string, viewportId: string, renderingEngineId: string) {
  registerTools();

  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  if (!toolGroup) throw new Error(`Tool group ${toolGroupId} sudah ada`);

  for (const { name } of PRIMARY_TOOLS) toolGroup.addTool(name);
  toolGroup.addViewport(viewportId, renderingEngineId);

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
    // Passive hanya mencabut binding kiri; binding lain (kanan, roda, multi-touch) tetap aktif,
    // dan anotasi dari tool ukur tetap bisa diedit.
    if (primary) toolGroup!.setToolPassive(primary);
    toolGroup!.setToolActive(toolName, { bindings: [{ mouseButton: MouseBindings.Primary }] });
    primary = toolName;
  }

  setPrimaryTool(StackScrollTool.toolName);

  return {
    setPrimaryTool,
    getPrimaryTool: () => primary,
    destroy: () => ToolGroupManager.destroyToolGroup(toolGroupId),
  };
}

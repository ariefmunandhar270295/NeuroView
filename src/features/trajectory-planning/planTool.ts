import { getEnabledElement, type Types } from '@cornerstonejs/core';
import { BaseTool, type Types as ToolTypes } from '@cornerstonejs/tools';
import { add, dot, scale, sub, type Vec3 } from './geometry';
import type { PlanHandle } from './store';

export interface PlanPointToolConfiguration {
  /** Handle yang menunggu ditandai (klik berikutnya), bila ada. */
  getPending(): string | undefined;
  place(world: Vec3): void;
  getHandles(): PlanHandle[];
  moveHandle(handleId: string, world: Vec3): void;
}

const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
/** Radius tangkap handle (px); lebih besar untuk jari. */
const GRAB_RADIUS = coarsePointer ? 18 : 10;

type ToolEvent = Types.CustomEventType<{
  element: HTMLDivElement;
  currentPoints: { world: Types.Point3; canvas: Types.Point2 };
}>;

/**
 * Tool drag kiri / satu jari untuk perencanaan: seret titik yang sudah ada untuk menggesernya.
 * Penandaan titik baru ditangani langsung di pointerdown (lihat index.ts); jalur `getPending`
 * di sini hanya cadangan.
 * Saat diseret, jarak titik ke bidang irisan dipertahankan sehingga hanya posisi di bidang
 * tampilan yang berubah.
 */
export class PlanPointTool extends BaseTool {
  static toolName = 'PlanPoint';

  private drag?: { handleId: string; depth: number };

  constructor(
    toolProps: ToolTypes.PublicToolProps = {},
    defaultToolProps: ToolTypes.ToolProps = { supportedInteractionTypes: ['Mouse', 'Touch'], configuration: {} },
  ) {
    super(toolProps, defaultToolProps);
  }

  private get config() {
    return this.configuration as unknown as PlanPointToolConfiguration;
  }

  /** Dipanggil juga untuk touch (fallback Cornerstone). `true` = event dikonsumsi. */
  preMouseDownCallback = (evt: ToolEvent): boolean => {
    this.drag = undefined;
    const { element, currentPoints } = evt.detail;
    if (this.config.getPending()) {
      this.config.place([...currentPoints.world] as Vec3);
      return true;
    }

    const { viewport } = getEnabledElement(element)!;
    const [cx, cy] = currentPoints.canvas;
    let nearest: { handle: PlanHandle; distance: number } | undefined;
    for (const handle of this.config.getHandles()) {
      const [x, y] = viewport.worldToCanvas(handle.world);
      const distance = Math.hypot(x - cx, y - cy);
      if (distance < GRAB_RADIUS && (!nearest || distance < nearest.distance)) nearest = { handle, distance };
    }
    if (!nearest) return false;

    const { focalPoint, viewPlaneNormal } = viewport.getCamera();
    this.drag = {
      handleId: nearest.handle.id,
      depth: dot(sub(nearest.handle.world, focalPoint as Vec3), viewPlaneNormal as Vec3),
    };
    return true;
  };

  mouseDragCallback = (evt: ToolEvent): void => {
    if (!this.drag) return;
    const { element, currentPoints } = evt.detail;
    const { viewPlaneNormal } = getEnabledElement(element)!.viewport.getCamera();
    // currentPoints.world berada di bidang irisan; kembalikan ke kedalaman semula titik itu.
    const world = add(currentPoints.world as Vec3, scale(viewPlaneNormal as Vec3, this.drag.depth));
    this.config.moveHandle(this.drag.handleId, world);
  };

  touchDragCallback = this.mouseDragCallback;
}

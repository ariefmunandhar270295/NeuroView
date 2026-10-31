import { getRenderingEngine, type Types } from '@cornerstonejs/core';
import type { MprContext, MprViewer } from '../mpr-viewer';
import type { Vec3 } from './geometry';
import { createPlanOverlay } from './overlay2d';
import { createPlanPanel } from './panel';
import { PlanPointTool, type PlanPointToolConfiguration } from './planTool';
import { createProbeView } from './probeView';
import { createPlanScene } from './scene3d';
import { createPlanStore } from './store';

export interface TrajectoryPlannerOptions {
  mpr: MprViewer;
  /** Pastikan layout MPR 2×2 terlihat (mis. `layout.setMode('2x2')`). */
  ensureMpr: () => Promise<void>;
}

/** Jeda sebelum geometri 3D dibangun ulang saat titik diseret (ray casting 3D mahal). */
const SCENE_DEBOUNCE_MS = 150;

/**
 * Perencanaan trajektori ala Brainlab di atas MPR: tandai entry/target dan AC/PC/midline,
 * garis di tiga bidang dan 3D, panjang & sudut terhadap bidang AC-PC, probe's eye view, serta
 * ekspor JSON. Mengembalikan panel untuk sidebar.
 */
export function createTrajectoryPlanner({ mpr, ensureMpr }: TrajectoryPlannerOptions) {
  const store = createPlanStore();
  let context: MprContext | undefined;
  let overlay: ReturnType<typeof createPlanOverlay> | undefined;
  let scene: ReturnType<typeof createPlanScene> | undefined;
  let sceneTimer: number | undefined;

  const probe = createProbeView(store, () => overlay?.redraw());

  const toolConfiguration: PlanPointToolConfiguration = {
    getPending: () => store.pending,
    place: (world) => store.place(world),
    getHandles: () => store.handles(),
    moveHandle: (handleId, world) => store.setHandle(handleId, world),
  };
  mpr.addPrimaryTool({
    name: PlanPointTool.toolName,
    label: 'Titik',
    key: 't',
    title: 'Tandai / seret titik rencana trajektori',
    ToolClass: PlanPointTool,
    configuration: toolConfiguration as unknown as Record<string, unknown>,
  });
  mpr.addPanelView({
    id: 'probe',
    label: 'Probe’s eye',
    element: probe.element,
    onShow: () => void probe.show(),
    onHide: () => probe.hide(),
  });

  const panel = createPlanPanel(store, {
    async mark(handleId) {
      await ensureMpr();
      if (!context) return;
      if (handleId.includes(':')) store.setActive(handleId.split(':')[0]);
      store.setPending(store.pending === handleId ? undefined : handleId);
      if (store.pending) mpr.selectTool(PlanPointTool.toolName);
    },
    navigate(point: Vec3) {
      void ensureMpr().then(() => context?.setToolCenter(point));
    },
    openMpr() {
      void ensureMpr();
    },
    exportJson() {
      const json = JSON.stringify(store.toJSON(), null, 2);
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
      const link = Object.assign(document.createElement('a'), { href: url, download: `rencana-trajektori-${stamp}.json` });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });

  mpr.onReady((ctx) => {
    context = ctx;
    // Penempatan titik langsung di pointerdown. Cornerstone menahan klik 400 ms untuk deteksi
    // double-click dengan state global, dan membuang klik itu bila ada mouseup lain di jendela
    // tersebut (mis. langsung menekan "Tandai Entry" setelah menandai target). preventDefault
    // juga mencegah mousedown kompatibilitas sampai ke Cornerstone.
    for (const plane of ctx.planes) {
      plane.viewportElement.addEventListener(
        'pointerdown',
        (event) => {
          if (!store.pending || event.button !== 0) return;
          const vp = getRenderingEngine(ctx.renderingEngineId)?.getViewport<Types.IVolumeViewport>(plane.viewportId);
          const canvas = plane.viewportElement.querySelector('canvas');
          if (!vp || !canvas) return;
          const rect = canvas.getBoundingClientRect();
          const world = vp.canvasToWorld([event.clientX - rect.left, event.clientY - rect.top]);
          event.preventDefault();
          event.stopPropagation();
          store.place([...world] as Vec3);
        },
        { capture: true },
      );
    }
    overlay = createPlanOverlay(ctx, store, () => probe.probePoint());
    scene = createPlanScene(ctx.renderingEngineId, ctx.volumeRenderViewportId, store);
    probe.attach(ctx);
  });

  mpr.onVolumeShown(({ series, volumeId }) => {
    store.setSeries({
      frameOfReferenceUID: series.frameOfReferenceUID,
      studyInstanceUID: series.studyInstanceUID,
      seriesInstanceUID: series.seriesInstanceUID,
      description: series.description,
    });
    void probe.setVolume(volumeId);
    panel.setReady(true);
    sceneKey = '';
    scene?.rebuild();
  });

  // Bangun ulang 3D hanya bila geometri berubah (bukan saat mode tandai/nama berubah).
  let sceneKey = '';
  store.subscribe(() => {
    mpr.element.classList.toggle('is-placing', !!store.pending);
    overlay?.redraw();
    probe.update();
    panel.render();
    const key = JSON.stringify([store.landmarks, store.trajectories.map((t) => [t.entry, t.target, t.color]), store.active()?.id]);
    if (key === sceneKey) return;
    sceneKey = key;
    window.clearTimeout(sceneTimer);
    sceneTimer = window.setTimeout(() => scene?.rebuild(), SCENE_DEBOUNCE_MS);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && store.pending) store.setPending(undefined);
  });

  return { panel: panel.element, store };
}

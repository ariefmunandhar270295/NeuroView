import {
  cache,
  Enums,
  eventTarget,
  RenderingEngine,
  setVolumesForViewports,
  volumeLoader,
  type Types,
} from '@cornerstonejs/core';
import { synchronizers, SynchronizerManager } from '@cornerstonejs/tools';
import { prefetchSeriesMetadata, type DicomSeries } from '../dicom-loader';
import { createPresetBar, findPreset, NEURO_PRESETS, presetToVoiRange, type WindowPreset } from '../window-presets';
import { createVolumeRenderPanel } from '../volume-render';
import { createOverlay } from '../../shared/viewport-overlay';
import { createMprToolGroup, MPR_PRIMARY_TOOLS, type MprExtraTool } from './tools';

export type { MprExtraTool } from './tools';

const RENDERING_ENGINE_ID = 'neuroviewer-mpr-engine';
const TOOL_GROUP_ID = 'mpr-tools';
const VOI_SYNC_ID = 'mpr-voi-sync';
/** Sudut minimum (derajat) sebelum bidang dianggap oblik. */
const OBLIQUE_THRESHOLD_DEG = 0.5;

interface PlaneDef {
  viewportId: string;
  label: string;
  orientation: Enums.OrientationAxis;
  /** Warna garis crosshair bidang ini (konvensi OHIF: aksial merah, koronal hijau, sagital kuning). */
  color: string;
}

const PLANES: PlaneDef[] = [
  { viewportId: 'mpr-axial', label: 'Aksial', orientation: Enums.OrientationAxis.AXIAL, color: 'rgb(230, 72, 77)' },
  { viewportId: 'mpr-coronal', label: 'Koronal', orientation: Enums.OrientationAxis.CORONAL, color: 'rgb(48, 164, 108)' },
  { viewportId: 'mpr-sagittal', label: 'Sagital', orientation: Enums.OrientationAxis.SAGITTAL, color: 'rgb(245, 217, 10)' },
];
/** Hanya bidang MPR; render ulang panel 3D (ray casting) dihindari bila tidak perlu. */
const VIEWPORT_IDS = PLANES.map((p) => p.viewportId);

export interface MprPlane {
  viewportId: string;
  label: string;
  color: string;
  /** Sel grid (tempat overlay tambahan bisa dipasang di atas viewport). */
  cell: HTMLElement;
  viewportElement: HTMLDivElement;
}

/** Akses untuk fitur lain yang memperluas MPR (mis. perencanaan trajektori). */
export interface MprContext {
  renderingEngineId: string;
  planes: MprPlane[];
  volumeRenderViewportId: string;
  /** Pindahkan pusat crosshair (dan irisan ketiga bidang) ke titik dunia ini. */
  setToolCenter(point: Types.Point3): void;
}

/** Tampilan alternatif di panel ke-4, dipilih lewat tab di samping "3D". */
export interface MprPanelView {
  id: string;
  label: string;
  element: HTMLElement;
  onShow?: () => void;
  onHide?: () => void;
}

export interface MprViewer {
  /** Grid 2×2: aksial, koronal, sagital, dan volume rendering 3D. */
  element: HTMLElement;
  toolbar: HTMLElement;
  /** Layout harus sudah terlihat sebelum dipanggil (viewport butuh ukuran nyata). */
  showSeries(series: DicomSeries): Promise<void>;
  setActive(active: boolean): void;
  /** Dipanggil sekali setelah rendering engine dibuat (sebelum volume pertama dipasang). */
  onReady(callback: (context: MprContext) => void): void;
  /** Dipanggil setiap kali volume series baru selesai dipasang ke viewport. */
  onVolumeShown(callback: (info: { series: DicomSeries; volumeId: string }) => void): void;
  /** Tambah tool drag kiri / satu jari ke toolbar MPR. Panggil sebelum series pertama. */
  addPrimaryTool(tool: MprExtraTool): void;
  selectTool(toolName: string): void;
  addPanelView(view: MprPanelView): void;
  /** Lepas volume yang sedang dipakai (mis. sebelum batch file baru dibuka). */
  releaseVolume(): void;
  destroy(): void;
}

function button(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'btn';
  el.textContent = label;
  el.title = title;
  el.addEventListener('click', onClick);
  return el;
}

function angleBetween(a: Types.Point3, b: Types.Point3): number {
  const cos = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);
  return (Math.acos(Math.min(1, cos)) * 180) / Math.PI;
}

export function createMprViewer(): MprViewer {
  const element = document.createElement('div');
  element.className = 'mpr-viewer';

  // --- Grid ---
  const cells = PLANES.map((plane) => {
    const cell = document.createElement('div');
    cell.className = 'mpr-cell';
    cell.style.setProperty('--plane-color', plane.color);
    const viewportElement = document.createElement('div');
    viewportElement.className = 'viewport';
    viewportElement.addEventListener('contextmenu', (event) => event.preventDefault());
    const overlay = createOverlay();
    overlay.update({ plane: plane.label });
    cell.append(viewportElement, overlay.element);
    return { plane, cell, viewportElement, overlay, initialNormal: undefined as Types.Point3 | undefined };
  });

  // Panel ke-4: volume rendering dari volume yang sama (fitur volume-render), plus tampilan
  // tambahan dari fitur lain yang dipilih lewat tab.
  const volumeRender = createVolumeRenderPanel('mpr-3d');
  const cell3d = Object.assign(document.createElement('div'), { className: 'mpr-cell mpr-cell-3d' });
  const panelTabs = Object.assign(document.createElement('div'), { className: 'panel-tabs', hidden: true });
  panelTabs.setAttribute('role', 'tablist');
  cell3d.append(volumeRender.element, panelTabs);
  const panelViews: MprPanelView[] = [];

  let shownPanelView: MprPanelView | undefined;
  function showPanelView(id: string) {
    const next = panelViews.find((view) => view.id === id);
    if (shownPanelView && shownPanelView !== next) shownPanelView.onHide?.();
    shownPanelView = next;
    for (const view of panelViews) view.element.hidden = view.id !== id;
    for (const tab of panelTabs.children) tab.setAttribute('aria-selected', String((tab as HTMLElement).dataset.view === id));
    // Viewport yang baru terlihat butuh ukuran canvas yang benar.
    if (renderingEngine && element.clientWidth > 0) renderingEngine.resize(true, true);
    next?.onShow?.();
  }

  function addPanelView(view: MprPanelView) {
    panelViews.push(view);
    if (view.element !== volumeRender.element) cell3d.insertBefore(view.element, panelTabs);
    const tab = button(view.label, view.label, () => showPanelView(view.id));
    tab.setAttribute('role', 'tab');
    tab.dataset.view = view.id;
    panelTabs.append(tab);
    panelTabs.hidden = panelViews.length < 2;
    showPanelView(panelViews[0].id);
  }

  element.append(...cells.map((c) => c.cell), cell3d);

  // --- Engine, tools, sinkronisasi (dibuat saat series pertama ditampilkan) ---
  let renderingEngine: RenderingEngine | undefined;
  let oblique = false;
  let tools: ReturnType<typeof createMprToolGroup> | undefined;
  const extraTools: MprExtraTool[] = [];
  const readyCallbacks: Array<(context: MprContext) => void> = [];
  const volumeCallbacks: Array<(info: { series: DicomSeries; volumeId: string }) => void> = [];
  const viewport = (id: string) => renderingEngine!.getViewport<Types.IVolumeViewport>(id);
  addPanelView({ id: '3d', label: '3D', element: volumeRender.element });

  function ensureEngine() {
    if (renderingEngine) return;
    renderingEngine = new RenderingEngine(RENDERING_ENGINE_ID);
    renderingEngine.setViewports([
      ...cells.map(({ plane, viewportElement }) => ({
        viewportId: plane.viewportId,
        type: Enums.ViewportType.ORTHOGRAPHIC,
        element: viewportElement as HTMLDivElement,
        defaultOptions: { orientation: plane.orientation, background: [0, 0, 0] as Types.Point3 },
      })),
      volumeRender.viewportInput,
    ]);
    volumeRender.attach(RENDERING_ENGINE_ID);

    tools = createMprToolGroup({
      toolGroupId: TOOL_GROUP_ID,
      renderingEngineId: RENDERING_ENGINE_ID,
      viewportIds: VIEWPORT_IDS,
      colors: Object.fromEntries(PLANES.map((p) => [p.viewportId, p.color])),
      isOblique: () => oblique,
      extraTools,
    });
    selectTool(primaryTool);

    // W/L (dan invert) di satu bidang langsung diterapkan ke dua bidang lain.
    const voiSync = synchronizers.createVOISynchronizer(VOI_SYNC_ID, { syncInvertState: true, syncColormap: false });
    for (const viewportId of VIEWPORT_IDS) voiSync.add({ renderingEngineId: RENDERING_ENGINE_ID, viewportId });

    for (const c of cells) {
      c.viewportElement.addEventListener(Enums.Events.VOLUME_NEW_IMAGE, ((
        event: Types.EventTypes.VolumeNewImageEvent,
      ) => {
        c.overlay.update({ index: event.detail.imageIndex, total: event.detail.numberOfSlices });
      }) as EventListener);
      c.viewportElement.addEventListener(Enums.Events.VOI_MODIFIED, ((event: Types.EventTypes.VoiModifiedEvent) => {
        syncVoi(c, event.detail.range);
      }) as EventListener);
      c.viewportElement.addEventListener(Enums.Events.CAMERA_MODIFIED, ((
        event: Types.EventTypes.CameraModifiedEvent,
      ) => {
        updatePlaneLabel(c, event.detail.camera.viewPlaneNormal);
      }) as EventListener);
    }

    const context: MprContext = {
      renderingEngineId: RENDERING_ENGINE_ID,
      planes: cells.map(({ plane, cell, viewportElement }) => ({
        viewportId: plane.viewportId,
        label: plane.label,
        color: plane.color,
        cell,
        viewportElement: viewportElement as HTMLDivElement,
      })),
      volumeRenderViewportId: volumeRender.viewportId,
      setToolCenter: (point) => tools?.setToolCenter(point),
    };
    for (const callback of readyCallbacks) callback(context);
  }

  function updatePlaneLabel(c: (typeof cells)[number], normal: Types.Point3 | undefined) {
    if (!c.initialNormal || !normal) return;
    const angle = angleBetween(c.initialNormal, normal);
    c.overlay.update({
      plane: angle > OBLIQUE_THRESHOLD_DEG ? `${c.plane.label} · oblik ${Math.round(angle)}°` : c.plane.label,
    });
  }

  const isRotated = () =>
    cells.some((c) => c.initialNormal && angleBetween(c.initialNormal, viewport(c.plane.viewportId).getCamera().viewPlaneNormal!) > OBLIQUE_THRESHOLD_DEG);

  // --- Toolbar ---
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.setAttribute('role', 'toolbar');

  const toolButtons = new Map<string, HTMLButtonElement>();
  // Disimpan agar pilihan sebelum engine dibuat tidak hilang.
  let primaryTool = MPR_PRIMARY_TOOLS[0].name;
  function selectTool(toolName: string) {
    primaryTool = toolName;
    tools?.setPrimaryTool(toolName);
    for (const [name, btn] of toolButtons) btn.setAttribute('aria-pressed', String(name === toolName));
  }
  const toolButtonGroup = Object.assign(document.createElement('div'), { className: 'toolbar-group' });
  function addToolButton(tool: { name: string; label: string; key: string; title?: string }) {
    const btn = button(tool.label, `${tool.title ?? tool.label} (${tool.key.toUpperCase()})`, () => selectTool(tool.name));
    toolButtons.set(tool.name, btn);
    toolButtonGroup.append(btn);
  }
  for (const tool of MPR_PRIMARY_TOOLS) addToolButton(tool);
  toolbar.append(toolButtonGroup);
  selectTool(primaryTool);

  function addPrimaryTool(tool: MprExtraTool) {
    if (tools) throw new Error('addPrimaryTool harus dipanggil sebelum series pertama ditampilkan');
    extraTools.push(tool);
    addToolButton(tool);
    selectTool(primaryTool);
  }

  const obliqueButton = button('Oblik', 'Oblique MPR: seret handle bulat di garis crosshair untuk memutar bidang (O)', () =>
    setOblique(!oblique),
  );
  obliqueButton.setAttribute('aria-pressed', 'false');

  function setOblique(value: boolean) {
    oblique = value;
    obliqueButton.setAttribute('aria-pressed', String(value));
    element.classList.toggle('is-oblique', value);
    if (!renderingEngine) return;
    // Mematikan oblik mengembalikan bidang ke ortogonal agar tidak ada rotasi "tersembunyi".
    if (!value && isRotated()) tools?.resetCrosshairs();
    renderingEngine.renderViewports(VIEWPORT_IDS);
  }

  // Preset hanya untuk CT (HU); diterapkan ke ketiga bidang sekaligus.
  let presetsEnabled = false;
  const presetBar = createPresetBar(applyPreset);
  presetBar.setEnabled(false);

  function syncVoi(c: (typeof cells)[number], voi: Types.VOIRange | undefined) {
    const preset = presetsEnabled ? findPreset(voi) : undefined;
    c.overlay.update({ voi, preset: preset?.label });
    if (c === cells[0]) presetBar.setActive(preset?.id);
  }

  function applyPreset(preset: WindowPreset) {
    if (!presetsEnabled || !renderingEngine) return;
    for (const c of cells) {
      const vp = viewport(c.plane.viewportId);
      vp.setProperties({ voiRange: presetToVoiRange(preset) });
      syncVoi(c, vp.getProperties()?.voiRange);
    }
    renderingEngine.renderViewports(VIEWPORT_IDS);
  }

  function reset() {
    if (!renderingEngine) return;
    tools?.resetCrosshairs();
    for (const c of cells) {
      const vp = viewport(c.plane.viewportId);
      vp.resetProperties();
      syncVoi(c, vp.getProperties()?.voiRange);
    }
    renderingEngine.renderViewports(VIEWPORT_IDS);
  }

  const separator = () => Object.assign(document.createElement('span'), { className: 'toolbar-sep' });
  toolbar.append(
    separator(),
    obliqueButton,
    separator(),
    presetBar.element,
    separator(),
    button('Reset', 'Reset bidang, zoom, dan W/L (R)', reset),
  );

  // --- Keyboard (desktop) ---
  let active = false;
  const onKeyDown = (event: KeyboardEvent) => {
    if (!active || event.metaKey || event.ctrlKey || event.altKey) return;
    if ((event.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable]')) return;
    const key = event.key.toLowerCase();
    const tool = [...MPR_PRIMARY_TOOLS, ...extraTools].find((t) => t.key === key);
    const preset = NEURO_PRESETS.find((p) => p.key === key);
    if (tool) selectTool(tool.name);
    else if (preset) applyPreset(preset);
    else if (key === 'o') setOblique(!oblique);
    else if (key === 'r') reset();
    else return;
    event.preventDefault();
  };
  window.addEventListener('keydown', onKeyDown);

  const resizeObserver = new ResizeObserver(() => {
    if (renderingEngine && element.clientWidth > 0) renderingEngine.resize(true, true);
  });
  resizeObserver.observe(element);

  // --- Progres streaming volume ---
  let currentVolumeId: string | undefined;
  const onVolumeModified = ((event: Types.EventTypes.ImageVolumeModifiedEvent) => {
    const { volumeId, framesProcessed, numberOfFrames } = event.detail;
    if (volumeId !== currentVolumeId || !numberOfFrames) return;
    const done = framesProcessed >= numberOfFrames;
    volumeRender.setStatus(done ? '' : `Memuat volume ${Math.round((framesProcessed / numberOfFrames) * 100)}%`);
  }) as EventListener;
  eventTarget.addEventListener(Enums.Events.IMAGE_VOLUME_MODIFIED, onVolumeModified);

  let loadToken = 0;

  async function showSeries(series: DicomSeries) {
    const token = ++loadToken;
    ensureEngine();
    presetsEnabled = series.modality === 'CT';
    presetBar.setEnabled(presetsEnabled);
    cells[0].overlay.update({ title: series.description, modality: series.modality });

    // Skema ini ditangani loader default Cornerstone (streaming irisan demi irisan dari imageId lokal).
    const volumeId = `cornerstoneStreamingImageVolume:${series.seriesInstanceUID}`;
    if (volumeId === currentVolumeId) return;

    element.classList.add('is-loading');
    volumeRender.setStatus('Menyiapkan volume…');
    try {
      await prefetchSeriesMetadata(series, (done, total) => {
        if (token === loadToken) volumeRender.setStatus(`Membaca irisan ${done}/${total}`);
      });
      if (token !== loadToken) return;
      const volume = cache.getVolume(volumeId) ?? (await volumeLoader.createAndCacheVolume(volumeId, { imageIds: series.imageIds }));
      if (token !== loadToken) return;

      const previousVolumeId = currentVolumeId;
      currentVolumeId = volumeId;
      volume.load(() => undefined);
      await setVolumesForViewports(renderingEngine!, [{ volumeId }], [...VIEWPORT_IDS, volumeRender.viewportId]);
      if (token !== loadToken) return;

      // Hanya satu volume disimpan agar memori iPad tidak habis.
      if (previousVolumeId) {
        cache.getVolume(previousVolumeId)?.cancelLoading?.();
        cache.removeVolumeLoadObject(previousVolumeId);
      }

      setOblique(false);
      tools?.resetCrosshairs();
      for (const c of cells) {
        const vp = viewport(c.plane.viewportId);
        c.initialNormal = [...vp.getCamera().viewPlaneNormal!] as Types.Point3;
        c.overlay.update({ plane: c.plane.label, index: vp.getSliceIndex(), total: vp.getNumberOfSlices() });
        syncVoi(c, vp.getProperties()?.voiRange);
      }
      volumeRender.show(series.modality);
      renderingEngine!.renderViewports(VIEWPORT_IDS);
      for (const callback of volumeCallbacks) callback({ series, volumeId });
    } finally {
      if (token === loadToken) element.classList.remove('is-loading');
    }
  }

  function setActive(value: boolean) {
    active = value;
  }

  function releaseVolume() {
    loadToken += 1; // batalkan pemuatan yang sedang berjalan
    if (!currentVolumeId) return;
    cache.getVolume(currentVolumeId)?.cancelLoading?.();
    // Semua viewport di engine ini (bidang MPR, 3D, dan tampilan tambahan) merujuk volume tsb.
    for (const vp of renderingEngine?.getViewports() ?? []) vp.removeAllActors();
    cache.removeVolumeLoadObject(currentVolumeId);
    currentVolumeId = undefined;
    volumeRender.setStatus('');
  }

  function destroy() {
    window.removeEventListener('keydown', onKeyDown);
    eventTarget.removeEventListener(Enums.Events.IMAGE_VOLUME_MODIFIED, onVolumeModified);
    resizeObserver.disconnect();
    SynchronizerManager.destroySynchronizer(VOI_SYNC_ID);
    tools?.destroy();
    volumeRender.destroy();
    renderingEngine?.destroy();
    if (currentVolumeId) cache.removeVolumeLoadObject(currentVolumeId);
  }

  return {
    element,
    toolbar,
    showSeries,
    setActive,
    onReady: (callback) => readyCallbacks.push(callback),
    onVolumeShown: (callback) => volumeCallbacks.push(callback),
    addPrimaryTool,
    selectTool,
    addPanelView,
    releaseVolume,
    destroy,
  };
}

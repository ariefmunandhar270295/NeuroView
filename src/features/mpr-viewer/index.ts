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
import { createOverlay } from '../../shared/viewport-overlay';
import { createMprToolGroup, MPR_PRIMARY_TOOLS } from './tools';

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
const VIEWPORT_IDS = PLANES.map((p) => p.viewportId);

export interface MprViewer {
  /** Grid 2×2: aksial, koronal, sagital, dan panel 3D (placeholder). */
  element: HTMLElement;
  toolbar: HTMLElement;
  /** Layout harus sudah terlihat sebelum dipanggil (viewport butuh ukuran nyata). */
  showSeries(series: DicomSeries): Promise<void>;
  setActive(active: boolean): void;
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

  const placeholder = document.createElement('div');
  placeholder.className = 'mpr-cell mpr-cell-3d';
  const placeholderTitle = Object.assign(document.createElement('strong'), { textContent: '3D' });
  const placeholderText = Object.assign(document.createElement('span'), {
    textContent: 'Volume rendering menyusul',
  });
  const progress = Object.assign(document.createElement('span'), { className: 'mpr-progress' });
  placeholder.append(placeholderTitle, placeholderText, progress);

  element.append(...cells.map((c) => c.cell), placeholder);

  // --- Engine, tools, sinkronisasi (dibuat saat series pertama ditampilkan) ---
  let renderingEngine: RenderingEngine | undefined;
  let oblique = false;
  let tools: ReturnType<typeof createMprToolGroup> | undefined;
  const viewport = (id: string) => renderingEngine!.getViewport<Types.IVolumeViewport>(id);

  function ensureEngine() {
    if (renderingEngine) return;
    renderingEngine = new RenderingEngine(RENDERING_ENGINE_ID);
    renderingEngine.setViewports(
      cells.map(({ plane, viewportElement }) => ({
        viewportId: plane.viewportId,
        type: Enums.ViewportType.ORTHOGRAPHIC,
        element: viewportElement as HTMLDivElement,
        defaultOptions: { orientation: plane.orientation, background: [0, 0, 0] as Types.Point3 },
      })),
    );

    tools = createMprToolGroup({
      toolGroupId: TOOL_GROUP_ID,
      renderingEngineId: RENDERING_ENGINE_ID,
      viewportIds: VIEWPORT_IDS,
      colors: Object.fromEntries(PLANES.map((p) => [p.viewportId, p.color])),
      isOblique: () => oblique,
    });
    selectTool(tools.getPrimaryTool());

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
  function selectTool(toolName: string) {
    tools?.setPrimaryTool(toolName);
    for (const [name, btn] of toolButtons) btn.setAttribute('aria-pressed', String(name === toolName));
  }
  for (const tool of MPR_PRIMARY_TOOLS) {
    const btn = button(tool.label, `${tool.label} (${tool.key.toUpperCase()})`, () => selectTool(tool.name));
    toolButtons.set(tool.name, btn);
    toolbar.append(btn);
  }
  selectTool(MPR_PRIMARY_TOOLS[0].name);

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
    renderingEngine.render();
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
    renderingEngine.render();
  }

  function reset() {
    if (!renderingEngine) return;
    tools?.resetCrosshairs();
    for (const c of cells) {
      const vp = viewport(c.plane.viewportId);
      vp.resetProperties();
      syncVoi(c, vp.getProperties()?.voiRange);
    }
    renderingEngine.render();
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
    const tool = MPR_PRIMARY_TOOLS.find((t) => t.key === key);
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
    progress.textContent = done ? '' : `Memuat volume ${Math.round((framesProcessed / numberOfFrames) * 100)}%`;
  }) as EventListener;
  eventTarget.addEventListener(Enums.Events.IMAGE_VOLUME_MODIFIED, onVolumeModified);

  let loadToken = 0;

  async function showSeries(series: DicomSeries) {
    const token = ++loadToken;
    ensureEngine();
    presetsEnabled = series.modality === 'CT';
    presetBar.setEnabled(presetsEnabled);
    cells[0].overlay.update({ title: series.description, modality: series.modality });
    placeholderText.textContent = `${series.modality} · ${series.description || 'Series'} · ${series.imageIds.length} irisan. Volume rendering menyusul.`;

    // Skema ini ditangani loader default Cornerstone (streaming irisan demi irisan dari imageId lokal).
    const volumeId = `cornerstoneStreamingImageVolume:${series.seriesInstanceUID}`;
    if (volumeId === currentVolumeId) return;

    element.classList.add('is-loading');
    progress.textContent = 'Menyiapkan volume…';
    try {
      await prefetchSeriesMetadata(series, (done, total) => {
        if (token === loadToken) progress.textContent = `Membaca irisan ${done}/${total}`;
      });
      if (token !== loadToken) return;
      const volume = cache.getVolume(volumeId) ?? (await volumeLoader.createAndCacheVolume(volumeId, { imageIds: series.imageIds }));
      if (token !== loadToken) return;

      const previousVolumeId = currentVolumeId;
      currentVolumeId = volumeId;
      volume.load(() => undefined);
      await setVolumesForViewports(renderingEngine!, [{ volumeId }], VIEWPORT_IDS);
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
      renderingEngine!.render();
    } finally {
      if (token === loadToken) element.classList.remove('is-loading');
    }
  }

  function setActive(value: boolean) {
    active = value;
  }

  function destroy() {
    window.removeEventListener('keydown', onKeyDown);
    eventTarget.removeEventListener(Enums.Events.IMAGE_VOLUME_MODIFIED, onVolumeModified);
    resizeObserver.disconnect();
    SynchronizerManager.destroySynchronizer(VOI_SYNC_ID);
    tools?.destroy();
    renderingEngine?.destroy();
    if (currentVolumeId) cache.removeVolumeLoadObject(currentVolumeId);
  }

  return { element, toolbar, showSeries, setActive, destroy };
}

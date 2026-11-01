import { cache, Enums, getRenderingEngine, type Types } from '@cornerstonejs/core';
import {
  addTool,
  Enums as ToolEnums,
  PanTool,
  ToolGroupManager,
  TrackballRotateTool,
  ZoomTool,
} from '@cornerstonejs/tools';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import type { vtkVolume } from '@kitware/vtk.js/Rendering/Core/Volume';

const { MouseBindings, KeyboardBindings } = ToolEnums;

export interface VrPreset {
  /** Nama preset bawaan Cornerstone (`CONSTANTS.VIEWPORT_PRESETS`), atau `mip`. */
  id: string;
  label: string;
  /**
   * Maximum intensity projection dengan ramp abu-abu di rentang ini; `data` = rentang voxel volume.
   * Preset CT-MIP bawaan Cornerstone sudah putih penuh sejak −637 HU, sehingga dengan blend MIP
   * hasilnya hanya siluet; karena itu transfer function MIP dibuat sendiri.
   */
  mip?: [number, number] | 'data';
}

/** Preset yang relevan untuk neuro; CT memakai HU, MR intensitas relatif. */
export const VR_PRESETS: Record<'CT' | 'MR', VrPreset[]> = {
  CT: [
    { id: 'CT-Bone', label: 'Tulang' },
    { id: 'CT-Soft-Tissue', label: 'Jaringan lunak' },
    { id: 'CT-Muscle', label: 'Otot & kulit' },
    { id: 'mip', label: 'MIP', mip: [0, 2000] },
  ],
  MR: [
    { id: 'MR-Default', label: 'Default' },
    { id: 'MR-T2-Brain', label: 'T2 otak' },
    { id: 'mip', label: 'MIP', mip: 'data' },
  ],
};

/**
 * Transfer function MIP: ramp hitam → putih di [lower, upper]. Opasitas dibuat konstan 1 karena
 * keluaran MIP = warna × opasitas; ramp opasitas akan menggelapkan nilai tengah secara kuadratik.
 */
function applyMipTransferFunction(actor: vtkVolume, [lower, upper]: [number, number]) {
  const color = vtkColorTransferFunction.newInstance();
  color.addRGBPoint(lower, 0, 0, 0);
  color.addRGBPoint(upper, 1, 1, 1);
  const opacity = vtkPiecewiseFunction.newInstance();
  opacity.addPoint(lower, 1);
  opacity.addPoint(upper, 1);
  const property = actor.getProperty();
  property.setRGBTransferFunction(0, color);
  property.setScalarOpacity(0, opacity);
  property.setShade(false);
}

export interface VolumeRenderPanel {
  /** Isi panel: viewport 3D, pilihan preset, tombol reset, dan status. */
  element: HTMLElement;
  viewportId: string;
  /** Masukan untuk `renderingEngine.setViewports` (VolumeViewport3D berbasis vtk.js). */
  viewportInput: Types.PublicViewportInput;
  /** Panggil setelah viewport di-enable: membuat tool group rotasi/zoom/geser. */
  attach(renderingEngineId: string): void;
  /** Panggil setelah volume diset ke viewport: pilih preset sesuai modalitas dan reset kamera. */
  show(modality: string): void;
  setStatus(text: string): void;
  destroy(): void;
}

export function createVolumeRenderPanel(viewportId = 'vr-3d'): VolumeRenderPanel {
  const toolGroupId = `${viewportId}-tools`;
  let renderingEngineId: string | undefined;
  let presets: VrPreset[] = [];
  let initialOrientation: Pick<Types.ICamera, 'viewPlaneNormal' | 'viewUp'> | undefined;

  const element = document.createElement('div');
  element.className = 'vr-panel';

  const viewportElement = document.createElement('div');
  viewportElement.className = 'viewport';
  viewportElement.addEventListener('contextmenu', (event) => event.preventDefault());

  const label = Object.assign(document.createElement('div'), { className: 'vr-label', textContent: '3D' });
  const status = Object.assign(document.createElement('div'), { className: 'vr-status' });

  const select = document.createElement('select');
  select.className = 'vr-select';
  select.setAttribute('aria-label', 'Preset volume rendering');
  select.addEventListener('change', () => applyPreset(presets[select.selectedIndex]));

  const resetButton = Object.assign(document.createElement('button'), {
    type: 'button',
    className: 'btn vr-reset',
    textContent: 'Reset 3D',
    title: 'Kembalikan arah pandang dan zoom 3D',
  });
  resetButton.addEventListener('click', () => resetCamera());

  const controls = Object.assign(document.createElement('div'), { className: 'vr-controls' });
  controls.append(select, resetButton);
  element.append(viewportElement, label, controls, status);

  const viewport = () =>
    renderingEngineId ? getRenderingEngine(renderingEngineId)?.getViewport<Types.IVolumeViewport>(viewportId) : undefined;

  function applyPreset(preset: VrPreset | undefined) {
    const vp = viewport();
    const entry = vp?.getDefaultActor();
    if (!vp || !entry || !preset) return;
    const actor = entry.actor as vtkVolume;
    // VolumeViewport3D.setBlendMode di Cornerstone tidak melakukan apa-apa, jadi blend mode diatur
    // langsung di mapper vtk.js aktor ini (mapper per viewport; tekstur volume tetap dipakai bersama MPR).
    if (preset.mip) {
      const range = preset.mip === 'data' ? cache.getVolume(entry.referencedId ?? entry.uid)?.voxelManager?.getRange() : preset.mip;
      if (range) applyMipTransferFunction(actor, range);
      actor.getMapper()?.setBlendModeToMaximumIntensity();
    } else {
      vp.setProperties({ preset: preset.id });
      actor.getMapper()?.setBlendModeToComposite();
    }
    label.textContent = `3D · ${preset.label}`;
    vp.render();
  }

  /** resetCamera bawaan hanya mereset zoom/pan; arah pandang setelah diputar dikembalikan manual. */
  function resetCamera() {
    const vp = viewport();
    if (!vp) return;
    if (initialOrientation) vp.setCamera({ ...initialOrientation });
    vp.resetCamera();
    vp.render();
  }

  return {
    element,
    viewportId,
    viewportInput: {
      viewportId,
      type: Enums.ViewportType.VOLUME_3D,
      element: viewportElement as HTMLDivElement,
      // Tampak depan (koronal) — orientasi baku untuk melihat kalvaria/wajah.
      defaultOptions: { orientation: Enums.OrientationAxis.CORONAL, background: [0, 0, 0] as Types.Point3 },
    },

    attach(engineId) {
      renderingEngineId = engineId;
      for (const Tool of [TrackballRotateTool, ZoomTool, PanTool]) addTool(Tool);
      const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
      if (!toolGroup) throw new Error(`Tool group ${toolGroupId} sudah ada`);
      for (const Tool of [TrackballRotateTool, ZoomTool, PanTool]) toolGroup.addTool(Tool.toolName);
      toolGroup.addViewport(viewportId, engineId);
      // kiri / 1 jari: putar · roda, kanan, pinch: zoom · tengah / 3 jari: geser
      toolGroup.setToolActive(TrackballRotateTool.toolName, { bindings: [{ mouseButton: MouseBindings.Primary }] });
      toolGroup.setToolActive(ZoomTool.toolName, {
        bindings: [
          { mouseButton: MouseBindings.Wheel },
          { mouseButton: MouseBindings.Wheel, modifierKey: KeyboardBindings.Ctrl },
          { mouseButton: MouseBindings.Secondary },
          { numTouchPoints: 2 },
        ],
      });
      toolGroup.setToolActive(PanTool.toolName, {
        bindings: [{ mouseButton: MouseBindings.Auxiliary }, { numTouchPoints: 3 }],
      });
    },

    show(modality) {
      presets = modality === 'CT' ? VR_PRESETS.CT : VR_PRESETS.MR;
      select.replaceChildren(...presets.map((p) => new Option(p.label, p.id)));
      applyPreset(presets[0]);
      const vp = viewport();
      if (vp) {
        vp.resetCamera();
        const { viewPlaneNormal, viewUp } = vp.getCamera();
        initialOrientation = { viewPlaneNormal, viewUp };
        vp.render();
      }
    },

    setStatus(text) {
      status.textContent = text;
    },

    destroy() {
      ToolGroupManager.destroyToolGroup(toolGroupId);
    },
  };
}

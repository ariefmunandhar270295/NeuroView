import { Enums, getRenderingEngine, setVolumesForViewports, type Types } from '@cornerstonejs/core';
import type { MprContext } from '../mpr-viewer';
import { add, probeViewUp, scale, trajectoryMetrics, type Vec3 } from './geometry';
import type { PlanStore } from './store';

const VIEWPORT_ID = 'probe-eye';
const SVG_NS = 'http://www.w3.org/2000/svg';
/** Setengah tinggi bidang pandang awal (mm): ±40 mm di sekitar sumbu probe. */
const FIELD_HALF_HEIGHT_MM = 40;
/** Slider boleh melewati target sejauh ini (mm). */
const BEYOND_TARGET_MM = 10;
/** Cincin jarak di sekitar sumbu (mm). */
const RINGS_MM = [2, 5];

/**
 * Probe's eye view: reslice tegak lurus trajektori aktif, dilihat dari arah entry. Kedalaman
 * (jarak dari entry) diatur lewat slider atau roda mouse. Atas layar = anterior pasien
 * (superior bila trajektori hampir sejajar sumbu AP). W/L mengikuti bidang aksial MPR.
 */
export function createProbeView(store: PlanStore, onDepthChange: () => void) {
  const element = Object.assign(document.createElement('div'), { className: 'probe-view' });
  const viewportElement = Object.assign(document.createElement('div'), { className: 'viewport' }) as HTMLDivElement;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.classList.add('plan-overlay');
  const title = Object.assign(document.createElement('div'), { className: 'probe-title' });
  const info = Object.assign(document.createElement('div'), { className: 'probe-info' });
  const empty = Object.assign(document.createElement('div'), {
    className: 'probe-empty',
    textContent: 'Tandai entry dan target trajektori untuk melihat probe’s eye.',
  });
  const slider = Object.assign(document.createElement('input'), {
    type: 'range',
    className: 'probe-depth',
    min: '0',
    step: '0.5',
  });
  slider.setAttribute('aria-label', 'Kedalaman dari entry (mm)');
  element.append(viewportElement, svg, title, slider, info, empty);

  let context: MprContext | undefined;
  let enabled = false;
  let volumeId: string | undefined;
  let attachedVolumeId: string | undefined;
  let visible = false;
  /** Kedalaman per trajektori (mm dari entry); default di target. */
  const depths = new Map<string, number>();
  let lastTrajectoryKey = '';

  const engine = () => (context ? getRenderingEngine(context.renderingEngineId) : undefined);
  const viewport = () => (enabled ? engine()?.getViewport<Types.IVolumeViewport>(VIEWPORT_ID) : undefined);

  function current() {
    const t = store.active();
    if (!t?.entry || !t.target) return undefined;
    const metrics = trajectoryMetrics(t.entry, t.target);
    if (!metrics) return undefined;
    const depth = Math.min(depths.get(t.id) ?? metrics.length, metrics.length + BEYOND_TARGET_MM);
    return { t, entry: t.entry, metrics, depth };
  }

  async function ensureViewport() {
    const re = engine();
    if (!re || !volumeId) return;
    if (!enabled) {
      re.enableElement({
        viewportId: VIEWPORT_ID,
        type: Enums.ViewportType.ORTHOGRAPHIC,
        element: viewportElement,
        defaultOptions: { orientation: Enums.OrientationAxis.AXIAL, background: [0, 0, 0] as Types.Point3 },
      });
      enabled = true;
    }
    if (attachedVolumeId !== volumeId) {
      attachedVolumeId = volumeId;
      lastTrajectoryKey = '';
      await setVolumesForViewports(re, [{ volumeId }], [VIEWPORT_ID]);
      copyVoi();
    }
  }

  function copyVoi() {
    const axial = context && engine()?.getViewport<Types.IVolumeViewport>(context.planes[0].viewportId);
    const voiRange = axial?.getProperties()?.voiRange;
    if (voiRange) viewport()?.setProperties({ voiRange });
  }

  function update() {
    const c = current();
    empty.hidden = !!c;
    slider.hidden = !c;
    title.textContent = c ? `Probe’s eye · ${c.t.name}` : 'Probe’s eye';
    const vp = viewport();
    if (!c) {
      info.textContent = '';
      svg.replaceChildren();
      return;
    }
    const max = c.metrics.length + BEYOND_TARGET_MM;
    slider.max = String(max);
    slider.value = String(c.depth);
    const toTarget = c.metrics.length - c.depth;
    info.textContent =
      `Kedalaman ${c.depth.toFixed(1)} / ${c.metrics.length.toFixed(1)} mm · ` +
      (toTarget >= 0 ? `${toTarget.toFixed(1)} mm ke target` : `${(-toTarget).toFixed(1)} mm melewati target`);
    if (!vp || !visible) return;

    const d = c.metrics.direction;
    const normal = scale(d, -1);
    const focalPoint = add(c.entry, scale(d, c.depth));
    // Zoom awal hanya di-set saat trajektori (atau titiknya) berubah, bukan saat menggeser kedalaman.
    const key = `${c.t.id}|${c.entry.join()}|${c.t.target!.join()}`;
    const camera: Partial<Types.ICamera> = {
      viewPlaneNormal: normal as Types.Point3,
      viewUp: probeViewUp(d) as Types.Point3,
      focalPoint: focalPoint as Types.Point3,
      position: add(focalPoint, scale(normal, 300)) as Types.Point3,
    };
    if (key !== lastTrajectoryKey) camera.parallelScale = FIELD_HALF_HEIGHT_MM;
    lastTrajectoryKey = key;
    vp.setCamera(camera);
    vp.render();
  }

  function drawOverlay() {
    svg.replaceChildren();
    const vp = viewport();
    const c = current();
    if (!vp || !c) return;
    const { clientWidth: w, clientHeight: h } = viewportElement;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const focal = add(c.entry, scale(c.metrics.direction, c.depth));
    const [cx, cy] = vp.worldToCanvas(focal as Types.Point3);
    const up = probeViewUp(c.metrics.direction);
    const node = (tag: string, attrs: Record<string, string | number>) => {
      const n = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
      svg.append(n);
      return n;
    };
    RINGS_MM.forEach((r, i) => {
      const [ux, uy] = vp.worldToCanvas(add(focal, scale(up, r)) as Types.Point3);
      const radius = Math.hypot(ux - cx, uy - cy);
      node('circle', { cx, cy, r: radius, fill: 'none', stroke: c.t.color, 'stroke-width': 1, 'stroke-dasharray': '3 3' });
      // Label bergantian kiri-bawah / kanan-atas agar cincin yang berdekatan tidak bertumpuk.
      const side = i % 2 === 0 ? -1 : 1;
      const label = node('text', {
        x: cx + side * (radius * 0.71 + 2),
        y: cy - side * (radius * 0.71 + 2),
        fill: c.t.color,
        class: 'plan-label',
        'text-anchor': side < 0 ? 'end' : 'start',
        'dominant-baseline': side < 0 ? 'hanging' : 'auto',
      });
      label.textContent = `${r} mm`;
    });
    node('line', { x1: cx - 10, y1: cy, x2: cx + 10, y2: cy, stroke: c.t.color, 'stroke-width': 2 });
    node('line', { x1: cx, y1: cy - 10, x2: cx, y2: cy + 10, stroke: c.t.color, 'stroke-width': 2 });
    const orientation = node('text', { x: w / 2, y: 64, fill: '#fff', class: 'plan-label', 'text-anchor': 'middle' });
    orientation.textContent = Math.abs(up[1]) > Math.abs(up[2]) ? 'Anterior ↑' : 'Superior ↑';
  }

  function setDepth(depth: number) {
    const c = current();
    if (!c) return;
    depths.set(c.t.id, Math.max(0, Math.min(depth, c.metrics.length + BEYOND_TARGET_MM)));
    update();
    onDepthChange();
  }

  slider.addEventListener('input', () => setDepth(Number(slider.value)));
  // Roda mouse = maju/mundur 1 mm sepanjang trajektori (Shift: 0.5 mm).
  element.addEventListener(
    'wheel',
    (event) => {
      const c = current();
      if (!c) return;
      event.preventDefault();
      setDepth(c.depth + Math.sign(event.deltaY) * (event.shiftKey ? 0.5 : 1));
    },
    { passive: false },
  );
  viewportElement.addEventListener(Enums.Events.IMAGE_RENDERED, drawOverlay);

  return {
    element,
    attach(ctx: MprContext) {
      context = ctx;
      ctx.planes[0].viewportElement.addEventListener(Enums.Events.VOI_MODIFIED, ((
        event: Types.EventTypes.VoiModifiedEvent,
      ) => {
        viewport()?.setProperties({ voiRange: event.detail.range });
        viewport()?.render();
      }) as EventListener);
    },
    async setVolume(id: string) {
      volumeId = id;
      if (visible) await ensureViewport();
      update();
    },
    /** Dipanggil saat tab probe's eye dipilih: viewport dibuat/diisi saat pertama terlihat. */
    async show() {
      visible = true;
      await ensureViewport();
      lastTrajectoryKey = '';
      update();
    },
    hide() {
      visible = false;
      onDepthChange();
    },
    update,
    /** Titik probe saat ini (untuk ditandai di MPR), hanya saat probe's eye terlihat. */
    probePoint(): Vec3 | undefined {
      const c = visible ? current() : undefined;
      return c ? add(c.entry, scale(c.metrics.direction, c.depth)) : undefined;
    },
  };
}

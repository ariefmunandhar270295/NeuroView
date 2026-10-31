import { Enums, getRenderingEngine, type Types } from '@cornerstonejs/core';
import type { MprContext, MprPlane } from '../mpr-viewer';
import {
  add,
  distanceToPlane,
  normalize,
  scale,
  segmentPlaneIntersection,
  sub,
  type Vec3,
} from './geometry';
import { LANDMARK_LABELS, type LandmarkId, type PlanStore } from './store';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Titik dalam jarak ini (mm) dari bidang irisan digambar penuh; lebih jauh digambar redup. */
const IN_PLANE_MM = 1.5;
/** Perpanjangan trajektori ke luar entry (mm), menunjukkan arah datang probe. */
export const EXTENSION_MM = 40;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/**
 * Overlay SVG perencanaan di tiap bidang MPR: proyeksi trajektori (dan perpanjangannya),
 * entry/target, titik potong trajektori dengan irisan aktif, landmark AC/PC/midline, serta
 * posisi probe's eye. Digambar ulang setiap viewport selesai render (irisan, zoom, pan, oblik).
 */
export function createPlanOverlay(context: MprContext, store: PlanStore, getProbePoint: () => Vec3 | undefined) {
  const engine = () => getRenderingEngine(context.renderingEngineId);

  const layers = context.planes.map((plane) => {
    const svg = el('svg', { class: 'plan-overlay' });
    plane.cell.insertBefore(svg, plane.viewportElement.nextSibling);
    plane.viewportElement.addEventListener(Enums.Events.IMAGE_RENDERED, () => draw(plane, svg));
    return { plane, svg };
  });

  function draw(plane: MprPlane, svg: SVGSVGElement) {
    svg.replaceChildren();
    const vp = engine()?.getViewport<Types.IVolumeViewport>(plane.viewportId);
    if (!vp || !vp.getDefaultActor()) return;
    const { clientWidth: w, clientHeight: h } = plane.viewportElement;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

    const { focalPoint, viewPlaneNormal } = vp.getCamera();
    const planePoint = focalPoint as Vec3;
    const normal = viewPlaneNormal as Vec3;
    const toCanvas = (p: Vec3) => vp.worldToCanvas(p as Types.Point3);
    const inPlane = (p: Vec3) => Math.abs(distanceToPlane(p, planePoint, normal)) <= IN_PLANE_MM;

    const activeId = store.active()?.id;
    for (const t of store.trajectories) {
      const isActive = t.id === activeId;
      const width = isActive ? 2.5 : 1.5;
      const opacity = isActive ? 1 : 0.6;
      if (t.entry && t.target) {
        const [x1, y1] = toCanvas(t.entry);
        const [x2, y2] = toCanvas(t.target);
        const outward = add(t.entry, scale(normalize(sub(t.entry, t.target)), EXTENSION_MM));
        const [x0, y0] = toCanvas(outward);
        svg.append(
          el('line', { x1: x0, y1: y0, x2: x1, y2: y1, stroke: t.color, 'stroke-width': 1, 'stroke-dasharray': '4 4', opacity }),
          el('line', { x1, y1, x2, y2, stroke: t.color, 'stroke-width': width, opacity }),
        );
        // Tempat trajektori menembus irisan yang sedang ditampilkan.
        const hit = segmentPlaneIntersection(t.entry, t.target, planePoint, normal);
        if (hit) {
          const [hx, hy] = toCanvas(hit);
          svg.append(el('circle', { cx: hx, cy: hy, r: 3.5, fill: t.color, stroke: '#000', 'stroke-width': 1 }));
        }
      }
      for (const [point, p] of [['entry', t.entry], ['target', t.target]] as const) {
        if (!p) continue;
        const [x, y] = toCanvas(p);
        const solid = inPlane(p);
        const r = point === 'target' ? 7 : 5;
        svg.append(
          el('circle', {
            cx: x,
            cy: y,
            r,
            fill: solid ? t.color : 'none',
            'fill-opacity': solid ? 0.35 : 0,
            stroke: t.color,
            'stroke-width': isActive ? 2 : 1.5,
            opacity: solid ? 1 : 0.55,
          }),
        );
        if (point === 'target') {
          svg.append(
            el('line', { x1: x - r - 4, y1: y, x2: x + r + 4, y2: y, stroke: t.color, 'stroke-width': 1, opacity }),
            el('line', { x1: x, y1: y - r - 4, x2: x, y2: y + r + 4, stroke: t.color, 'stroke-width': 1, opacity }),
          );
        }
        if (isActive) {
          const label = el('text', { x: x + r + 4, y: y - r - 2, fill: t.color, class: 'plan-label' });
          label.textContent = point === 'target' ? 'T' : 'E';
          svg.append(label);
        }
      }
    }

    for (const [id, p] of Object.entries(store.landmarks) as [LandmarkId, Vec3][]) {
      const [x, y] = toCanvas(p);
      const solid = inPlane(p);
      svg.append(
        el('rect', {
          x: x - 4,
          y: y - 4,
          width: 8,
          height: 8,
          transform: `rotate(45 ${x} ${y})`,
          fill: solid ? '#fff' : 'none',
          stroke: '#fff',
          'stroke-width': 1.5,
          opacity: solid ? 1 : 0.5,
        }),
      );
      const label = el('text', { x: x + 7, y: y + 4, fill: '#fff', class: 'plan-label' });
      label.textContent = LANDMARK_LABELS[id];
      svg.append(label);
    }

    const probe = getProbePoint();
    if (probe) {
      const [x, y] = toCanvas(probe);
      svg.append(el('circle', { cx: x, cy: y, r: 5, fill: 'none', stroke: '#fff', 'stroke-width': 2 }));
      svg.append(el('circle', { cx: x, cy: y, r: 1.5, fill: '#fff' }));
    }
  }

  return {
    /** Gambar ulang semua bidang (mis. setelah rencana berubah). */
    redraw() {
      for (const { plane, svg } of layers) draw(plane, svg);
    },
  };
}

import { getRenderingEngine, type Types } from '@cornerstonejs/core';
import vtkTubeFilter from '@kitware/vtk.js/Filters/General/TubeFilter';
import vtkLineSource from '@kitware/vtk.js/Filters/Sources/LineSource';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import { add, normalize, scale, sub, type Vec3 } from './geometry';
import { EXTENSION_MM } from './overlay2d';
import type { PlanStore } from './store';

const ACTOR_PREFIX = 'plan-';

function hexToRgb(hex: string): Vec3 {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function tube(from: Vec3, to: Vec3, radius: number, color: Vec3, opacity = 1) {
  const line = vtkLineSource.newInstance({ point1: from, point2: to, resolution: 1 });
  const filter = vtkTubeFilter.newInstance({ radius, numberOfSides: 16, capping: true });
  filter.setInputConnection(line.getOutputPort());
  return actorFor(filter, color, opacity);
}

function sphere(center: Vec3, radius: number, color: Vec3) {
  const source = vtkSphereSource.newInstance({ center, radius, thetaResolution: 20, phiResolution: 20 });
  return actorFor(source, color, 1);
}

function actorFor(source: { getOutputPort(): unknown }, color: Vec3, opacity: number) {
  const mapper = vtkMapper.newInstance();
  mapper.setInputConnection(source.getOutputPort() as never);
  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);
  actor.getProperty().setColor(...color);
  actor.getProperty().setOpacity(opacity);
  return actor;
}

/**
 * Trajektori di viewport 3D sebagai geometri vtk.js (tabung + bola) di dalam volume rendering:
 * tabung entry→target, perpanjangan tipis ke luar entry, bola entry/target, dan landmark.
 * Dengan preset Tulang, bagian di dalam tengkorak tertutup tulang; perpanjangan luar tetap
 * menunjukkan arah datang, dan preset Jaringan lunak/MIP memperlihatkan bagian dalamnya.
 */
export function createPlanScene(renderingEngineId: string, viewportId: string, store: PlanStore) {
  let actorUids: string[] = [];

  function rebuild() {
    const vp = getRenderingEngine(renderingEngineId)?.getViewport<Types.IVolumeViewport>(viewportId);
    if (!vp || !vp.getDefaultActor()) return;
    // Ganti volume (setVolumes) bisa sudah membuang aktor lama; hapus hanya yang masih ada.
    const existing = new Set(vp.getActors().map((a) => a.uid));
    const stale = actorUids.filter((uid) => existing.has(uid));
    if (stale.length) vp.removeActors(stale);

    const entries: Types.ActorEntry[] = [];
    const push = (actor: vtkActor) => entries.push({ uid: `${ACTOR_PREFIX}${entries.length}`, actor });
    const activeId = store.active()?.id;

    for (const t of store.trajectories) {
      const color = hexToRgb(t.color);
      const radius = t.id === activeId ? 1.2 : 0.8;
      if (t.entry && t.target) {
        push(tube(t.entry, t.target, radius, color));
        const outward = add(t.entry, scale(normalize(sub(t.entry, t.target)), EXTENSION_MM));
        push(tube(t.entry, outward, radius * 0.6, color, 0.8));
      }
      if (t.entry) push(sphere(t.entry, 2.5, color));
      if (t.target) push(sphere(t.target, 3, color));
    }
    for (const p of Object.values(store.landmarks)) if (p) push(sphere(p, 2, [1, 1, 1]));

    if (entries.length) vp.addActors(entries, { resetCamera: false });
    actorUids = entries.map((e) => e.uid);
    vp.render();
  }

  return { rebuild };
}

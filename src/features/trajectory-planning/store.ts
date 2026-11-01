import { acPcFrame, lpsToRas, toAcPc, trajectoryMetrics, type AcPcFrame, type Vec3 } from './geometry';

export type LandmarkId = 'ac' | 'pc' | 'mid';
export type TrajectoryPoint = 'entry' | 'target';

export const LANDMARK_LABELS: Record<LandmarkId, string> = { ac: 'AC', pc: 'PC', mid: 'Midline' };

export interface Trajectory {
  id: string;
  name: string;
  color: string;
  entry?: Vec3;
  target?: Vec3;
}

interface FramePlan {
  landmarks: Partial<Record<LandmarkId, Vec3>>;
  trajectories: Trajectory[];
  activeId?: string;
}

/** Titik yang bisa diseret: landmark (`ac`, `pc`, `mid`) atau `<id trajektori>:entry|target`. */
export interface PlanHandle {
  id: string;
  world: Vec3;
}

/** Warna trajektori; sengaja berbeda dari warna crosshair (merah/hijau/kuning). */
const COLORS = ['#4cc9f0', '#f72585', '#ff9f1c', '#b388ff', '#80ed99'];

export const DISCLAIMER =
  'Hanya untuk edukasi. Tidak tervalidasi untuk perencanaan, navigasi, atau keputusan klinis.';

export interface SeriesInfo {
  frameOfReferenceUID: string;
  studyInstanceUID: string;
  seriesInstanceUID: string;
  description: string;
}

/**
 * State perencanaan, terpisah per FrameOfReferenceUID: koordinat (mm) hanya bermakna di kerangka
 * yang sama, jadi berpindah ke series dengan kerangka lain menampilkan rencana lain.
 */
export function createPlanStore() {
  const plans = new Map<string, FramePlan>();
  let series: SeriesInfo | undefined;
  let plan: FramePlan = { landmarks: {}, trajectories: [] };
  let pending: string | undefined;
  let counter = 0;
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach((listener) => listener());

  function setSeries(info: SeriesInfo) {
    series = info;
    // Tanpa FrameOfReferenceUID, rencana diikat ke series itu saja agar tidak salah kerangka.
    const key = info.frameOfReferenceUID || `series:${info.seriesInstanceUID}`;
    if (!plans.has(key)) plans.set(key, { landmarks: {}, trajectories: [] });
    plan = plans.get(key)!;
    pending = undefined;
    emit();
  }

  function active(): Trajectory | undefined {
    return plan.trajectories.find((t) => t.id === plan.activeId);
  }

  function addTrajectory(): Trajectory {
    counter += 1;
    const trajectory: Trajectory = {
      id: `t${counter}`,
      name: `Trajektori ${plan.trajectories.length + 1}`,
      color: COLORS[plan.trajectories.length % COLORS.length],
    };
    plan.trajectories.push(trajectory);
    plan.activeId = trajectory.id;
    emit();
    return trajectory;
  }

  function removeTrajectory(id: string) {
    plan.trajectories = plan.trajectories.filter((t) => t.id !== id);
    if (plan.activeId === id) plan.activeId = plan.trajectories.at(-1)?.id;
    if (pending?.startsWith(`${id}:`)) pending = undefined;
    emit();
  }

  function update(id: string, patch: Partial<Pick<Trajectory, 'name'>>) {
    const trajectory = plan.trajectories.find((t) => t.id === id);
    if (!trajectory) return;
    Object.assign(trajectory, patch);
    emit();
  }

  function setActive(id: string) {
    plan.activeId = id;
    emit();
  }

  function handles(): PlanHandle[] {
    const out: PlanHandle[] = [];
    for (const [id, world] of Object.entries(plan.landmarks)) if (world) out.push({ id, world });
    for (const t of plan.trajectories) {
      if (t.entry) out.push({ id: `${t.id}:entry`, world: t.entry });
      if (t.target) out.push({ id: `${t.id}:target`, world: t.target });
    }
    return out;
  }

  /** Simpan titik untuk handle; dipakai saat menandai baru maupun saat menyeret. */
  function setHandle(handleId: string, world: Vec3) {
    const [trajectoryId, point] = handleId.split(':') as [string, TrajectoryPoint | undefined];
    if (point) {
      const trajectory = plan.trajectories.find((t) => t.id === trajectoryId);
      if (!trajectory) return;
      trajectory[point] = world;
      plan.activeId = trajectory.id;
    } else {
      plan.landmarks[handleId as LandmarkId] = world;
    }
    emit();
  }

  function clearLandmark(id: LandmarkId) {
    delete plan.landmarks[id];
    emit();
  }

  /** Mode tandai: klik berikutnya di MPR menyimpan titik untuk handle ini. */
  function setPending(handleId: string | undefined) {
    pending = handleId;
    emit();
  }

  function place(world: Vec3) {
    if (!pending) return;
    const handleId = pending;
    pending = undefined;
    setHandle(handleId, world);
  }

  function frame(): AcPcFrame | undefined {
    const { ac, pc, mid } = plan.landmarks;
    return ac && pc ? acPcFrame(ac, pc, mid) : undefined;
  }

  function toJSON() {
    const f = frame();
    const round = (v: number) => Math.round(v * 100) / 100;
    const r3 = (p: Vec3) => p.map(round) as Vec3;
    const point = (p: Vec3) => ({
      lps: r3(p),
      ras: r3(lpsToRas(p)),
      ...(f ? { acpc: Object.fromEntries(Object.entries(toAcPc(f, p)).map(([k, v]) => [k, round(v)])) } : {}),
    });
    return {
      format: 'neuroviewer-trajectory-plan',
      version: 1,
      createdAt: new Date().toISOString(),
      disclaimer: DISCLAIMER,
      coordinateSystems: {
        lps: 'Koordinat pasien DICOM (LPS: +x kiri, +y posterior, +z superior), mm',
        ras: 'RAS (+x kanan, +y anterior, +z superior), mm',
        acpc: 'Relatif MCP: lateral (+kanan), ap (+anterior), vertical (+superior), mm',
      },
      frameOfReferenceUID: series?.frameOfReferenceUID || null,
      studyInstanceUID: series?.studyInstanceUID ?? null,
      seriesInstanceUID: series?.seriesInstanceUID ?? null,
      seriesDescription: series?.description ?? null,
      landmarks: {
        ...Object.fromEntries(
          (Object.entries(plan.landmarks) as [LandmarkId, Vec3][]).map(([id, p]) => [id, point(p)]),
        ),
        ...(f ? { mcp: point(f.origin), acPcLengthMm: round(f.acPcLength) } : {}),
      },
      trajectories: plan.trajectories.map((t) => {
        const metrics = t.entry && t.target ? trajectoryMetrics(t.entry, t.target, f) : undefined;
        return {
          name: t.name,
          entry: t.entry ? point(t.entry) : null,
          target: t.target ? point(t.target) : null,
          lengthMm: metrics ? round(metrics.length) : null,
          directionLps: metrics ? metrics.direction.map((v) => Math.round(v * 10000) / 10000) : null,
          angles: metrics?.angles
            ? {
                elevationToAcPcPlaneDeg: round(metrics.angles.elevation),
                sagittalFromAcPcLineDeg: round(metrics.angles.sagittal),
                coronalFromVerticalDeg: round(metrics.angles.coronal),
                coronalEntrySide: metrics.angles.coronalSide,
              }
            : null,
        };
      }),
    };
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get series() {
      return series;
    },
    get trajectories(): readonly Trajectory[] {
      return plan.trajectories;
    },
    get landmarks(): Readonly<Partial<Record<LandmarkId, Vec3>>> {
      return plan.landmarks;
    },
    get pending() {
      return pending;
    },
    active,
    frame,
    handles,
    setSeries,
    addTrajectory,
    removeTrajectory,
    update,
    setActive,
    setHandle,
    clearLandmark,
    setPending,
    place,
    toJSON,
  };
}

export type PlanStore = ReturnType<typeof createPlanStore>;

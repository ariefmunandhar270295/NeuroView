import { describe, expect, it } from 'vitest';
import {
  acPcFrame,
  add,
  distanceToPlane,
  lpsToRas,
  normalize,
  probeViewUp,
  scale,
  segmentPlaneIntersection,
  toAcPc,
  trajectoryMetrics,
  dot,
  type Vec3,
} from './geometry';

// Kepala lurus: AC 12 mm anterior, PC 12 mm posterior dari MCP di (0, 0, 0). LPS: anterior = -y.
const AC: Vec3 = [0, -12, 0];
const PC: Vec3 = [0, 12, 0];
const rad = (d: number) => (d * Math.PI) / 180;

/** Rotasi terhadap sumbu x (pitch), y (roll di bidang koronal), lalu translasi. */
function transform(p: Vec3, { pitch = 0, roll = 0, shift = [0, 0, 0] as Vec3 } = {}): Vec3 {
  const [x, y, z] = p;
  const y1 = y * Math.cos(rad(pitch)) - z * Math.sin(rad(pitch));
  const z1 = y * Math.sin(rad(pitch)) + z * Math.cos(rad(pitch));
  const x2 = x * Math.cos(rad(roll)) + z1 * Math.sin(rad(roll));
  const z2 = -x * Math.sin(rad(roll)) + z1 * Math.cos(rad(roll));
  return add([x2, y1, z2], shift);
}

describe('acPcFrame', () => {
  it('membentuk sumbu kanan/anterior/superior pada kepala lurus', () => {
    const f = acPcFrame(AC, PC)!;
    expect(f.origin).toEqual([0, 0, 0]);
    expect(f.acPcLength).toBeCloseTo(24);
    expect(f.anterior).toEqual([0, -1, 0]);
    expect(f.right[0]).toBeCloseTo(-1);
    expect(f.superior[2]).toBeCloseTo(1);
  });

  it('menolak AC = PC', () => {
    expect(acPcFrame(AC, AC)).toBeUndefined();
  });
});

describe('toAcPc', () => {
  it('menghitung koordinat target STN-like relatif MCP', () => {
    // 12 mm kanan, 2 mm posterior, 4 mm inferior dari MCP.
    const target: Vec3 = [-12, 2, -4];
    const c = toAcPc(acPcFrame(AC, PC)!, target);
    expect(c.lateral).toBeCloseTo(12);
    expect(c.ap).toBeCloseTo(-2);
    expect(c.vertical).toBeCloseTo(-4);
  });

  it('tidak berubah bila kepala menunduk dan bergeser (pitch + translasi)', () => {
    const opts = { pitch: 17, shift: [5, -30, 42] as Vec3 };
    const f = acPcFrame(transform(AC, opts), transform(PC, opts))!;
    const c = toAcPc(f, transform([-12, 2, -4], opts));
    expect(c.lateral).toBeCloseTo(12);
    expect(c.ap).toBeCloseTo(-2);
    expect(c.vertical).toBeCloseTo(-4);
  });

  it('dengan titik midline, tetap benar walau kepala miring ke samping (roll)', () => {
    const opts = { roll: 12, pitch: -8, shift: [3, 4, 5] as Vec3 };
    const midline = transform([0, 0, 40], opts); // titik di bidang mid-sagital, di atas MCP
    const f = acPcFrame(transform(AC, opts), transform(PC, opts), midline)!;
    const c = toAcPc(f, transform([-12, 2, -4], opts));
    expect(c.lateral).toBeCloseTo(12);
    expect(c.ap).toBeCloseTo(-2);
    expect(c.vertical).toBeCloseTo(-4);
  });

  it('tanpa midline, roll kepala menggeser koordinat (alasan titik midline opsional)', () => {
    const opts = { roll: 12 };
    const f = acPcFrame(transform(AC, opts), transform(PC, opts))!;
    const c = toAcPc(f, transform([-12, 2, -4], opts));
    expect(Math.abs(c.vertical - -4)).toBeGreaterThan(1);
  });
});

describe('trajectoryMetrics', () => {
  const frame = acPcFrame(AC, PC)!;
  const target: Vec3 = [-12, 2, -4];

  it('trajektori vertikal: 90° terhadap bidang AC-PC, sagital 90°, koronal 0°', () => {
    const m = trajectoryMetrics(add(target, [0, 0, 60]), target, frame)!;
    expect(m.length).toBeCloseTo(60);
    expect(m.direction).toEqual([0, 0, -1]);
    expect(m.angles!.elevation).toBeCloseTo(90);
    expect(m.angles!.sagittal).toBeCloseTo(90);
    expect(m.angles!.coronal).toBeCloseTo(0);
    expect(m.angles!.coronalSide).toBe('tengah');
  });

  it('miring 60° dari garis AC-PC ke anterior', () => {
    const up: Vec3 = [0, -Math.cos(rad(60)), Math.sin(rad(60))];
    const m = trajectoryMetrics(add(target, scale(up, 70)), target, frame)!;
    expect(m.length).toBeCloseTo(70);
    expect(m.angles!.sagittal).toBeCloseTo(60);
    expect(m.angles!.elevation).toBeCloseTo(60);
    expect(m.angles!.coronal).toBeCloseTo(0);
  });

  it('miring 15° ke lateral kanan', () => {
    const up: Vec3 = [-Math.sin(rad(15)), 0, Math.cos(rad(15))];
    const m = trajectoryMetrics(add(target, scale(up, 50)), target, frame)!;
    expect(m.angles!.coronal).toBeCloseTo(15);
    expect(m.angles!.coronalSide).toBe('kanan');
    expect(m.angles!.sagittal).toBeCloseTo(90);
    expect(m.angles!.elevation).toBeCloseTo(75);
  });

  it('sudut tidak berubah oleh pitch kepala', () => {
    const opts = { pitch: 20, shift: [1, 2, 3] as Vec3 };
    const up: Vec3 = normalize([-Math.sin(rad(15)), -Math.cos(rad(60)), Math.sin(rad(60))]);
    const f = acPcFrame(transform(AC, opts), transform(PC, opts))!;
    const ref = trajectoryMetrics(add(target, scale(up, 65)), target, frame)!;
    const moved = trajectoryMetrics(transform(add(target, scale(up, 65)), opts), transform(target, opts), f)!;
    expect(moved.length).toBeCloseTo(ref.length);
    expect(moved.angles!.elevation).toBeCloseTo(ref.angles!.elevation);
    expect(moved.angles!.sagittal).toBeCloseTo(ref.angles!.sagittal);
    expect(moved.angles!.coronal).toBeCloseTo(ref.angles!.coronal);
  });

  it('tanpa AC-PC hanya panjang & arah', () => {
    const m = trajectoryMetrics([0, 0, 30], [0, 0, 0])!;
    expect(m.length).toBeCloseTo(30);
    expect(m.angles).toBeUndefined();
  });

  it('entry = target ditolak', () => {
    expect(trajectoryMetrics(target, target, frame)).toBeUndefined();
  });
});

describe('utilitas', () => {
  it('LPS → RAS membalik x dan y', () => {
    expect(lpsToRas([1, 2, 3])).toEqual([-1, -2, 3]);
  });

  it('probeViewUp tegak lurus arah trajektori', () => {
    for (const d of [[0, 0, -1], [0, -1, 0], normalize([1, 2, -3])] as Vec3[]) {
      const up = probeViewUp(d);
      expect(Math.abs(dot(up, d))).toBeLessThan(1e-9);
      expect(Math.hypot(...up)).toBeCloseTo(1);
    }
    // Trajektori vertikal → atas layar = anterior.
    expect(probeViewUp([0, 0, -1])).toEqual([0, -1, 0]);
  });

  it('titik potong segmen dengan bidang', () => {
    const p = segmentPlaneIntersection([0, 0, 10], [0, 0, -10], [5, 5, 2], [0, 0, 1]);
    expect(p).toEqual([0, 0, 2]);
    expect(segmentPlaneIntersection([0, 0, 10], [0, 0, 5], [0, 0, 2], [0, 0, 1])).toBeUndefined();
    expect(distanceToPlane([0, 0, 7], [0, 0, 2], [0, 0, 1])).toBe(5);
  });
});

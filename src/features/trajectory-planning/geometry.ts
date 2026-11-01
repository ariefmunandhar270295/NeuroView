// Geometri perencanaan trajektori. Semua titik dalam koordinat pasien DICOM (LPS, mm):
// +x = kiri pasien, +y = posterior, +z = superior.

export type Vec3 = [number, number, number];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: Vec3): number => Math.sqrt(dot(a, a));
export const distance = (a: Vec3, b: Vec3): number => length(sub(a, b));
export const normalize = (a: Vec3): Vec3 => scale(a, 1 / length(a));

const deg = (rad: number) => (rad * 180) / Math.PI;

/** LPS (DICOM) → RAS (mis. 3D Slicer): x dan y berganti tanda. */
export const lpsToRas = (p: Vec3): Vec3 => [-p[0], -p[1], p[2]];

/** Arah kanan pasien dalam LPS. */
const PATIENT_RIGHT: Vec3 = [-1, 0, 0];

/**
 * Sistem koordinat AC-PC (gaya stereotaksis), berpusat di MCP (titik tengah AC-PC):
 * - `anterior`: dari PC ke AC
 * - `right`: tegak lurus bidang mid-sagital. Dengan titik midline, bidang mid-sagital = bidang
 *   melalui AC, PC, dan midline; tanpa titik itu, diasumsikan arah kanan scanner yang
 *   diortogonalkan terhadap garis AC-PC (kepala dianggap tidak miring ke samping).
 * - `superior` = right × anterior (tangan kanan, seperti RAS)
 * Bidang AC-PC adalah bidang yang memuat garis AC-PC dan arah `right` (normalnya `superior`).
 */
export interface AcPcFrame {
  origin: Vec3;
  right: Vec3;
  anterior: Vec3;
  superior: Vec3;
  /** Jarak AC-PC (mm). */
  acPcLength: number;
}

export function acPcFrame(ac: Vec3, pc: Vec3, midline?: Vec3): AcPcFrame | undefined {
  const acPcLength = distance(ac, pc);
  if (acPcLength < 1e-6) return undefined;
  const anterior = normalize(sub(ac, pc));

  let right: Vec3 | undefined;
  if (midline) {
    const normal = cross(anterior, sub(midline, pc));
    if (length(normal) > 1e-6) {
      right = normalize(normal);
      if (dot(right, PATIENT_RIGHT) < 0) right = scale(right, -1);
    }
  }
  if (!right) {
    const projected = sub(PATIENT_RIGHT, scale(anterior, dot(PATIENT_RIGHT, anterior)));
    // Garis AC-PC sejajar sumbu kiri-kanan: tidak ada orientasi yang masuk akal.
    if (length(projected) < 1e-6) return undefined;
    right = normalize(projected);
  }

  return {
    origin: scale(add(ac, pc), 0.5),
    right,
    anterior,
    superior: cross(right, anterior),
    acPcLength,
  };
}

/** Koordinat relatif MCP: lateral (+kanan), AP (+anterior), vertikal (+superior), dalam mm. */
export interface AcPcCoordinates {
  lateral: number;
  ap: number;
  vertical: number;
}

export function toAcPc(frame: AcPcFrame, p: Vec3): AcPcCoordinates {
  const v = sub(p, frame.origin);
  return { lateral: dot(v, frame.right), ap: dot(v, frame.anterior), vertical: dot(v, frame.superior) };
}

export interface TrajectoryAngles {
  /** Sudut antara trajektori dan bidang AC-PC (0° = sejajar bidang, 90° = tegak lurus). */
  elevation: number;
  /**
   * Sudut sagital: arah target→entry diproyeksikan ke bidang mid-sagital, diukur dari garis
   * AC-PC ke arah anterior (90° = vertikal, < 90° = entry lebih anterior dari target).
   */
  sagittal: number;
  /** Sudut koronal: arah target→entry diproyeksikan ke bidang koronal, diukur dari vertikal. */
  coronal: number;
  /** Sisi entry relatif target pada bidang koronal. */
  coronalSide: 'kanan' | 'kiri' | 'tengah';
}

export interface TrajectoryMetrics {
  length: number;
  /** Vektor satuan entry → target. */
  direction: Vec3;
  angles?: TrajectoryAngles;
}

export function trajectoryMetrics(entry: Vec3, target: Vec3, frame?: AcPcFrame): TrajectoryMetrics | undefined {
  const len = distance(entry, target);
  if (len < 1e-6) return undefined;
  const direction = normalize(sub(target, entry));
  if (!frame) return { length: len, direction };

  const up = scale(direction, -1); // target → entry
  const r = dot(up, frame.right);
  const a = dot(up, frame.anterior);
  const s = dot(up, frame.superior);
  const coronalRad = Math.atan2(Math.abs(r), s);
  return {
    length: len,
    direction,
    angles: {
      elevation: deg(Math.asin(Math.min(1, Math.abs(s)))),
      sagittal: deg(Math.atan2(s, a)),
      coronal: deg(coronalRad),
      coronalSide: Math.abs(r) < 1e-6 ? 'tengah' : r > 0 ? 'kanan' : 'kiri',
    },
  };
}

/**
 * Arah "atas" layar untuk probe's eye view: anterior pasien diproyeksikan tegak lurus trajektori;
 * bila trajektori hampir sejajar sumbu AP, pakai superior.
 */
export function probeViewUp(direction: Vec3): Vec3 {
  for (const candidate of [[0, -1, 0], [0, 0, 1]] as Vec3[]) {
    const projected = sub(candidate, scale(direction, dot(candidate, direction)));
    if (length(projected) > 0.2) return normalize(projected);
  }
  return normalize(cross(direction, [1, 0, 0]));
}

/**
 * Titik potong segmen p0→p1 dengan bidang (titik `planePoint`, normal `normal`).
 * Mengembalikan undefined bila sejajar atau di luar segmen.
 */
export function segmentPlaneIntersection(p0: Vec3, p1: Vec3, planePoint: Vec3, normal: Vec3): Vec3 | undefined {
  const d = sub(p1, p0);
  const denom = dot(d, normal);
  if (Math.abs(denom) < 1e-9) return undefined;
  const t = dot(sub(planePoint, p0), normal) / denom;
  if (t < 0 || t > 1) return undefined;
  return add(p0, scale(d, t));
}

/** Jarak bertanda titik ke bidang (positif searah normal). */
export const distanceToPlane = (p: Vec3, planePoint: Vec3, normal: Vec3): number => dot(sub(p, planePoint), normal);

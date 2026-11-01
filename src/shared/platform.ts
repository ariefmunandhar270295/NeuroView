/** iPadOS melaporkan diri sebagai Mac; deteksi lewat dukungan touch. */
export const isIOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Berjalan sebagai aplikasi terpasang (Layar Utama iPad atau aplikasi desktop), bukan tab browser. */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

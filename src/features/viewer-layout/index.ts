import type { DicomSeries } from '../dicom-loader';
import type { MprViewer } from '../mpr-viewer';
import type { StackViewer } from '../stack-viewer';

export type LayoutMode = '1x1' | '2x2';

export interface ViewerLayout {
  /** Wadah kedua viewer; hanya satu yang terlihat. */
  element: HTMLElement;
  /** Toggle layout + toolbar milik viewer yang aktif. */
  toolbar: HTMLElement;
  showSeries(series: DicomSeries): Promise<void>;
  setMode(mode: LayoutMode): Promise<void>;
  getMode(): LayoutMode;
}

export interface ViewerLayoutOptions {
  stack: StackViewer;
  mpr: MprViewer;
  /** Pesan untuk status bar (mis. MPR tidak tersedia untuk series ini). */
  onMessage: (text: string) => void;
}

/**
 * 1×1 = stack viewer (bidang akuisisi asli), 2×2 = MPR aksial/koronal/sagital + panel 3D.
 * Series hanya dimuat ke viewer yang sedang terlihat; viewer lain menyusul saat layout diganti.
 */
export function createViewerLayout({ stack, mpr, onMessage }: ViewerLayoutOptions): ViewerLayout {
  const element = document.createElement('div');
  element.className = 'viewer-layout';
  element.append(stack.element, mpr.element);

  const toggle = document.createElement('div');
  toggle.className = 'layout-toggle';
  toggle.setAttribute('role', 'group');
  toggle.setAttribute('aria-label', 'Layout');
  const makeToggle = (mode: LayoutMode, label: string, title: string) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn';
    btn.textContent = label;
    btn.title = title;
    btn.addEventListener('click', () => void setMode(mode).catch(handleError));
    toggle.append(btn);
    return btn;
  };
  const singleButton = makeToggle('1x1', '1×1', 'Satu viewport, bidang akuisisi (M)');
  const mprButton = makeToggle('2x2', '2×2 MPR', 'MPR aksial/koronal/sagital (M)');

  const toolbarSlot = document.createElement('div');
  toolbarSlot.className = 'layout-toolbar-slot';
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.append(toggle, Object.assign(document.createElement('span'), { className: 'toolbar-sep' }), toolbarSlot);

  let mode: LayoutMode = '1x1';
  let current: DicomSeries | undefined;
  const loaded = new Map<LayoutMode, string>();

  function handleError(error: unknown) {
    console.error(error);
    onMessage('Gagal menampilkan series. Periksa format file (lihat console).');
  }

  function updateToggle() {
    singleButton.setAttribute('aria-pressed', String(mode === '1x1'));
    mprButton.setAttribute('aria-pressed', String(mode === '2x2'));
    const canMpr = !!current?.reconstructable;
    mprButton.disabled = !!current && !canMpr;
    mprButton.title = canMpr || !current ? 'MPR aksial/koronal/sagital (M)' : `MPR tidak tersedia: ${current.volumeIssue}`;
  }

  async function loadIntoActive() {
    if (!current || loaded.get(mode) === current.seriesInstanceUID) return;
    loaded.set(mode, current.seriesInstanceUID);
    try {
      await (mode === '2x2' ? mpr : stack).showSeries(current);
    } catch (error) {
      loaded.delete(mode);
      throw error;
    }
  }

  async function setMode(next: LayoutMode) {
    if (next === '2x2' && current && !current.reconstructable) {
      onMessage(`MPR tidak tersedia untuk series ini: ${current.volumeIssue}.`);
      next = '1x1';
    }
    mode = next;
    // Tampilkan dulu, baru muat: viewport Cornerstone butuh ukuran nyata.
    element.dataset.layout = mode;
    stack.setActive(mode === '1x1');
    mpr.setActive(mode === '2x2');
    toolbarSlot.replaceChildren(mode === '2x2' ? mpr.toolbar : stack.toolbar);
    updateToggle();
    await loadIntoActive();
  }

  async function showSeries(series: DicomSeries) {
    current = series;
    await setMode(mode);
  }

  window.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() !== 'm' || event.metaKey || event.ctrlKey || event.altKey) return;
    if ((event.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable]')) return;
    event.preventDefault();
    void setMode(mode === '1x1' ? '2x2' : '1x1').catch(handleError);
  });

  void setMode('1x1');

  return { element, toolbar, showSeries, setMode, getMode: () => mode };
}

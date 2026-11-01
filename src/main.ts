import './styles.css';
import { initCornerstone } from './core/cornerstone';
import { createAnonymizer } from './features/dicom-anonymizer';
import { createDicomInput, loadDicomFiles, releaseStudies, type DicomSeries, type DicomStudy } from './features/dicom-loader';
import { createExportMenu, createImageIndex, type ImageReference } from './features/export';
import { createMprViewer } from './features/mpr-viewer';
import { createSeriesBrowser } from './features/series-browser';
import { createStackViewer } from './features/stack-viewer';
import { createTrajectoryPlanner } from './features/trajectory-planning';
import { createViewerLayout } from './features/viewer-layout';
import { CLINICAL_DISCLAIMER } from './shared/disclaimer';

// Cegah pinch-zoom halaman di iOS Safari agar gesture sampai ke viewport.
document.addEventListener('gesturestart', (event) => event.preventDefault());

initCornerstone();

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="app-header">
    <h1 class="brand">NeuroViewer</h1>
    <div class="header-tools"></div>
    <div class="header-input"></div>
  </header>
  <div class="app-body">
    <aside class="sidebar">
      <div class="sidebar-tabs" role="tablist">
        <button type="button" class="sidebar-tab" role="tab" data-pane="series" aria-selected="true">Series</button>
        <button type="button" class="sidebar-tab" role="tab" data-pane="plan" aria-selected="false">Rencana</button>
      </div>
      <div class="sidebar-pane" data-pane="series"><p class="sidebar-empty">Belum ada series.</p></div>
      <div class="sidebar-pane" data-pane="plan" hidden></div>
    </aside>
    <main class="app-main">
      <div class="empty-state">
        <p><strong>Seret folder DICOM ke sini</strong>, atau gunakan tombol <em>Buka Folder DICOM</em> / <em>Buka File</em>.</p>
        <p class="muted">Semua data diproses lokal di browser — tidak ada yang diunggah.</p>
        <p class="disclaimer">⚠ ${CLINICAL_DISCLAIMER}</p>
      </div>
    </main>
  </div>
  <div class="status" role="status" aria-live="polite"></div>
`;

const headerTools = app.querySelector<HTMLElement>('.header-tools')!;
const headerInput = app.querySelector<HTMLElement>('.header-input')!;
const seriesPane = app.querySelector<HTMLElement>('.sidebar-pane[data-pane="series"]')!;
const planPane = app.querySelector<HTMLElement>('.sidebar-pane[data-pane="plan"]')!;
const main = app.querySelector<HTMLElement>('.app-main')!;
const emptyState = app.querySelector<HTMLElement>('.empty-state')!;
const status = app.querySelector<HTMLElement>('.status')!;

const stack = createStackViewer();
const mpr = createMprViewer();
const layout = createViewerLayout({
  stack,
  mpr,
  onMessage: (text) => (status.textContent = text),
});
const planner = createTrajectoryPlanner({ mpr, ensureMpr: () => layout.setMode('2x2') });
planPane.append(planner.panel);

for (const tab of app.querySelectorAll<HTMLButtonElement>('.sidebar-tab')) {
  tab.addEventListener('click', () => {
    for (const other of app.querySelectorAll<HTMLElement>('.sidebar-tab')) {
      other.setAttribute('aria-selected', String(other === tab));
    }
    for (const pane of app.querySelectorAll<HTMLElement>('.sidebar-pane')) pane.hidden = pane.dataset.pane !== tab.dataset.pane;
  });
}
headerTools.append(layout.toolbar);
main.append(layout.element);

const showError = (error: unknown) => {
  console.error(error);
  status.textContent = 'Gagal menampilkan series. Periksa format file (lihat console).';
};

let loadedStudies: DicomStudy[] = [];
let currentSeries: DicomSeries | undefined;
function showSeries(series: DicomSeries) {
  currentSeries = series;
  return layout.showSeries(series).catch(showError);
}

const browser = createSeriesBrowser((series) => showSeries(series));

async function handleFiles(files: File[]) {
  status.textContent = `Membaca ${files.length} file…`;
  const { studies, skipped } = await loadDicomFiles(files, (done, total) => {
    status.textContent = `Membaca header ${done}/${total}…`;
  });
  const series = studies.flatMap((study) => study.series);

  if (series.length === 0) {
    status.textContent = `Tidak ada citra DICOM yang bisa dibaca (${skipped} file dilewati).`;
    return;
  }

  status.textContent =
    `${studies.length} study · ${series.length} series dimuat` +
    (skipped ? ` · ${skipped} file non-citra dilewati` : '');

  // Lepas batch sebelumnya (gambar, metadata, volume MPR, anotasi) sebelum menampilkan yang baru.
  // Sengaja setelah batch baru terbukti berisi citra, agar data lama tetap ada bila gagal.
  if (loadedStudies.length) {
    layout.reset();
    mpr.releaseVolume();
    releaseStudies(loadedStudies);
    currentSeries = undefined;
  }
  seriesPane.replaceChildren(browser.element);
  describeImage = createImageIndex(studies);
  browser.setStudies(studies);
  emptyState.hidden = true;
  app.classList.add('has-data');

  // Default: series aksial dengan irisan terbanyak (biasanya sekuens utama, bukan localizer).
  const candidates = series.some((s) => s.plane === 'Aksial') ? series.filter((s) => s.plane === 'Aksial') : series;
  const initial = candidates.reduce((a, b) => (b.imageIds.length > a.imageIds.length ? b : a));
  loadedStudies = studies;
  browser.setActive(initial.seriesInstanceUID);
  await showSeries(initial);
}

let describeImage: (imageId: string) => ImageReference | undefined = () => undefined;
const exportMenu = createExportMenu({
  getCaptureElement: () => {
    if (!app.classList.contains('has-data')) return undefined;
    return layout.getMode() === '2x2' ? mpr.element : (stack.element.querySelector<HTMLElement>('.viewport-wrap') ?? undefined);
  },
  describeImage: (imageId) => describeImage(imageId),
  getTrajectoryPlan: () =>
    planner.store.trajectories.length || Object.keys(planner.store.landmarks).length ? planner.store.toJSON() : undefined,
  onMessage: (text) => (status.textContent = text),
});

const anonymizer = createAnonymizer({
  getSelection: () => {
    const study = loadedStudies.find((s) => s.series.includes(currentSeries!));
    return currentSeries && study ? { series: currentSeries, study } : undefined;
  },
  onMessage: (text) => (status.textContent = text),
});
exportMenu.addItem('Anonimkan & unduh DICOM…', 'Hapus identitas pasien & institusi lalu unduh ZIP', () => anonymizer.open());

headerInput.append(
  exportMenu.element,
  createDicomInput({
    dropTarget: app,
    onFiles: (files) => void handleFiles(files).catch(showError),
  }),
);

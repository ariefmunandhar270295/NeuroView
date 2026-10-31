import './styles.css';
import { initCornerstone } from './core/cornerstone';
import { createDicomInput, loadDicomFiles } from './features/dicom-loader';
import { createSeriesBrowser } from './features/series-browser';
import { createStackViewer } from './features/stack-viewer';

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
      <p class="sidebar-empty">Belum ada series.</p>
    </aside>
    <main class="app-main">
      <div class="empty-state">
        <p><strong>Seret folder DICOM ke sini</strong>, atau gunakan tombol <em>Buka Folder DICOM</em> / <em>Buka File</em>.</p>
        <p class="muted">Semua data diproses lokal di browser — tidak ada yang diunggah.</p>
      </div>
    </main>
  </div>
  <div class="status" role="status" aria-live="polite"></div>
`;

const headerTools = app.querySelector<HTMLElement>('.header-tools')!;
const headerInput = app.querySelector<HTMLElement>('.header-input')!;
const sidebar = app.querySelector<HTMLElement>('.sidebar')!;
const main = app.querySelector<HTMLElement>('.app-main')!;
const emptyState = app.querySelector<HTMLElement>('.empty-state')!;
const status = app.querySelector<HTMLElement>('.status')!;

const viewer = createStackViewer();
headerTools.append(viewer.toolbar);
main.append(viewer.element);

const showError = (error: unknown) => {
  console.error(error);
  status.textContent = 'Gagal menampilkan series. Periksa format file (lihat console).';
};

const browser = createSeriesBrowser((series) => viewer.showSeries(series).catch(showError));

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

  sidebar.replaceChildren(browser.element);
  browser.setSeries(series);
  emptyState.hidden = true;
  app.classList.add('has-data');

  // Default: series aksial dengan irisan terbanyak (biasanya sekuens utama, bukan localizer).
  const candidates = series.some((s) => s.plane === 'Aksial') ? series.filter((s) => s.plane === 'Aksial') : series;
  const initial = candidates.reduce((a, b) => (b.imageIds.length > a.imageIds.length ? b : a));
  browser.setActive(initial.seriesInstanceUID);
  await viewer.showSeries(initial).catch(showError);
}

headerInput.append(
  createDicomInput({
    dropTarget: app,
    onFiles: (files) => void handleFiles(files).catch(showError),
  }),
);

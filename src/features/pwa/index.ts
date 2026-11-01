import { isIOS, isStandalone } from '../../shared/platform';

/** Cek pembaruan berkala selama aplikasi terbuka (selain saat aplikasi kembali terlihat). */
const UPDATE_CHECK_MS = 60 * 60 * 1000;
const TOAST_MS = 6000;

export interface PwaOptions {
  /** True bila ada data DICOM terbuka; memuat ulang untuk pembaruan akan menutupnya. */
  hasOpenData: () => boolean;
}

export interface Pwa {
  /** Tombol "Pasang" untuk browser yang menawarkan instalasi (Chrome/Edge). Tersembunyi bila tidak. */
  installButton: HTMLButtonElement;
  /** Petunjuk "Tambahkan ke Layar Utama" untuk iPad/iPhone; null bila tidak relevan. */
  installHint: HTMLElement | null;
}

/** Event non-standar Chromium; belum ada di lib DOM TypeScript. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface ToastAction {
  label: string;
  primary?: boolean;
  onClick: () => void;
}

function createToastHost() {
  const host = document.createElement('div');
  host.className = 'pwa-toasts';
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  document.body.append(host);

  return function show(message: string, actions: ToastAction[] = [], timeout = actions.length ? 0 : TOAST_MS) {
    const toast = document.createElement('div');
    toast.className = 'pwa-toast';
    const text = document.createElement('p');
    text.textContent = message;
    toast.append(text);
    const close = () => toast.remove();
    if (actions.length) {
      const row = document.createElement('div');
      row.className = 'pwa-toast-actions';
      for (const action of actions) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn';
        if (action.primary) button.setAttribute('aria-pressed', 'true');
        button.textContent = action.label;
        button.addEventListener('click', () => {
          close();
          action.onClick();
        });
        row.append(button);
      }
      toast.append(row);
    }
    host.append(toast);
    if (timeout) window.setTimeout(close, timeout);
    return close;
  };
}

type ShowToast = ReturnType<typeof createToastHost>;

function createInstallButton(toast: ShowToast): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn';
  button.textContent = 'Pasang';
  button.title = 'Pasang NeuroViewer sebagai aplikasi agar bisa dibuka offline';
  button.hidden = true;

  let deferred: BeforeInstallPromptEvent | undefined;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    button.hidden = false;
  });
  button.addEventListener('click', async () => {
    if (!deferred) return;
    const prompt = deferred;
    deferred = undefined;
    button.hidden = true;
    await prompt.prompt();
    await prompt.userChoice;
  });
  window.addEventListener('appinstalled', () => {
    deferred = undefined;
    button.hidden = true;
    toast('NeuroViewer terpasang. Buka dari daftar aplikasi; bisa dipakai tanpa internet.');
  });
  return button;
}

/** Safari iOS tidak punya tombol pasang; instalasi lewat menu Bagikan. */
function createIosHint(): HTMLElement {
  const hint = document.createElement('p');
  hint.className = 'muted pwa-install-hint';
  hint.innerHTML =
    '<strong>Pasang di iPad:</strong> ketuk <em>Bagikan</em> lalu <em>Tambahkan ke Layar Utama</em>. ' +
    'Buka sekali dari Layar Utama saat online; setelah itu NeuroViewer bisa dipakai tanpa internet.';
  return hint;
}

async function registerServiceWorker(toast: ShowToast, { hasOpenData }: PwaOptions) {
  const container = navigator.serviceWorker;
  const registration = await container.register('./sw.js', { scope: './' });
  let updateRequested = false;

  const offerUpdate = (worker: ServiceWorker) => {
    const message = hasOpenData()
      ? 'Versi baru NeuroViewer tersedia. Memuat ulang akan menutup data yang sedang dibuka (buka lagi setelahnya).'
      : 'Versi baru NeuroViewer tersedia.';
    toast(message, [
      { label: 'Nanti', onClick: () => undefined },
      {
        label: 'Muat ulang',
        primary: true,
        onClick: () => {
          updateRequested = true;
          worker.postMessage({ type: 'SKIP_WAITING' });
        },
      },
    ]);
  };

  // Instalasi pertama: `installing` sudah terisi saat register() selesai dan `updatefound` tetap
  // terpicu untuk worker yang sama; pantau tiap worker sekali saja.
  const tracked = new WeakSet<ServiceWorker>();
  const track = (worker: ServiceWorker | null) => {
    if (!worker || tracked.has(worker)) return;
    tracked.add(worker);
    const onStateChange = () => {
      if (worker.state !== 'installed') return;
      worker.removeEventListener('statechange', onStateChange);
      if (container.controller) {
        offerUpdate(worker);
      } else {
        toast('NeuroViewer siap dipakai offline.');
        // Minta agar cache tidak dihapus otomatis saat ruang penyimpanan menipis.
        void navigator.storage?.persist?.().catch(() => undefined);
      }
    };
    worker.addEventListener('statechange', onStateChange);
    onStateChange();
  };

  // Versi baru yang sudah terunduh di sesi sebelumnya dan masih menunggu.
  const { waiting } = registration;
  if (waiting && container.controller) {
    tracked.add(waiting);
    offerUpdate(waiting);
  }
  track(registration.installing);
  registration.addEventListener('updatefound', () => track(registration.installing));

  // Instalasi pertama juga memicu controllerchange (clients.claim); muat ulang hanya bila diminta.
  container.addEventListener('controllerchange', () => {
    if (updateRequested) window.location.reload();
  });

  // Saat offline update() gagal; cukup diabaikan, cache versi sekarang tetap dipakai.
  const check = () => void registration.update().catch(() => undefined);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  window.setInterval(check, UPDATE_CHECK_MS);
}

/**
 * Jadikan NeuroViewer Progressive Web App: service worker untuk offline (hanya di build produksi),
 * pemberitahuan versi baru, tombol pasang (Chrome/Edge), dan petunjuk pasang di iPad.
 */
export function setupPwa(options: PwaOptions): Pwa {
  const toast = createToastHost();
  const installButton = createInstallButton(toast);
  const installHint = isIOS && !isStandalone() ? createIosHint() : null;

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    registerServiceWorker(toast, options).catch((error) => console.warn('Service worker gagal didaftarkan', error));
  }
  return { installButton, installHint };
}

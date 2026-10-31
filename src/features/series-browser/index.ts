import type { DicomSeries } from '../dicom-loader';

export interface SeriesBrowser {
  element: HTMLElement;
  setSeries(series: DicomSeries[]): void;
  setActive(seriesInstanceUID: string): void;
}

/** Daftar series di sidebar; memanggil `onSelect` saat series dipilih (klik atau tap). */
export function createSeriesBrowser(onSelect: (series: DicomSeries) => void): SeriesBrowser {
  const element = document.createElement('ul');
  element.className = 'series-list';
  let items = new Map<string, HTMLButtonElement>();

  function setActive(seriesInstanceUID: string) {
    for (const [uid, button] of items) {
      button.setAttribute('aria-current', String(uid === seriesInstanceUID));
    }
  }

  function setSeries(series: DicomSeries[]) {
    element.replaceChildren();
    items = new Map();

    for (const s of series) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'series-item';

      const modality = document.createElement('span');
      modality.className = 'series-modality';
      modality.textContent = s.modality || '—';

      const title = document.createElement('span');
      title.className = 'series-title';
      title.textContent = s.description || `Series ${s.seriesNumber ?? ''}`.trim();

      const meta = document.createElement('span');
      meta.className = 'series-meta';
      meta.textContent = `#${s.seriesNumber ?? '-'} · ${s.imageIds.length} gambar`;

      button.append(modality, title, meta);
      button.addEventListener('click', () => {
        setActive(s.seriesInstanceUID);
        onSelect(s);
      });

      const li = document.createElement('li');
      li.append(button);
      element.append(li);
      items.set(s.seriesInstanceUID, button);
    }
  }

  return { element, setSeries, setActive };
}

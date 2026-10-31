import type { DicomSeries, DicomStudy } from '../dicom-loader';
import { createThumbnailQueue } from './thumbnails';

export interface SeriesBrowser {
  element: HTMLElement;
  setStudies(studies: DicomStudy[]): void;
  setActive(seriesInstanceUID: string): void;
}

const dateFormat = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

/** DICOM DA (YYYYMMDD) → "12 Mar 2024"; string asli bila format tidak dikenali. */
function formatStudyDate(da: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(da);
  if (!match) return da;
  return dateFormat.format(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function span(className: string, text: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = className;
  el.textContent = text;
  return el;
}

/**
 * Sidebar Study → Series dengan thumbnail irisan tengah. Hanya menampilkan deskripsi dan
 * tanggal study — tidak ada nama atau ID pasien.
 */
export function createSeriesBrowser(onSelect: (series: DicomSeries) => void): SeriesBrowser {
  const element = document.createElement('div');
  element.className = 'series-browser';
  const thumbnails = createThumbnailQueue();
  let items = new Map<string, HTMLButtonElement>();

  function setActive(seriesInstanceUID: string) {
    for (const [uid, button] of items) {
      button.setAttribute('aria-current', String(uid === seriesInstanceUID));
    }
  }

  function createSeriesItem(s: DicomSeries): HTMLLIElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'series-item';

    const thumb = document.createElement('span');
    thumb.className = 'series-thumb';
    const canvas = document.createElement('canvas');
    thumb.append(canvas);
    thumbnails.add(canvas, s.imageIds[Math.floor(s.imageIds.length / 2)]);

    const meta = [`#${s.seriesNumber ?? '-'}`, s.plane, `${s.imageIds.length} gambar`].filter(Boolean).join(' · ');
    const text = document.createElement('span');
    text.className = 'series-text';
    text.append(
      span('series-title', s.description || `Series ${s.seriesNumber ?? ''}`.trim()),
      span('series-meta', meta),
    );

    button.append(thumb, span('series-modality', s.modality || '—'), text);
    button.addEventListener('click', () => {
      setActive(s.seriesInstanceUID);
      onSelect(s);
    });
    items.set(s.seriesInstanceUID, button);

    const li = document.createElement('li');
    li.append(button);
    return li;
  }

  function setStudies(studies: DicomStudy[]) {
    thumbnails.clear();
    element.replaceChildren();
    items = new Map();

    for (const study of studies) {
      const details = document.createElement('details');
      details.className = 'study';
      details.open = true;

      const summary = document.createElement('summary');
      summary.className = 'study-header';
      const meta = [formatStudyDate(study.date), study.modalities.join('/'), `${study.series.length} series`]
        .filter(Boolean)
        .join(' · ');
      summary.append(span('study-title', study.description || 'Study tanpa deskripsi'), span('study-meta', meta));

      const list = document.createElement('ul');
      list.className = 'series-list';
      list.append(...study.series.map(createSeriesItem));

      details.append(summary, list);
      element.append(details);
    }
  }

  return { element, setStudies, setActive };
}

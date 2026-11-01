import { toAcPc, trajectoryMetrics, type Vec3 } from './geometry';
import { DISCLAIMER, LANDMARK_LABELS, type LandmarkId, type PlanStore } from './store';

export interface PlanPanelActions {
  /** Mulai mode tandai untuk handle ini (pastikan MPR terbuka lebih dulu). */
  mark(handleId: string): void;
  /** Pindahkan pusat crosshair MPR ke titik ini. */
  navigate(point: Vec3): void;
  /** Buka layout 2×2 MPR untuk series yang sedang dipilih. */
  openMpr(): void;
  exportJson(): void;
}

const fmt = (v: number, digits = 1) => v.toFixed(digits);
const fmtPoint = (p: Vec3) => p.map((v) => fmt(v)).join(', ');

type Props = Record<string, string | boolean | number | undefined>;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

function actionButton(label: string, onClick: () => void, extra: Props = {}) {
  const btn = h('button', { type: 'button', className: 'btn btn-sm', textContent: label, ...extra });
  btn.addEventListener('click', onClick);
  return btn;
}

/** Panel sidebar "Rencana": landmark AC-PC, daftar trajektori, metrik, dan ekspor JSON. */
export function createPlanPanel(store: PlanStore, actions: PlanPanelActions) {
  const element = h('div', { className: 'plan-panel' });
  let ready = false;

  function landmarkRow(id: LandmarkId) {
    const p = store.landmarks[id];
    const waiting = store.pending === id;
    const row = h('div', { className: 'plan-row' });
    row.append(
      h(
        'div',
        { className: 'plan-row-label' },
        h('span', { className: 'plan-landmark', textContent: id === 'mid' ? `${LANDMARK_LABELS[id]} (opsional)` : LANDMARK_LABELS[id] }),
        h('span', { className: 'plan-coord', textContent: p ? `LPS ${fmtPoint(p)}` : 'belum ditandai' }),
      ),
      actionButton(waiting ? 'Klik di MPR…' : p ? 'Ulang' : 'Tandai', () => actions.mark(id), {
        disabled: !ready,
        ariaPressed: String(waiting),
      }),
    );
    if (p) {
      row.append(
        actionButton('Ke', () => actions.navigate(p), { title: `Pindahkan crosshair ke ${LANDMARK_LABELS[id]}` }),
        actionButton('×', () => store.clearLandmark(id), { title: `Hapus ${LANDMARK_LABELS[id]}`, ariaLabel: `Hapus ${LANDMARK_LABELS[id]}` }),
      );
    }
    return row;
  }

  function metricsList() {
    const t = store.active();
    const frame = store.frame();
    const dl = h('dl', { className: 'plan-metrics' });
    const item = (term: string, value: string) => dl.append(h('dt', { textContent: term }), h('dd', { textContent: value }));
    if (!t?.entry || !t.target) {
      dl.append(h('dd', { className: 'muted', textContent: 'Tandai entry dan target untuk melihat panjang dan sudut.' }));
      return dl;
    }
    const m = trajectoryMetrics(t.entry, t.target, frame);
    if (!m) return dl;
    item('Panjang', `${fmt(m.length)} mm`);
    if (m.angles) {
      item('Sudut thd bidang AC-PC', `${fmt(m.angles.elevation)}°`);
      item('Sudut sagital (dari garis AC-PC)', `${fmt(m.angles.sagittal)}°`);
      item(
        'Sudut koronal (dari vertikal)',
        `${fmt(m.angles.coronal)}°` + (m.angles.coronalSide === 'tengah' ? '' : ` · entry ke ${m.angles.coronalSide}`),
      );
      const c = toAcPc(frame!, t.target);
      item(
        'Target relatif MCP',
        `${fmt(Math.abs(c.lateral))} ${c.lateral >= 0 ? 'kanan' : 'kiri'} · ` +
          `${fmt(Math.abs(c.ap))} ${c.ap >= 0 ? 'anterior' : 'posterior'} · ` +
          `${fmt(Math.abs(c.vertical))} ${c.vertical >= 0 ? 'superior' : 'inferior'} (mm)`,
      );
    } else {
      item('Sudut', 'Tandai AC dan PC untuk sudut terhadap bidang AC-PC');
    }
    item('Entry (LPS, mm)', fmtPoint(t.entry));
    item('Target (LPS, mm)', fmtPoint(t.target));
    return dl;
  }

  function trajectoryItem(id: string) {
    const t = store.trajectories.find((x) => x.id === id)!;
    const isActive = store.active()?.id === id;
    const li = h('li', { className: `plan-trajectory${isActive ? ' is-active' : ''}` });
    li.style.setProperty('--trajectory-color', t.color);

    const name = h('input', { type: 'text', className: 'plan-name', value: t.name, ariaLabel: 'Nama trajektori' });
    name.addEventListener('focus', () => !isActive && store.setActive(id));
    // 'change' (bukan 'input') agar panel tidak dirender ulang saat sedang mengetik.
    name.addEventListener('change', () => store.update(id, { name: name.value.trim() || t.name }));
    const header = h('div', { className: 'plan-trajectory-header' }, h('span', { className: 'plan-swatch' }), name);
    if (!isActive) header.append(actionButton('Pilih', () => store.setActive(id)));
    li.append(header);
    if (!isActive) return li;

    const points = h('div', { className: 'plan-actions' });
    for (const point of ['entry', 'target'] as const) {
      const handleId = `${id}:${point}`;
      const waiting = store.pending === handleId;
      const label = point === 'entry' ? 'Entry' : 'Target';
      points.append(
        actionButton(waiting ? 'Klik di MPR…' : `${t[point] ? 'Ulang' : 'Tandai'} ${label}`, () => actions.mark(handleId), {
          disabled: !ready,
          ariaPressed: String(waiting),
        }),
      );
    }
    const nav = h('div', { className: 'plan-actions' });
    if (t.entry) nav.append(actionButton('Ke entry', () => actions.navigate(t.entry!)));
    if (t.target) nav.append(actionButton('Ke target', () => actions.navigate(t.target!)));
    nav.append(actionButton('Hapus', () => store.removeTrajectory(id), { className: 'btn btn-sm btn-danger' }));
    li.append(points, nav, metricsList());
    return li;
  }

  function render() {
    const frame = store.frame();
    const pending = store.pending;
    const pendingLabel = pending
      ? pending.includes(':')
        ? pending.endsWith(':entry') ? 'entry' : 'target'
        : LANDMARK_LABELS[pending as LandmarkId]
      : '';

    element.replaceChildren(
      h('p', { className: 'plan-disclaimer', textContent: `⚠ ${DISCLAIMER}` }),
      ...(!ready
        ? [
            h(
              'div',
              { className: 'plan-hint' },
              h('p', { textContent: 'Perencanaan dilakukan di layout 2×2 MPR pada series yang layak volume.' }),
              actionButton('Buka 2×2 MPR', () => actions.openMpr(), { className: 'btn' }),
            ),
          ]
        : []),
      ...(pending ? [h('p', { className: 'plan-pending', textContent: `Klik/tap di bidang MPR untuk menandai ${pendingLabel}. Esc untuk batal.` })] : []),
      h(
        'section',
        { className: 'plan-section' },
        h('h3', { textContent: 'Landmark AC-PC' }),
        landmarkRow('ac'),
        landmarkRow('pc'),
        landmarkRow('mid'),
        h('p', {
          className: 'plan-note',
          textContent: frame
            ? `Jarak AC-PC ${fmt(frame.acPcLength)} mm` + (store.landmarks.mid ? ' · bidang mid-sagital dari midline' : ' · tanpa midline: kepala dianggap tidak miring ke samping')
            : 'Tandai AC dan PC untuk sudut terhadap bidang AC-PC.',
        }),
      ),
      h(
        'section',
        { className: 'plan-section' },
        h('div', { className: 'plan-section-header' }, h('h3', { textContent: 'Trajektori' }), actionButton('+ Baru', () => store.addTrajectory(), { disabled: !ready })),
        store.trajectories.length
          ? h('ul', { className: 'plan-list' }, ...store.trajectories.map((t) => trajectoryItem(t.id)))
          : h('p', { className: 'plan-note', textContent: 'Belum ada trajektori.' }),
      ),
      actionButton('Ekspor JSON', () => actions.exportJson(), {
        className: 'btn plan-export',
        disabled: !store.trajectories.length && !Object.keys(store.landmarks).length,
      }),
    );
  }

  render();
  return {
    element,
    render,
    setReady(value: boolean) {
      ready = value;
      render();
    },
  };
}

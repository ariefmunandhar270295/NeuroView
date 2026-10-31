import { utilities, type Types } from '@cornerstonejs/core';

export interface OverlayState {
  title: string;
  modality: string;
  plane?: string;
  index: number;
  total: number;
  voi?: Types.VOIRange;
  /** Nama preset window yang sedang cocok dengan VOI. */
  preset?: string;
}

/** Teks informasi di sudut viewport. Sengaja tidak menampilkan identitas pasien. */
export function createOverlay() {
  const element = document.createElement('div');
  element.className = 'viewport-overlay';

  const topLeft = document.createElement('div');
  topLeft.className = 'overlay-tl';
  const bottomLeft = document.createElement('div');
  bottomLeft.className = 'overlay-bl';
  const bottomRight = document.createElement('div');
  bottomRight.className = 'overlay-br';
  element.append(topLeft, bottomLeft, bottomRight);

  const state: OverlayState = { title: '', modality: '', index: 0, total: 0 };

  function render() {
    topLeft.textContent = [[state.modality, state.title].filter(Boolean).join(' · '), state.plane]
      .filter(Boolean)
      .join('\n');
    bottomLeft.textContent = state.total ? `Irisan ${state.index + 1} / ${state.total}` : '';
    if (state.voi) {
      const { windowWidth, windowCenter } = utilities.windowLevel.toWindowLevel(state.voi.lower, state.voi.upper);
      const wwwl = `W ${Math.round(windowWidth)} · L ${Math.round(windowCenter)}`;
      bottomRight.textContent = state.preset ? `${state.preset}\n${wwwl}` : wwwl;
    } else {
      bottomRight.textContent = '';
    }
  }

  return {
    element,
    update(patch: Partial<OverlayState>) {
      Object.assign(state, patch);
      render();
    },
  };
}

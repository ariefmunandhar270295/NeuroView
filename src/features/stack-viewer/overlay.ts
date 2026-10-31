import { utilities, type Types } from '@cornerstonejs/core';

export interface OverlayState {
  title: string;
  modality: string;
  index: number;
  total: number;
  voi?: Types.VOIRange;
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
    topLeft.textContent = [state.modality, state.title].filter(Boolean).join(' · ');
    bottomLeft.textContent = state.total ? `Irisan ${state.index + 1} / ${state.total}` : '';
    if (state.voi) {
      const { windowWidth, windowCenter } = utilities.windowLevel.toWindowLevel(state.voi.lower, state.voi.upper);
      bottomRight.textContent = `W ${Math.round(windowWidth)} · L ${Math.round(windowCenter)}`;
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

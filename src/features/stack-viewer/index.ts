import { Enums, RenderingEngine, type Types } from '@cornerstonejs/core';
import type { DicomSeries } from '../dicom-loader';
import { createOverlay } from './overlay';
import { createToolGroup, PRIMARY_TOOLS } from './tools';

const RENDERING_ENGINE_ID = 'neuroviewer-engine';
const VIEWPORT_ID = 'stack-main';
const TOOL_GROUP_ID = 'stack-tools';

export interface StackViewer {
  /** Viewport, overlay, dan slider irisan. */
  element: HTMLElement;
  /** Tombol tool, reset, dan invert. */
  toolbar: HTMLElement;
  showSeries(series: DicomSeries): Promise<void>;
  destroy(): void;
}

function button(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'btn';
  el.textContent = label;
  el.title = title;
  el.addEventListener('click', onClick);
  return el;
}

export function createStackViewer(): StackViewer {
  const element = document.createElement('div');
  element.className = 'stack-viewer';

  const viewportElement = document.createElement('div');
  viewportElement.className = 'viewport';
  viewportElement.addEventListener('contextmenu', (event) => event.preventDefault());

  const overlay = createOverlay();

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'slice-slider';
  slider.min = '0';
  slider.max = '0';
  slider.value = '0';
  slider.disabled = true;
  slider.setAttribute('aria-label', 'Irisan');

  const viewportWrap = document.createElement('div');
  viewportWrap.className = 'viewport-wrap';
  viewportWrap.append(viewportElement, overlay.element);
  element.append(viewportWrap, slider);

  const renderingEngine = new RenderingEngine(RENDERING_ENGINE_ID);
  renderingEngine.enableElement({
    viewportId: VIEWPORT_ID,
    type: Enums.ViewportType.STACK,
    element: viewportElement,
    defaultOptions: { background: [0, 0, 0] },
  });
  const viewport = () => renderingEngine.getViewport<Types.IStackViewport>(VIEWPORT_ID);

  const tools = createToolGroup(TOOL_GROUP_ID, VIEWPORT_ID, RENDERING_ENGINE_ID);

  // --- Toolbar ---
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.setAttribute('role', 'toolbar');

  const toolButtons = new Map<string, HTMLButtonElement>();
  const selectTool = (toolName: string) => {
    tools.setPrimaryTool(toolName);
    for (const [name, btn] of toolButtons) btn.setAttribute('aria-pressed', String(name === toolName));
  };
  for (const tool of PRIMARY_TOOLS) {
    const btn = button(tool.label, `${tool.label} (${tool.key.toUpperCase()})`, () => selectTool(tool.name));
    toolButtons.set(tool.name, btn);
    toolbar.append(btn);
  }
  selectTool(tools.getPrimaryTool());

  const reset = () => {
    const vp = viewport();
    vp.resetCamera();
    vp.resetProperties();
    vp.render();
  };
  const invert = () => {
    const vp = viewport();
    vp.setProperties({ invert: !vp.getProperties().invert });
    vp.render();
  };
  const separator = document.createElement('span');
  separator.className = 'toolbar-sep';
  toolbar.append(separator, button('Invert', 'Invert (I)', invert), button('Reset', 'Reset tampilan (R)', reset));

  // --- Sinkronisasi overlay & slider ---
  viewportElement.addEventListener(Enums.Events.STACK_NEW_IMAGE, ((
    event: Types.EventTypes.StackNewImageEvent,
  ) => {
    slider.value = String(event.detail.imageIdIndex);
    overlay.update({ index: event.detail.imageIdIndex });
  }) as EventListener);

  viewportElement.addEventListener(Enums.Events.VOI_MODIFIED, ((event: Types.EventTypes.VoiModifiedEvent) => {
    overlay.update({ voi: event.detail.range });
  }) as EventListener);

  slider.addEventListener('input', () => {
    void viewport().setImageIdIndex(Number(slider.value));
  });

  // --- Keyboard (desktop) ---
  const scrollBy = (delta: number) => {
    const vp = viewport();
    const total = vp.getImageIds().length;
    if (!total) return;
    const index = Math.min(total - 1, Math.max(0, vp.getCurrentImageIdIndex() + delta));
    void vp.setImageIdIndex(index);
  };
  const SCROLL_KEYS: Record<string, number> = {
    arrowup: -1,
    arrowleft: -1,
    arrowdown: 1,
    arrowright: 1,
    pageup: -10,
    pagedown: 10,
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    const onSlider = target === slider;
    if (!onSlider && target?.closest('input, textarea, select, [contenteditable]')) return;

    const key = event.key.toLowerCase();
    const tool = PRIMARY_TOOLS.find((t) => t.key === key);
    if (tool) selectTool(tool.name);
    else if (key === 'r') reset();
    else if (key === 'i') invert();
    // Saat slider fokus, panah sudah ditangani slider itu sendiri.
    else if (key in SCROLL_KEYS && !onSlider) scrollBy(SCROLL_KEYS[key]);
    else return;
    event.preventDefault();
  };
  window.addEventListener('keydown', onKeyDown);

  // --- Resize (rotasi iPad, sidebar, jendela) ---
  const resizeObserver = new ResizeObserver(() => renderingEngine.resize(true, true));
  resizeObserver.observe(viewportElement);

  let loadToken = 0;

  async function showSeries(series: DicomSeries) {
    const token = ++loadToken;
    const startIndex = Math.floor(series.imageIds.length / 2);

    element.classList.add('is-loading');
    slider.disabled = true;
    slider.max = String(series.imageIds.length - 1);
    slider.value = String(startIndex);
    overlay.update({
      title: series.description,
      modality: series.modality,
      index: startIndex,
      total: series.imageIds.length,
      voi: undefined,
    });

    try {
      const vp = viewport();
      await vp.setStack(series.imageIds, startIndex);
      if (token !== loadToken) return;
      vp.resetCamera();
      vp.render();
      overlay.update({ voi: vp.getProperties().voiRange });
    } finally {
      if (token === loadToken) {
        element.classList.remove('is-loading');
        slider.disabled = series.imageIds.length < 2;
      }
    }
  }

  function destroy() {
    window.removeEventListener('keydown', onKeyDown);
    resizeObserver.disconnect();
    tools.destroy();
    renderingEngine.destroy();
  }

  return { element, toolbar, showSeries, destroy };
}

import { utilities, type Types } from '@cornerstonejs/core';

export interface WindowPreset {
  id: string;
  label: string;
  /** Window width (HU). */
  ww: number;
  /** Window level/center (HU). */
  wl: number;
  /** Pintasan keyboard di desktop. */
  key: string;
}

/** Preset CT kepala (nilai HU umum, mis. Radiopaedia "Windowing (CT)"). */
export const NEURO_PRESETS: WindowPreset[] = [
  { id: 'brain', label: 'Brain', ww: 80, wl: 40, key: '1' },
  { id: 'subdural', label: 'Subdural', ww: 200, wl: 75, key: '2' },
  { id: 'bone', label: 'Bone', ww: 2800, wl: 600, key: '3' },
  { id: 'stroke', label: 'Stroke', ww: 40, wl: 40, key: '4' },
];

export function presetToVoiRange(preset: WindowPreset): Types.VOIRange {
  return utilities.windowLevel.toLowHighRange(preset.ww, preset.wl);
}

/** Preset yang cocok dengan VOI saat ini (toleransi pembulatan), untuk menyorot tombol aktif. */
export function findPreset(voi: Types.VOIRange | undefined): WindowPreset | undefined {
  if (!voi) return undefined;
  const { windowWidth, windowCenter } = utilities.windowLevel.toWindowLevel(voi.lower, voi.upper);
  return NEURO_PRESETS.find((p) => Math.abs(p.ww - windowWidth) < 1 && Math.abs(p.wl - windowCenter) < 1);
}

export interface PresetBar {
  element: HTMLElement;
  /** Preset hanya bermakna untuk nilai HU (CT). */
  setEnabled(enabled: boolean): void;
  setActive(presetId: string | undefined): void;
}

export function createPresetBar(onApply: (preset: WindowPreset) => void): PresetBar {
  const element = document.createElement('div');
  element.className = 'preset-bar';
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', 'Preset window');

  const buttons = new Map<string, HTMLButtonElement>();
  const titles = new Map<HTMLButtonElement, string>();
  for (const preset of NEURO_PRESETS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn';
    btn.textContent = preset.label;
    btn.title = `${preset.label}: W ${preset.ww} / L ${preset.wl} (${preset.key})`;
    btn.addEventListener('click', () => onApply(preset));
    buttons.set(preset.id, btn);
    titles.set(btn, btn.title);
    element.append(btn);
  }

  return {
    element,
    setEnabled(enabled) {
      for (const btn of buttons.values()) {
        btn.disabled = !enabled;
        btn.title = enabled ? titles.get(btn)! : `${titles.get(btn)} — hanya untuk CT`;
      }
    },
    setActive(presetId) {
      for (const [id, btn] of buttons) btn.setAttribute('aria-pressed', String(id === presetId));
    },
  };
}

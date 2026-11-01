# window-presets

Preset window/level CT kepala untuk edukasi neuro:

| Preset   | WW (HU) | WL (HU) | Tombol | Kegunaan                                  |
| -------- | ------- | ------- | ------ | ----------------------------------------- |
| Brain    | 80      | 40      | `1`    | Parenkim otak umum                        |
| Subdural | 200     | 75      | `2`    | Perdarahan ekstra-aksial tipis            |
| Bone     | 2800    | 600     | `3`    | Fraktur kalvaria/basis kranii             |
| Stroke   | 40      | 40      | `4`    | Batas substansia grisea–alba (iskemia dini) |

Nilai merujuk ke konvensi umum (Radiopaedia, "Windowing (CT)"). Preset dinonaktifkan untuk
modalitas selain CT karena intensitas MR tidak dalam HU.

## API

```ts
const bar = createPresetBar((preset) => viewport.setProperties({ voiRange: presetToVoiRange(preset) }));
bar.setEnabled(modality === 'CT');
bar.setActive(findPreset(voiRange)?.id);
```

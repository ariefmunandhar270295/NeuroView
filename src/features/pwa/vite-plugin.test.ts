import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createServiceWorkerSource, type OutputFile } from './vite-plugin';

const template = readFileSync(new URL('./service-worker.js', import.meta.url), 'utf8');
const file = (path: string, content = path): OutputFile => ({ path, content: new TextEncoder().encode(content) });

const parse = (source: string) => ({
  version: /const VERSION = "([0-9a-f]+)";/.exec(source)?.[1],
  assets: JSON.parse(/const ASSETS = (\[.*\]);/.exec(source)?.[1] ?? 'null') as string[] | null,
});

describe('createServiceWorkerSource', () => {
  const files = [
    file('index.html'),
    file('assets/index-abc.js'),
    file('assets/openjpegwasm_decode-x.wasm'),
    file('icons/icon-192.png'),
    file('manifest.webmanifest'),
    file('sw.js'),
    file('assets/index-abc.js.map'),
    file('.DS_Store'),
  ];

  it('menyimpan semua file aplikasi, tanpa sw.js, source map, dan file tersembunyi', () => {
    const { assets } = parse(createServiceWorkerSource(template, files));
    expect(assets).toEqual([
      'assets/index-abc.js',
      'assets/openjpegwasm_decode-x.wasm',
      'icons/icon-192.png',
      'index.html',
      'manifest.webmanifest',
    ]);
  });

  it('versi stabil untuk isi yang sama dan berubah bila satu file berubah', () => {
    const a = parse(createServiceWorkerSource(template, files)).version;
    const b = parse(createServiceWorkerSource(template, [...files].reverse())).version;
    const changed = files.map((f) => (f.path === 'index.html' ? file('index.html', 'versi baru') : f));
    const c = parse(createServiceWorkerSource(template, changed)).version;
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect(b).toBe(a);
    expect(c).not.toBe(a);
  });

  it('versi tidak dipengaruhi sw.js lama di folder output', () => {
    const a = parse(createServiceWorkerSource(template, files)).version;
    const b = parse(createServiceWorkerSource(template, files.map((f) => (f.path === 'sw.js' ? file('sw.js', 'lain') : f)))).version;
    expect(b).toBe(a);
  });

  it('menolak template tanpa placeholder', () => {
    expect(() => createServiceWorkerSource('const VERSION = 1;', files)).toThrow(/__NV_VERSION__/);
  });
});

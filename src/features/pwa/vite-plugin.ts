import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

export const SERVICE_WORKER_FILE = 'sw.js';
const TEMPLATE = fileURLToPath(new URL('./service-worker.js', import.meta.url));
/** File di output yang tidak perlu disimpan untuk offline. */
const SKIPPED = [/\.map$/, /(^|\/)\.[^/]+$/];

export interface OutputFile {
  /** Path relatif terhadap folder output, dengan pemisah `/`. */
  path: string;
  content: Uint8Array;
}

/**
 * Isi template service worker dengan daftar file aplikasi dan versi. Versi dihitung dari isi semua
 * file, sehingga `sw.js` berubah (dan browser menawarkan pembaruan) hanya bila aplikasi berubah.
 */
export function createServiceWorkerSource(template: string, files: OutputFile[]): string {
  const assets = files
    .filter(({ path }) => path !== SERVICE_WORKER_FILE && !SKIPPED.some((re) => re.test(path)))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const hash = createHash('sha256');
  for (const { path, content } of assets) hash.update(path).update('\0').update(content).update('\0');
  const version = hash.digest('hex').slice(0, 12);

  const fill = (source: string, token: string, value: string) => {
    if (source.split(token).length !== 2) throw new Error(`Template service worker harus memuat ${token} tepat sekali`);
    return source.replace(token, () => value);
  };
  const withVersion = fill(template, "'__NV_VERSION__'", JSON.stringify(version));
  return fill(withVersion, "'__NV_ASSETS__'", JSON.stringify(assets.map(({ path }) => path)));
}

function listFiles(dir: string): OutputFile[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const full = join(entry.parentPath, entry.name);
      return { path: relative(dir, full).split(sep).join('/'), content: readFileSync(full) };
    });
}

/**
 * Plugin build: setelah semua file ditulis (termasuk worker, codec WASM, dan isi `public/`), buat
 * `sw.js` yang menyimpan seluruh isi folder output untuk dipakai offline.
 */
export function pwaServiceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'neuroviewer:pwa-service-worker',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    writeBundle() {
      const source = createServiceWorkerSource(readFileSync(TEMPLATE, 'utf8'), listFiles(outDir));
      writeFileSync(join(outDir, SERVICE_WORKER_FILE), source);
    },
  };
}

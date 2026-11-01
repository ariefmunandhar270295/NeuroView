import { utilities } from '@cornerstonejs/core';
import { ensureInstanceMetadata } from '../dicom-loader';

const THUMB_PX = 128;

/**
 * Render thumbnail satu per satu saat item masuk layar, agar decode tidak menumpuk
 * (penting di iPad). Pakai CPU rendering supaya tidak memakan konteks WebGL tambahan.
 */
export function createThumbnailQueue() {
  const pending = new Map<Element, string>();
  const queue: Array<[HTMLCanvasElement, string]> = [];
  let running = false;

  async function pump() {
    if (running) return;
    running = true;
    while (queue.length) {
      const [canvas, imageId] = queue.shift()!;
      if (!canvas.isConnected) continue;
      const holder = canvas.parentElement;
      try {
        // Metadata lewat jalur bersama agar tidak bentrok dengan prefetch MPR untuk file yang sama.
        await ensureInstanceMetadata(imageId);
        await utilities.loadImageToCanvas({ canvas, imageId, useCPURendering: true });
        // loadImageToCanvas menimpa ukuran CSS canvas; biarkan stylesheet yang mengatur.
        canvas.removeAttribute('style');
        holder?.classList.add('is-ready');
      } catch {
        holder?.classList.add('is-error');
      }
    }
    running = false;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const imageId = pending.get(entry.target);
        if (!entry.isIntersecting || !imageId) continue;
        observer.unobserve(entry.target);
        pending.delete(entry.target);
        queue.push([entry.target as HTMLCanvasElement, imageId]);
      }
      void pump();
    },
    { rootMargin: '200px' },
  );

  return {
    add(canvas: HTMLCanvasElement, imageId: string) {
      canvas.width = THUMB_PX;
      canvas.height = THUMB_PX;
      pending.set(canvas, imageId);
      observer.observe(canvas);
    },
    clear() {
      observer.disconnect();
      pending.clear();
      queue.length = 0;
    },
  };
}

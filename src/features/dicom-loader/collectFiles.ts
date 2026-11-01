// Kumpulkan File dari drag & drop, termasuk isi folder secara rekursif (Chrome/Safari desktop).

function readEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

function entryToFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function walkEntry(entry: FileSystemEntry, out: File[]): Promise<void> {
  if (entry.isFile) {
    out.push(await entryToFile(entry as FileSystemFileEntry));
    return;
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    // readEntries mengembalikan batch (maks ~100 entri di Chrome); ulangi hingga kosong.
    for (let batch = await readEntries(reader); batch.length > 0; batch = await readEntries(reader)) {
      for (const child of batch) await walkEntry(child, out);
    }
  }
}

export async function filesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
  // Ambil semua entry secara sinkron: DataTransferItemList tidak valid lagi setelah await pertama.
  const entries = [...dataTransfer.items]
    .filter((item) => item.kind === 'file')
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => !!entry);

  if (entries.length === 0) return [...dataTransfer.files];

  const files: File[] = [];
  for (const entry of entries) await walkEntry(entry, files);
  return files;
}

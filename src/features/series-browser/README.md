# series-browser

Daftar series di sidebar (modalitas, deskripsi, nomor series, jumlah gambar).
Item berupa `<button>` sehingga bisa dipilih dengan klik, tap, maupun keyboard.

## API

```ts
const browser = createSeriesBrowser((series) => viewer.showSeries(series));
sidebar.append(browser.element);
browser.setSeries(series);
browser.setActive(series[0].seriesInstanceUID);
```

Rencana lanjutan: thumbnail irisan tengah, pengelompokan per study.

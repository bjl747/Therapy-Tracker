# studio/export

Export utilities. All rendering goes through `../engine/render` so files match the screen.

- `gif.ts` – GIF89a encoder (`encodeGif`, sync; `encodeGifAsync`, worker with main-thread fallback; `buildPalette`, `lzwEncode`). Global palette: exact if the frames have few enough unique colours, else median cut over a sampled 5-bit histogram. Merges identical consecutive frames, crops later frames to the changed rectangle with a transparent index (disposal 1), optional Floyd–Steinberg dithering (`dither`, default off). Async version transfers (detaches) the frame buffers.
- `gif.worker.ts` – module worker entry used by `encodeGifAsync`; posts progress and the result bytes.
- `animate.ts` – `exportGif(design, pageIndex, {scale, fps, duration, hold, ...}, onProgress)` steps `drawPage` through `time`, holds the last frame; `designHasAnimation(page)`.
- `raster.ts` – `exportPng`, `exportJpg`, `copyPngToClipboard`, `downloadBlob`, `safeFileName`.
- `pdf.ts` – `exportDesignPdf(design, {scale, format, quality, ...})`: one PDF page per design page (1px = 0.75pt), title metadata, via dynamic `import('pdf-lib')`.
- `zip.ts` – `makeZip(files)` STORE-only ZIP with CRC32, UTF-8 names (bit 11), DOS timestamps, duplicate-name de-duplication; also exports `crc32`.
- `*.test.ts` – vitest (node) tests for the pure parts: GIF round-trip via a test LZW decoder, palette, zip structure, file names.

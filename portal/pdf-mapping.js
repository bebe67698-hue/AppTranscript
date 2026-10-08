import {getDocument,GlobalWorkerOptions} from '/vendor/pdfjs/build/pdf.mjs';
GlobalWorkerOptions.workerSrc='/vendor/pdfjs/build/pdf.worker.mjs';

export async function readPdfMappings(file, progress = () => {}, signal = null) {
  if (!file || file.size === 0 || file.size > 25 * 1024 * 1024 || !/\.pdf$/i.test(file.name)) {
    throw Error('กรุณาเลือกไฟล์ PDF ตารางเทียบโอน ขนาดไม่เกิน 25 MB');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') {
    throw Error('เนื้อหาไฟล์ไม่ใช่ PDF ที่ถูกต้อง');
  }

  let worker = null;
  let terminated = false;
  const cancelled = () => { if (signal?.aborted || terminated) throw Error('ยกเลิกการอ่านเอกสารแล้ว'); };

  let rejectCancelled;
  const cancellation = new Promise((_, reject) => { rejectCancelled = reject; });
  const abort = () => {
    terminated = true;
    rejectCancelled?.(Error('ยกเลิกการอ่านเอกสาร'));
    worker?.terminate().catch(() => {});
    loadingTask?.destroy().catch(() => {});
  };
  if (signal) signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 240_000);

  let loadingTask = null;

  async function recognize(canvas) {
    cancelled();
    if (!worker) {
      progress('กำลังเตรียม OCR ภาษาไทยและอังกฤษ…');
      worker = await Tesseract.createWorker(['eng', 'tha'], 1, {
        workerPath: '/vendor/tesseract/worker.min.js',
        corePath: '/vendor/tesseract-core',
        langPath: '/vendor/tessdata',
        workerBlobURL: false,
        logger: msg => {
          if (msg.status === 'recognizing text') {
            progress(`กำลังอ่านตัวอักษร OCR ${Math.round(msg.progress * 100)}%`);
          }
        }
      });
      cancelled();
    }
    const result = await worker.recognize(canvas);
    cancelled();
    return result.data.text;
  }

  async function processPdf() {
    cancelled();
    loadingTask = getDocument({
      data: bytes,
      isEvalSupported: false,
      cMapUrl: '/vendor/pdfjs/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: '/vendor/pdfjs/standard_fonts/',
      wasmUrl: '/vendor/pdfjs/wasm/'
    });

    const document = await loadingTask.promise;
    if (document.numPages > 30) throw Error('รองรับ PDF ไม่เกิน 30 หน้า กรุณาแบ่งไฟล์ก่อน');

    const allMappings = [];
    const seenPairs = new Set();
    let pagesProcessed = 0;

    for (let pageNum = 1; pageNum <= document.numPages; pageNum++) {
      cancelled();
      progress(`กำลังอ่านตาราง PDF หน้า ${pageNum}/${document.numPages}…`);

      const page = await document.getPage(pageNum);
      const content = await page.getTextContent();
      let pageMappings = [];

      if (content.items && content.items.length > 5) {
        // Digital PDF text layer available
        const items = content.items.map(item => ({
          str: item.str,
          transform: item.transform,
          width: item.width,
          height: item.height
        }));
        pageMappings = globalThis.PdfMappingParser.parsePdfItemsToTable(items);
      }

      // If text layer produced no mappings (e.g. scanned image PDF or non-standard font encoding)
      if (!pageMappings.length) {
        const natural = page.getViewport({ scale: 1 });
        const scale = Math.min(2.0, 2400 / Math.max(natural.width, natural.height));
        const viewport = page.getViewport({ scale });
        const canvas = globalThis.document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        const ocrText = await recognize(canvas);
        canvas.width = 1; canvas.height = 1;

        pageMappings = globalThis.PdfMappingParser.parseMappingText(ocrText);
      }

      for (const m of pageMappings) {
        const key = `${m.sourceCode}:${m.targetCode}`;
        if (!seenPairs.has(key)) {
          seenPairs.add(key);
          allMappings.push(m);
        }
      }

      page.cleanup();
      pagesProcessed++;
    }

    cancelled();
    return {
      mappings: allMappings,
      numPages: document.numPages,
      pagesProcessed
    };
  }

  try {
    return await Promise.race([processPdf(), cancellation]);
  } catch (error) {
    if (signal?.aborted) throw Error('ยกเลิกการอ่านเอกสารแล้ว');
    if (terminated) throw Error('อ่านเอกสารเกิน 4 นาที กรุณาลดขนาดไฟล์หรือตรวจสอบหน้า PDF');
    if (error.name === 'PasswordException') throw Error('PDF มีรหัสผ่าน กรุณาใช้ไฟล์ที่ปลดล็อกแล้ว');
    throw error;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', abort);
    await worker?.terminate().catch(() => {});
    await loadingTask?.destroy().catch(() => {});
  }
}

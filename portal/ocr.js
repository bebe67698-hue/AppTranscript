import {getDocument,GlobalWorkerOptions} from '/vendor/pdfjs/build/pdf.mjs';
GlobalWorkerOptions.workerSrc='/vendor/pdfjs/build/pdf.worker.mjs';

export async function readTranscript(fileOrFiles, progress, signal) {
  const files = Array.isArray(fileOrFiles) ? fileOrFiles : (fileOrFiles instanceof FileList ? Array.from(fileOrFiles) : [fileOrFiles]);
  if(!files.length) throw Error('กรุณาเลือกไฟล์ภาพถ่าย (JPG) หรือ PDF อย่างน้อย 1 ไฟล์');
  if(files.length > 10) throw Error('รองรับการอัปโหลดไม่เกิน 10 ไฟล์ในครั้งเดียว');

  for(const file of files) {
    if(!file || file.size===0 || file.size>10*1024*1024 || !/\.(pdf|jpe?g|png)$/i.test(file.name)) {
      throw Error(`ไฟล์ ${file?.name || 'เอกสาร'} ต้องเป็น PDF/JPG ขนาดไม่เกิน 10 MB`);
    }
  }

  let worker,loadingTask;
  let terminated=false;
  const cancelled=()=>{if(signal.aborted || terminated) throw Error('ยกเลิกการอ่านเอกสารแล้ว');};
  let rejectCancelled;
  const cancellation=new Promise((resolve,reject)=>{rejectCancelled=reject;});
  const abort=()=>{
    terminated=true;
    rejectCancelled(Error('ยกเลิกการอ่านเอกสาร'));
    worker?.terminate().catch(()=>{});
    loadingTask?.destroy().catch(()=>{});
  };
  signal.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,300_000);

  async function recognize(image) {
    cancelled();
    if(!worker) {
      progress('กำลังเตรียม OCR ภาษาไทยและอังกฤษ…');
      worker=await Tesseract.createWorker(['eng','tha'],1,{
        workerPath:'/vendor/tesseract/worker.min.js',corePath:'/vendor/tesseract-core',langPath:'/vendor/tessdata',workerBlobURL:false,
        logger:message=>{if(message.status==='recognizing text') progress(`กำลังอ่านตัวอักษร ${Math.round(message.progress*100)}%`);}
      });
      if(terminated || signal.aborted) await worker.terminate().catch(()=>{});
      cancelled();
    }
    const result=await worker.recognize(image);
    cancelled();
    return result.data.text;
  }

  async function processSingleFile(file, fileIndex, totalFiles) {
    cancelled();
    const prefix = totalFiles > 1 ? `[ไฟล์ ${fileIndex + 1}/${totalFiles}: ${file.name}] ` : '';
    const bytes=new Uint8Array(await file.arrayBuffer());
    const isPDF=String.fromCharCode(...bytes.slice(0,5))==='%PDF-';
    const isJPEG=bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
    const isPNG=bytes[0]===137 && bytes[1]===80 && bytes[2]===78 && bytes[3]===71;

    if(!isPDF && !isJPEG && !isPNG) throw Error(`ไฟล์ ${file.name} ไม่ใช่ PDF หรือรูปภาพที่ถูกต้อง`);

    if(isJPEG || isPNG) {
      progress(`${prefix}กำลังเปิดรูปภาพ…`);
      const image=await createImageBitmap(file);
      try {
        if(image.width*image.height>30_000_000) throw Error(`${file.name} มีความละเอียดเกิน 30 ล้านพิกเซล กรุณาย่อภาพก่อน`);
        const scale=Math.min(2.5, 2400/Math.max(image.width,image.height));
        const canvas=documentCanvas(Math.round(image.width*scale),Math.round(image.height*scale));
        const ctx=canvas.getContext('2d');
        ctx.drawImage(image,0,0,canvas.width,canvas.height);

        progress(`${prefix}กำลังสแกนข้อความในรูปภาพ…`);
        const fullText=await recognize(canvas);

        let columnTexts = '';
        if(canvas.height > canvas.width) {
          // Multi-column layout enhancement
          progress(`${prefix}กำลังสแกนคอลัมน์ซ้ายและขวา…`);
          const leftW = Math.round(canvas.width * 0.53);
          const leftCanvas = documentCanvas(leftW, canvas.height);
          leftCanvas.getContext('2d').drawImage(canvas, 0, 0, leftW, canvas.height, 0, 0, leftW, canvas.height);
          const leftText = await recognize(leftCanvas);
          leftCanvas.width = 1; leftCanvas.height = 1;

          const rightW = Math.round(canvas.width * 0.53);
          const rightX = Math.round(canvas.width * 0.47);
          const rightCanvas = documentCanvas(rightW, canvas.height);
          rightCanvas.getContext('2d').drawImage(canvas, rightX, 0, rightW, canvas.height, 0, 0, rightW, canvas.height);
          const rightText = await recognize(rightCanvas);
          rightCanvas.width = 1; rightCanvas.height = 1;

          columnTexts = `\n${leftText}\n${rightText}`;
        }

        canvas.width=1;canvas.height=1;
        return `${fullText}${columnTexts}`;
      } finally {image.close();}
    }

    loadingTask=getDocument({data:bytes,isEvalSupported:false,cMapUrl:'/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdfjs/standard_fonts/',wasmUrl:'/vendor/pdfjs/wasm/'});
    const pdfDoc=await loadingTask.promise;
    if(pdfDoc.numPages>10) throw Error(`${file.name} มีเกิน 10 หน้า กรุณาแบ่งไฟล์ก่อน`);
    const pdfPages=[];
    for(let number=1;number<=pdfDoc.numPages;number++) {
      cancelled();progress(`${prefix}กำลังอ่าน PDF หน้า ${number}/${pdfDoc.numPages}`);
      const page=await pdfDoc.getPage(number);
      const content=await page.getTextContent();
      const lines=[];
      for(const item of content.items) {
        if(!item.str?.trim()) continue;
        let line=lines.find(line=>Math.abs(line.y-item.transform[5])<2);
        if(!line) {line={y:item.transform[5],items:[]};lines.push(line);}
        line.items.push({x:item.transform[4],text:item.str});
      }
      let raw=lines.sort((a,b)=>b.y-a.y).map(line=>line.items.sort((a,b)=>a.x-b.x).map(item=>item.text).join(' ')).join('\n');
      if(!TranscriptParser.parseTranscript(raw).rows.length) {
        const natural=page.getViewport({scale:1});
        const scale=Math.min(2.5,2400/Math.max(natural.width,natural.height));
        const viewport=page.getViewport({scale});
        const canvas=documentCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
        await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
        
        const fullText=await recognize(canvas);
        let columnTexts = '';
        if(canvas.height > canvas.width) {
          const leftW = Math.round(canvas.width * 0.53);
          const leftCanvas = documentCanvas(leftW, canvas.height);
          leftCanvas.getContext('2d').drawImage(canvas, 0, 0, leftW, canvas.height, 0, 0, leftW, canvas.height);
          const leftText = await recognize(leftCanvas);
          leftCanvas.width = 1; leftCanvas.height = 1;

          const rightW = Math.round(canvas.width * 0.53);
          const rightX = Math.round(canvas.width * 0.47);
          const rightCanvas = documentCanvas(rightW, canvas.height);
          rightCanvas.getContext('2d').drawImage(canvas, rightX, 0, rightW, canvas.height, 0, 0, rightW, canvas.height);
          const rightText = await recognize(rightCanvas);
          rightCanvas.width = 1; rightCanvas.height = 1;

          columnTexts = `\n${leftText}\n${rightText}`;
        }
        raw=`${fullText}${columnTexts}`;
        canvas.width=1;canvas.height=1;
      }
      pdfPages.push(raw);page.cleanup();
    }
    return pdfPages.join('\n');
  }

  async function processAllDocuments() {
    const allResults=[];
    for(let i=0;i<files.length;i++) {
      const text=await processSingleFile(files[i], i, files.length);
      allResults.push(text);
    }
    cancelled();
    return allResults.join('\n\n--- ถัดไป ---\n\n');
  }

  try {
    return await Promise.race([processAllDocuments(),cancellation]);
  } catch(error) {
    if(signal.aborted) throw Error('ยกเลิกการอ่านเอกสารแล้ว');
    if(terminated) throw Error('อ่านเอกสารเกินกำหนด กรุณาลดขนาดไฟล์หรือกรอกข้อมูลด้วยตนเอง');
    if(error.name==='PasswordException') throw Error('PDF มีรหัสผ่าน กรุณาใช้ไฟล์ที่ปลดล็อกแล้ว');
    throw error;
  } finally {
    clearTimeout(timer);signal.removeEventListener('abort',abort);
    await worker?.terminate().catch(()=>{});
    await loadingTask?.destroy().catch(()=>{});
  }
}
function documentCanvas(width,height) {const canvas=globalThis.document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas;}


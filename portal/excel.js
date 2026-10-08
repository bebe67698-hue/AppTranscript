export function readWorkbook(file,options={}) {
  return new Promise(async(resolve,reject)=>{
    if(!file || !/\.xlsx$/i.test(file.name) || file.size===0 || file.size>5*1024*1024) {reject(Error('เลือกไฟล์ .xlsx ขนาดไม่เกิน 5 MB'));return;}
    const worker=new Worker('/portal/excel-worker.js');
    const timeout=setTimeout(()=>finish(Error('อ่านไฟล์เกิน 20 วินาที กรุณาตรวจสอบหรือลดขนาดไฟล์')),20_000);
    function finish(error,data) {clearTimeout(timeout);worker.terminate();error?reject(error):resolve(data);}
    worker.onmessage=event=>finish(event.data.error?Error(event.data.error):null,event.data.data);
    worker.onerror=()=>finish(Error('อ่านไฟล์ Excel ไม่สำเร็จ กรุณาใช้ไฟล์ตามแม่แบบ'));
    try {const buffer=await file.arrayBuffer();worker.postMessage({buffer,year:options.year},[buffer]);} catch(error) {finish(error);}
  });
}
export async function downloadTemplate() {
  const workbook=new ExcelJS.Workbook();
  const schema={curricula:['year','name'],courses:['year','code','name','credits'],mappings:['year','sourceCode','targetCode']};
  for(const [name,keys] of Object.entries(schema)) {
    const sheet=workbook.addWorksheet(name);
    sheet.columns=keys.map(key=>({header:key,key,width:key==='name'?45:22,style:{numFmt:key==='credits'?'0.0':'@'}}));
    sheet.getRow(1).font={bold:true,color:{argb:'FF047857'}};
    sheet.views=[{state:'frozen',ySplit:1}];
  }
  const buffer=await workbook.xlsx.writeBuffer();
  const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const link=document.createElement('a');link.href=url;link.download='it-transfer-template.xlsx';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}export function readStudentTransferWorkbook(file, options = {}) {
  return new Promise(async (resolve, reject) => {
    if (!file || !/\.xlsx$/i.test(file.name) || file.size === 0 || file.size > 10 * 1024 * 1024) {
      reject(Error('เลือกไฟล์ .xlsx ขนาดไม่เกิน 10 MB'));
      return;
    }
    const worker = new Worker('/portal/excel-worker.js');
    const timeout = setTimeout(() => finish(Error('อ่านไฟล์เกิน 20 วินาที กรุณาตรวจสอบหรือลดขนาดไฟล์')), 20_000);
    function finish(error, data) {
      clearTimeout(timeout);
      worker.terminate();
      error ? reject(error) : resolve(data);
    }
    worker.onmessage = event => finish(event.data.error ? Error(event.data.error) : null, event.data.data);
    worker.onerror = () => finish(Error('อ่านไฟล์ Excel ไม่สำเร็จ กรุณาใช้ไฟล์แบบสรุปเทียบโอนทางการ'));
    try {
      const buffer = await file.arrayBuffer();
      worker.postMessage({ buffer, mode: 'student_transfer', studentId: options.studentId }, [buffer]);
    } catch (error) {
      finish(error);
    }
  });
}

export function readExcelMappingWorkbook(file, options = {}) {
  return new Promise(async (resolve, reject) => {
    if (!file || !/\.xlsx$/i.test(file.name) || file.size === 0 || file.size > 10 * 1024 * 1024) {
      reject(Error('เลือกไฟล์ .xlsx ขนาดไม่เกิน 10 MB'));
      return;
    }
    const worker = new Worker('/portal/excel-worker.js');
    const timeout = setTimeout(() => finish(Error('อ่านไฟล์เกิน 20 วินาที กรุณาตรวจสอบหรือลดขนาดไฟล์')), 20_000);
    function finish(error, data) {
      clearTimeout(timeout);
      worker.terminate();
      error ? reject(error) : resolve(data);
    }
    worker.onmessage = event => finish(event.data.error ? Error(event.data.error) : null, event.data.data);
    worker.onerror = () => finish(Error('อ่านไฟล์ Excel ไม่สำเร็จ กรุณาตรวจสอบโครงสร้างตารางเทียบโอน'));
    try {
      const buffer = await file.arrayBuffer();
      worker.postMessage({ buffer, mode: 'excel_mapping', year: options.year }, [buffer]);
    } catch (error) {
      finish(error);
    }
  });
}

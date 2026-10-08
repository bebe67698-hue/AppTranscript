importScripts('/vendor/exceljs/exceljs.min.js','/shared/workbook.cjs','/shared/student-transfer-parser.cjs','/shared/excel-mapping-parser.cjs');
self.onmessage=async event=>{
  try {
    const workbook=new ExcelJS.Workbook();
    await workbook.xlsx.load(event.data.buffer);
    const sheets=Object.create(null);
    if(workbook.worksheets.length>20) throw Error('รองรับไม่เกิน 20 ชีต');
    for(const sheet of workbook.worksheets) {
      if(sheet.rowCount>2000 || sheet.columnCount>40) throw Error('ข้อมูลมีจำนวนแถวหรือคอลัมน์เกินขอบเขตที่รองรับ');
      sheets[sheet.name]=[];
      sheet.eachRow({includeEmpty:true},row=>{
        const values=[];
        row.eachCell({includeEmpty:true},(cell,column)=>{
          // Keep only the anchor value of merged cells, so continued names remain distinguishable.
          values[column-1]=cell.isMerged && cell.master.address!==cell.address?null:cell.value;
        });
        sheets[sheet.name].push(values);
      });
    }
    if (event.data.mode === 'student_transfer') {
      const parsed = StudentTransferParser.parseStudentTransferWorkbook(sheets, { fallbackStudentId: event.data.studentId });
      self.postMessage({ data: parsed });
      return;
    }
    if (event.data.mode === 'excel_mapping') {
      const parsed = ExcelMappingParser.parseExcelMappingWorkbook(sheets, { year: event.data.year });
      self.postMessage({ data: parsed });
      return;
    }
    self.postMessage({data:WorkbookParser.normalizeWorkbook(sheets,{year:event.data.year})});
  } catch(error) {self.postMessage({error:error.message || 'อ่าน Excel ไม่สำเร็จ'});}
};


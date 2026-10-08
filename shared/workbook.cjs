(function(root){
  'use strict';
  const schema={curricula:['year','name'],courses:['year','code','name','credits'],mappings:['year','sourceCode','targetCode']};
  function normalizeSheets(sheets){
    const data={}; let total=0;
    for(const [name,columns] of Object.entries(schema)){
      const rows=sheets[name];
      if(!Array.isArray(rows) || !rows.length) throw Error(`ไม่พบชีต ${name}`);
      if(columns.some((column,i)=>String(rows[0][i] || '').trim()!==column)) throw Error(`หัวตารางชีต ${name} ต้องเป็น ${columns.join(', ')}`);
      const seen=new Set();
      data[name]=rows.slice(1).filter(row=>row.some(cell=>cell!==null && cell!==undefined && cell!=='')).map((row,index)=>{
        const result={};
        for(const [i,column] of columns.entries()){
          const value=row[i];
          if(value!==null && typeof value==='object') throw Error(`ชีต ${name} แถว ${index+2}: ไม่รองรับสูตรหรือเซลล์ชนิดพิเศษ`);
          if(value===null || value===undefined || String(value).trim()==='') throw Error(`ชีต ${name} แถว ${index+2}: ${column} ว่าง`);
          if(['code','sourceCode','targetCode'].includes(column) && typeof value!=='string') throw Error(`ชีต ${name} แถว ${index+2}: ตั้งรหัสวิชาเป็น Text เพื่อรักษาเลขศูนย์นำหน้า`);
          result[column]=column==='credits'?Number(value):String(value).trim();
        }
        const key=`${result.year}:${String(result.code || result.sourceCode || '').toUpperCase()}`;
        if(seen.has(key)) throw Error(`ชีต ${name} มีข้อมูลซ้ำ: ${key}`);
        seen.add(key);
        total++; if(total>1000) throw Error('นำเข้าได้ไม่เกิน 1,000 แถวต่อครั้ง');
        return result;
      });
    }
    if(!total) throw Error('ไฟล์ไม่มีข้อมูลให้บันทึก');
    return data;
  }
  function cellText(value) {
    if(value && typeof value==='object' && Array.isArray(value.richText)) return value.richText.map(part=>part.text || '').join('').trim();
    return typeof value==='string'?value.trim():'';
  }
  function normalizeWorkbook(sheets, options={}) {
    if(Object.keys(schema).some(name=>Object.hasOwn(sheets,name))) return {data:normalizeSheets(sheets),format:'template',warnings:[]};
    const chosenYear=String(options.year || '').trim();
    if(!/^\d{4}$/.test(chosenYear) || Number(chosenYear)<2400 || Number(chosenYear)>2800) throw Error('กรุณาระบุปีหลักสูตร พ.ศ. ที่จะบันทึกแผนการศึกษา (ปีรับเข้าอาจต่างจากปีหลักสูตร)');
    const courses=[], seen=new Map(), names=new Set();
    let duplicateCount=0;
    for(const [sheetName,rows] of Object.entries(sheets)) {
      if(!Array.isArray(rows)) continue;
      const compact=value=>cellText(value).replace(/\s/g,'');
      const findColumns=row=>({code:row.findIndex(v=>compact(v)==='รหัสวิชา'),name:row.findIndex(v=>['ชื่อวิชา','ชื่อรายวิชา'].includes(compact(v))),credits:row.findIndex(v=>['จำนวนหน่วยกิต','หน่วยกิต','หน่วยกิตรวม'].includes(compact(v)))});
      const firstHeader=rows.findIndex(row=>Object.values(findColumns(row)).every(index=>index>=0));
      if(firstHeader<0) continue;
      const metadata=rows.slice(0,firstHeader).flat().map(cellText);
      let curriculumName=metadata.find(value=>value.replace(/\s/g,'').includes('เทคโนโลยีสารสนเทศ'));
      if(!curriculumName) throw Error(`ชีต ${sheetName}: ไม่พบชื่อหลักสูตรเทคโนโลยีสารสนเทศเหนือหัวตาราง`);
      const isTransfer=[sheetName,...metadata].some(value=>value.replace(/\s/g,'').includes('เทียบโอน'));
      if(isTransfer && !curriculumName.replace(/\s/g,'').includes('เทียบโอน')) {
        curriculumName=curriculumName.replace(/\s*\(\s*[0-9๐-๙]+\s*ปี\s*\)\s*$/,'').trim()+' (เทียบโอน)';
      }
      names.add(curriculumName);
      if(names.size>1) throw Error('พบชื่อหลักสูตรหลายชื่อ กรุณานำเข้าทีละหลักสูตร');
      let columns=null, previous=null;
      for(let i=firstHeader;i<rows.length;i++) {
        const row=rows[i], header=findColumns(row);
        if(Object.values(header).every(index=>index>=0)) {columns=header;previous=null;continue;}
        if(!columns) continue;
        const rawCode=row[columns.code],rawName=row[columns.name],rawCredits=row[columns.credits];
        const hasCode=rawCode!==undefined && rawCode!==null && rawCode!=='';
        const name=cellText(rawName);
        if(hasCode || (name && rawCredits!==undefined && rawCredits!==null && rawCredits!=='')) {
          const fail=message=>{throw Error(`ชีต ${sheetName} แถว ${i+1}: ${message}`);};
          if(typeof rawCode!=='string' || !/^[A-Z0-9][A-Z0-9._ -]*$/i.test(rawCode.trim())) fail('รหัสวิชาต้องเป็นข้อความและไม่ว่าง');
          if(!name || name.length>180) fail('ชื่อรายวิชาไม่ถูกต้อง');
          if(typeof rawCredits!=='number' && typeof rawCredits!=='string') fail('หน่วยกิตต้องเป็นตัวเลข ไม่รองรับสูตรในแถวรายวิชา');
          const credits=Number(rawCredits);
          if(!Number.isFinite(credits) || credits<=0 || credits>30 || credits*2%1!==0) fail('หน่วยกิตต้องมากกว่า 0 ไม่เกิน 30 และเพิ่มครั้งละ 0.5');
          previous={year:chosenYear,code:rawCode.trim().toUpperCase(),name,credits};
          courses.push(previous);
          if(courses.length>999) fail('นำเข้าได้ไม่เกิน 1,000 แถวรวมหลักสูตร');
        } else if(previous && name && row.every((value,index)=>index===columns.name || value===null || value===undefined || value==='')) {
          // The source workbook has both genuine continued names and a repeated last word.
          if(!previous.name.endsWith(name)) previous.name+=` ${name}`;
          if(previous.name.length>180) throw Error(`ชีต ${sheetName} แถว ${i+1}: ชื่อรายวิชายาวเกิน 180 ตัวอักษร`);
        } else previous=null;
      }
    }
    if(!courses.length) throw Error('ไม่พบรายวิชาในแผนการศึกษา หรือชีต curricula, courses, mappings ตามแม่แบบ');
    for(const course of courses) {
      const existing=seen.get(course.code);
      if(existing && (existing.name!==course.name || existing.credits!==course.credits)) throw Error(`รหัสวิชาซ้ำและข้อมูลขัดแย้ง: ${course.code}`);
      if(existing) duplicateCount++; else seen.set(course.code,course);
    }
    const warnings=['แผนการศึกษามีเฉพาะรายวิชา ไม่มีรหัสวิชาต้นทางสำหรับสร้างคู่เทียบ กรุณาเพิ่มคู่เทียบแยกต่างหาก','ใช้ปีหลักสูตรที่คุณระบุทุกวิชา กรุณายืนยันว่าตรงกับหลักสูตรจริง ปีรับเข้าและปีการศึกษาในแต่ละภาคเรียนอาจต่างจากปีหลักสูตร'];
    if(duplicateCount) warnings.push(`รวมรายวิชาซ้ำที่มีข้อมูลเหมือนกัน ${duplicateCount} แถว`);
    return {format:'study-plan',data:{curricula:[{year:chosenYear,name:[...names][0]}],courses:[...seen.values()],mappings:[]},warnings};
  }
  if(typeof module!=='undefined' && module.exports) module.exports={normalizeSheets,normalizeWorkbook};
  else root.WorkbookParser={normalizeSheets,normalizeWorkbook};
})(globalThis);

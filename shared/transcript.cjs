(function(root){
  'use strict';

  function cleanThaiSpaces(raw) {
    let text = String(raw);
    // Do not merge trailing grade tokens like " ผ." or " ผ" or " ม.ผ." at end of line or before next course
    text = text.replace(/([\u0E00-\u0E7F])\s+(?=[ผม][.]?(?:\s|$))/g, '$1 ');
    let prev;
    do {
      prev = text;
      text = text.replace(/([\u0E00-\u0E7F])\s+(?=[\u0E00-\u0E7F](?![\s.]*$))/g, '$1');
    } while (text !== prev);
    return text;
  }

  function parseTranscript(raw){
    if(!raw) return {rows:[],unmatched:[]};

    const text=cleanThaiSpaces(raw);
    const lines=text.split(/\r?\n/).map(line=>line.replace(/\s+/g,' ').trim()).filter(Boolean);
    const rows=[]; const unmatched=[]; const seenCodes=new Set();

    function normalizeGrade(rawGrade) {
      if(!rawGrade) return '';
      let g=String(rawGrade).trim().toUpperCase();
      g=g.replace(/^[|\[\](){}.,\s/\\:;*#='"`~_-]+|[|\[\](){}.,\s/\\:;*#='"`~_-]+$/g,'');
      if(['ผ.','ผ','W','P','S','พ'].includes(g)) return 'ผ';
      if(['ม.ผ.','มผ','U'].includes(g)) return 'ม.ผ.';
      if(['40','4.0','AO','A0'].includes(g)) return '4';
      if(['35','3.5'].includes(g)) return '3.5';
      if(['30','3.0'].includes(g)) return '3';
      if(['25','2.5'].includes(g)) return '2.5';
      if(['20','2.0'].includes(g)) return '2';
      if(['15','1.5'].includes(g)) return '1.5';
      if(['10','1.0'].includes(g)) return '1';
      if(['00','0.0'].includes(g)) return '0';
      return g;
    }

    function normalizeCode(rawCode) {
      if(!rawCode) return '';
      let code=String(rawCode).trim();
      code=code.replace(/^[|(){}.,\s/\\:;*#='"`~_-]+|[|(){}.,\s/\\:;*#='"`~_-]+$/g,'').trim();
      // Strip table border bracket noise from vocational codes
      if(/^[\[\]]?\d{4,5}[-.\s_]\d{4}[\[\]]?$/.test(code) || /^.*(3\d{4}-\d{4}|3\d{3}-\d{4})[\[\]]?$/.test(code)){
        code=code.replace(/[\[\]]/g,'');
      }
      code=code.replace(/^(\d{4,5})[.\s_](\d{4})$/,'$1-$2');
      code=code.replace(/.*(3\d{4}-\d{4}|3\d{3}-\d{4})$/,'$1');
      if(/^(?:19\d{2}|000[01]|0203)-\d{4}$/.test(code)) code='3'+code;
      return code.toUpperCase();
    }

    function isSummaryOrHeader(name) {
      if(!name || name.length<2) return true;
      const junkPatterns=[
        /จำนวนหน่วยกิต/,/คะแนนเฉลี่ย/,/ระดับผลการเรียน/,/ระดับคะแนน/,/ภาคเรียนที่/,
        /หน่วยกิตที่/,/หน่วยกิตสะสม/,/กลุ่มสมรรถนะ/,/หมวดวิชา/,/กิจกรรมเสริมหลักสูตร/,
        /รหัสสถานศึกษา/,/รหัสประจำตัว/,/เลขประจำตัว/,/ลำดับ/,/วันเดือนปี/,
        /ชื่อ-สกุล/,/สาขาวิชา/,/ประเภทวิชา/,/กลุ่มอาชีพ/,/สำเร็จการศึกษา/,
        /เหตุที่ออก/,/หน้าที่/,/ผู้อำนวยการ/,/หัวหน้างาน/,/เกณฑ์การสำเร็จ/
      ];
      return junkPatterns.some(p=>p.test(name));
    }

    function cleanCourseName(rawName) {
      let name=String(rawName || '').replace(/^[|\[\](){}.,\s/\\:;*#=+'"`~_-]+|[|\[\](){}.,\s/\\:;*#=+'"`~_-]+$/g,'').trim();
      // Remove trailing notes like (*4) or (*1)
      name=name.replace(/\s*\(?\*\d+\)?\s*$/,'').trim();
      // Remove trailing OCR garbage at end of name like ' 40 I ข' or ' 40' or ' 30' or ' 2 3.0'
      name=name.replace(/\s+(?:\d{1,2}(?:\.\d)?|\d{2})\s*(?:[|\[\]/\\:;Iขบก-ฮa-zA-Z]|\s*)*$/i,'').trim();
      name=name.replace(/\s+[|\[\]/\\:;Iขบก-ฮ]+\s*$/i,'').trim();
      name=name.replace(/^[|\[\](){}.,\s/\\:;*#=+'"`~_-]+|[|\[\](){}.,\s/\\:;*#=+'"`~_-]+$/g,'').trim();
      return name;
    }

    function isValidCourse(code, name, grade) {
      if(!code || !name) return false;
      if(isSummaryOrHeader(name)) return false;

      // Reject codes that are just 1-2 letters or year numbers
      if(/^[A-Z]{1,2}$/.test(code)) return false;
      if(/^\d{1,4}$/.test(code)) return false;
      if(/^\d{10,}$/.test(code)) return false;

      // Must match course code structure:
      // - 5 digits - 4 digits (30000-1101, 31910-1001)
      // - 4 digits - 4 digits (3000-1206)
      // - University code (BSCCT203, GEBLC101, CS101, IT201, [T2071)
      // - 6-digit number (000123)
      const isVocational=/^\d{4,5}-\d{4}$/.test(code);
      const isUniversity=/^[A-Za-z\[\]][A-Za-z\[\]\d._-]*\d[A-Za-z\[\]\d._-]*$/.test(code);
      const is6Digit=/^\d{6}$/.test(code);
      if(!isVocational && !isUniversity && !is6Digit) return false;

      // Reject strange grade tokens that are actually summary scores like 350, 366
      if(/^\d{3,}$/.test(grade)) return false;

      return true;
    }

    function addCourse(rawCode, rawName, rawCredits, rawGrade) {
      const code=normalizeCode(rawCode);
      const grade=normalizeGrade(rawGrade);
      const name=cleanCourseName(rawName);

      if(!isValidCourse(code,name,grade)) return false;
      if(seenCodes.has(code)) return false;
      seenCodes.add(code);

      const credits=Number(rawCredits)>=0.5 && Number(rawCredits)<=10 ? Number(rawCredits) : (grade==='ผ' ? 0 : 3);
      rows.push({code,name,credits,grade});
      return true;
    }

    const linePattern=/^(?:(?:[12S]|\d{1,2})\/\d{4}\s*|[\u0E00-\u0E7F\w\d|\[\]\/.-]+\s+)?([A-Za-z]{1,8}[- ]?\d{2,8}|\d{4,5}[-.\s]\d{4}|\d{4,12}|[A-Za-z\[\]][A-Za-z\[\]\d._-]*\d[A-Za-z\[\]\d._-]*)[|\]\s]+((?:(?!\s*\[?(?:\d{4,5}[-.\s]\d{4}|[A-Za-z]{2,8}\d{3,4})).)+?)\s+(?:(\d{1,2}(?:\.\d)?)(?:\s*\([^)]*\))?\s+)?([|\[\]]?[A-Za-z0-9][A-Za-z0-9+\/.-]{0,4}|[ผพม][.]?[ผส]?)[|\]]?\s*$/i;
    const courseTokenPattern=/(?:(?:[12S]|\d{1,2})\/\d{4}\s+|[|\[\s]|^)\s*([A-Za-z]{1,8}[- ]?\d{2,8}|\d{4,5}[-.\s]\d{4}|\d{4,12})\s*[|\]\s]+([\u0E00-\u0E7F\w\s()./'-]+?)\s+(?:(\d(?:\.\d)?)\s+)?([0-4](?:\.[05])?|[1-4][05]|A[+-]?|B[+-]?|C[+-]?|D[+-]?|F|TC|ผ[.]?|ม[.]?ผ[.]?|[0-9])(?=\s*(?:(?:[12S]|\d{1,2}|l|I)\s*\/?\d{4}|[A-Za-z]{1,8}\d|\d{4,5}[-.\s]\d{4}|จำนวน|คะแนน|หมวด|กลุ่ม|$|[|\]\[]))/gi;

    for(const line of lines){
      const match=line.match(linePattern);
      if(match && addCourse(match[1],match[2],match[3],match[4])) continue;

      let found=false; let m;
      while((m=courseTokenPattern.exec(line))!==null){
        if(addCourse(m[1],m[2],m[3],m[4])) found=true;
      }
      if(!found) unmatched.push(line);
    }
    return {rows,unmatched};
  }
  if(typeof module!=='undefined' && module.exports) module.exports={parseTranscript};
  else root.TranscriptParser={parseTranscript};
})(globalThis);

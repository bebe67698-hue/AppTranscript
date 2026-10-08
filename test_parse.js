const {parseTranscript} = require('./shared/transcript.cjs');

// Mock a replacement of parseTranscript
function testParse(raw) {
    const text=String(raw);
    const lines=text.split(/\r?\n/).map(line=>line.replace(/\s+/g,' ').trim()).filter(Boolean);
    const rows=[]; const unmatched=[]; const seenCodes=new Set();

    // Use same helper logic
    function normalizeCode(c) { return c; }
    function cleanCourseName(n) { return n; }
    function normalizeGrade(g) { return g; }
    function isValidCourse(c,n,g) { return true; }
    
    function addCourse(code, name, credits, grade) {
        rows.push({code, name, credits, grade});
        return true;
    }

    const linePattern=/^(?:(?:[12S]|\d{1,2})\/\d{4}\s*|[\u0E00-\u0E7F\w\d|\[\]\/.-]+\s+)?([A-Za-z]{1,8}[- ]?\d{2,8}|\d{4,5}[-.\s]\d{4}|\d{4,12}|[A-Za-z\[\]][A-Za-z\[\]\d._-]*\d[A-Za-z\[\]\d._-]*)[|\]\s]+(.+?)\s+(?:(\d{1,2}(?:\.\d)?)(?:\s*\([^)]*\))?\s+)?([|\[\]]?[A-Za-z0-9][A-Za-z0-9+\/.-]{0,4}|[ผพม][.]?[ผส]?)[|\]]?(?=\s|$)/i;
    const courseTokenPattern=/(?:(?:[12S]|\d{1,2})\/\d{4}\s+|[|\[\s]|^)\s*([A-Za-z]{1,8}[- ]?\d{2,8}|\d{4,5}[-.\s]\d{4}|\d{4,12})\s*[|\]\s]+([\u0E00-\u0E7F\w\s()./'-]+?)\s+(?:(\d(?:\.\d)?)\s+)?([0-4](?:\.[05])?|[1-4][05]|A[+-]?|B[+-]?|C[+-]?|D[+-]?|F|TC|ผ[.]?|ม[.]?ผ[.]?|[0-9])(?=\s*(?:(?:[12S]|\d{1,2})\/\d{4}|[A-Za-z]{1,8}\d|\d{4,5}[-.\s]\d{4}|จำนวน|คะแนน|หมวด|กลุ่ม|$|[|\]]))/gi;

    for(let line of lines){
      let lineMatch = false;
      const match=line.match(linePattern);
      if(match && addCourse(match[1],match[2],match[3],match[4])) {
          lineMatch = true;
          line = line.substring(match[0].length);
      }

      let found=false; let m;
      while((m=courseTokenPattern.exec(line))!==null){
        if(addCourse(m[1],m[2],m[3],m[4])) found=true;
      }
      if(!found && !lineMatch) unmatched.push(line);
    }
    return {rows,unmatched};
}

console.log(testParse('30000-1201 ภาษาอังกฤษสำหรับงานอาชีพ 4 0 l 22567[31910-1002 l ธุรกิจดิจิทัล 4.0'));

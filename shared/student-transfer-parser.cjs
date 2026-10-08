(function (root) {
  'use strict';

  function cleanText(val) {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object' && Array.isArray(val.richText)) {
      return val.richText.map(p => p.text || '').join('').trim();
    }
    return String(val).trim();
  }

  function cleanNumber(val, defaultVal = 0) {
    const text = cleanText(val);
    const match = text.match(/\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : defaultVal;
  }

  function parseCredits(val) {
    const text = cleanText(val);
    const match = text.match(/^(\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) : 3;
  }

  /**
   * Parses 2D array of rows from Excel sheet formatted as "แบบสรุปรายวิชาที่ขอเทียบโอนผลการเรียนรายวิชา / กลุ่มวิชา"
   */
  function parseStudentTransferSheet(rows, options = {}) {
    if (!Array.isArray(rows) || rows.length < 10) {
      throw Error('รูปแบบไฟล์ Excel ไม่ถูกต้องหรือไม่มีข้อมูลเพียงพอ');
    }

    // 1. Metadata Extraction
    let studentName = '';
    let studentId = '';
    let curriculumName = '';
    let department = '';
    let level = 'ปริญญาตรี';
    let admissionYear = '';
    let priorCurriculum = '';

    for (let i = 0; i < Math.min(15, rows.length); i++) {
      const row = rows[i] || [];
      const lineStr = row.map(cleanText).join(' ');

      // Name & Curriculum
      const nameMatch = lineStr.match(/ชื่อนักศึกษา\s*[:：]?\s*([^,]+?)(?=\s*หลักสูตร|\s*$)/);
      if (nameMatch && !studentName) studentName = nameMatch[1].replace(/[,:：]/g, '').trim();

      const currMatch = lineStr.match(/หลักสูตร\s*[:：]?\s*([^,]+?)(?=\s*$)/);
      if (currMatch && !curriculumName) curriculumName = currMatch[1].replace(/[,:：]/g, '').trim();

      // Student ID & Department
      const idMatch = lineStr.match(/รหัสประจำตัว\s*[:：]?\s*([0-9]{11,13}-[0-9]|[0-9]{11,14})/);
      if (idMatch && !studentId) studentId = idMatch[1].trim();

      const deptMatch = lineStr.match(/สาขา\s*[:：]?\s*([^,]+?)(?=\s*$)/);
      if (deptMatch && !department) department = deptMatch[1].replace(/[,:：]/g, '').trim();

      // Admission Year & Level
      const yearMatch = lineStr.match(/ปีที่เข้าศึกษา\s*[:：]?\s*(\d{4})/);
      if (yearMatch && !admissionYear) admissionYear = yearMatch[1].trim();

      const levelMatch = lineStr.match(/ระดับ\s*[:：]?\s*([^,]+?)(?=\s*ปีที่เข้าศึกษา|\s*$)/);
      if (levelMatch && !level) level = levelMatch[1].replace(/[,:：]/g, '').trim();

      // Prior diploma
      if (lineStr.includes('สาขา') && lineStr.includes('สาขาวิชา') && i < 12) {
        priorCurriculum = lineStr.replace(/^[, ]+|[, ]+$/g, '').trim();
      }
    }

    if (!studentId && options.fallbackStudentId) {
      studentId = options.fallbackStudentId;
    }
    if (!studentId) {
      throw Error('ไม่พบรหัสประจำตัวนักศึกษาในไฟล์ (เช่น 69242206001-6)');
    }

    // 2. Table Header Identification
    let tableHeaderIndex = -1;
    let colIndex = {
      sourceNo: 0,
      sourceCode: 1,
      sourceName: 2,
      sourceCredits: 3,
      sourceGrade: 4,
      targetNo: 5,
      targetCode: 6,
      targetName: 7,
      targetCredits: 8,
      targetGrade: 9,
      passed: 10,
      failed: 11
    };

    for (let i = 5; i < Math.min(18, rows.length); i++) {
      const row = rows[i] || [];
      const cells = row.map(cleanText);
      const codeIndices = [];
      cells.forEach((c, idx) => {
        if (c === 'รหัสวิชา' || c.includes('รหัสวิชา')) codeIndices.push(idx);
      });
      if (codeIndices.length >= 2) {
        tableHeaderIndex = i;
        colIndex.sourceCode = codeIndices[0];
        colIndex.sourceName = codeIndices[0] + 1;
        colIndex.sourceCredits = codeIndices[0] + 2;
        colIndex.sourceGrade = codeIndices[0] + 3;

        colIndex.targetCode = codeIndices[1];
        colIndex.targetName = codeIndices[1] + 1;
        colIndex.targetCredits = codeIndices[1] + 2;
        colIndex.targetGrade = codeIndices[1] + 3;
        colIndex.passed = codeIndices[1] + 4;
        break;
      }
    }

    if (tableHeaderIndex === -1) {
      tableHeaderIndex = 10;
    }

    // 3. Row Parsing & Grouping
    let currentGroup = 'หมวดวิชาศึกษาทั่วไป';
    const courses = [];
    let pendingSources = [];
    let currentTarget = null;

    let totalCurriculumCredits = 131;
    let totalTransferredCredits = 0;
    let remainingCredits = 0;
    let evaluatedDate = '';
    let evaluatorName = '';

    for (let i = tableHeaderIndex + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const lineStr = row.map(cleanText).join(' ');

      // Check for category header
      if (/หมวดวิชา/i.test(lineStr)) {
        const groupMatch = lineStr.match(/หมวดวิชา[^\s,]+/);
        if (groupMatch) {
          currentGroup = groupMatch[0];
        }
        currentTarget = null;
        pendingSources = [];
        continue;
      }

      // Check for summary footer
      if (lineStr.includes('รวมหน่วยกิตตามหลักสูตร') || lineStr.includes('เทียบ / โอน / ยกเว้นได้') || lineStr.includes('จะต้องเรียนอีก')) {
        const currMatch = lineStr.match(/รวมหน่วยกิตตามหลักสูตร\s*(\d+(?:\.\d+)?)/);
        if (currMatch) totalCurriculumCredits = Number(currMatch[1]);

        const transMatch = lineStr.match(/(?:เทียบ\s*\/\s*โอน\s*\/\s*ยกเว้นได้|เทียบโอนได้)\s*(\d+(?:\.\d+)?)/);
        if (transMatch) totalTransferredCredits = Number(transMatch[1]);

        const remMatch = lineStr.match(/จะต้องเรียนอีก\s*(\d+(?:\.\d+)?)/);
        if (remMatch) remainingCredits = Number(remMatch[1]);
        continue;
      }

      // Check for evaluator name & date
      if (lineStr.includes('ประธานกรรมการ') || lineStr.includes('คณะกรรมการ')) {
        const evalMatch = lineStr.match(/\(([^)]+)\)/);
        if (evalMatch && !evalMatch[1].includes('นายณัฐวุฒิ') && !evalMatch[1].includes(studentName)) {
          evaluatorName = evalMatch[1].trim();
        }
      }
      const dateMatch = lineStr.match(/\b(20\d{2}-\d{2}-\d{2}|\d{1,2}\s+[^\d\s]+\s+25\d{2})\b/);
      if (dateMatch && !evaluatedDate) {
        evaluatedDate = dateMatch[1].trim();
      }

      const sourceCodeRaw = cleanText(row[colIndex.sourceCode]);
      const sourceNameRaw = cleanText(row[colIndex.sourceName]);
      const sourceCreditsRaw = cleanText(row[colIndex.sourceCredits]);
      const sourceGradeRaw = cleanText(row[colIndex.sourceGrade]);

      const targetCodeRaw = cleanText(row[colIndex.targetCode]);
      const targetNameRaw = cleanText(row[colIndex.targetName]);
      const targetCreditsRaw = cleanText(row[colIndex.targetCredits]);
      const targetGradeRaw = cleanText(row[colIndex.targetGrade]);
      const passedRaw = cleanText(row[colIndex.passed]);

      // Clean target code (remove leading brace '}' or numbers like '}1,')
      let cleanTargetCode = targetCodeRaw.replace(/^[\s\}0-9,.-]+/, '').trim().toUpperCase();
      let cleanTargetName = targetNameRaw;
      let cleanTargetCredits = parseCredits(targetCreditsRaw);

      const hasSource = Boolean(sourceCodeRaw && sourceCodeRaw !== '-' && !/^(รวม|ลงชื่อ)$/.test(sourceCodeRaw));
      const hasTarget = Boolean(cleanTargetCode && /^[A-Z0-9]{5,10}$/i.test(cleanTargetCode));

      if (hasSource) {
        const srcObj = {
          code: sourceCodeRaw.toUpperCase(),
          name: sourceNameRaw,
          credits: cleanNumber(sourceCreditsRaw, 3),
          grade: sourceGradeRaw
        };
        pendingSources.push(srcObj);
      }

      if (hasTarget) {
        const isPassed = passedRaw === '/' || passedRaw === 'ผ่าน' || targetGradeRaw.toUpperCase() === 'TC' || passedRaw === 'TC';
        currentTarget = {
          group: currentGroup,
          sources: [...pendingSources],
          targetCode: cleanTargetCode,
          targetName: cleanTargetName || cleanTargetCode,
          targetCredits: cleanTargetCredits,
          targetGrade: targetGradeRaw || 'TC',
          passed: isPassed
        };
        courses.push(currentTarget);
        pendingSources = [];
      } else if (currentTarget && hasSource) {
        // Multi-course bracket grouping (subsequent source row for the same target)
        currentTarget.sources.push(...pendingSources);
        pendingSources = [];
      }
    }

    if (!totalTransferredCredits && courses.length) {
      totalTransferredCredits = courses.reduce((sum, c) => sum + (c.passed ? c.targetCredits : 0), 0);
      remainingCredits = Math.max(0, totalCurriculumCredits - totalTransferredCredits);
    }

    return {
      studentId,
      studentName: studentName || 'นักศึกษาเทียบโอน',
      curriculumYear: admissionYear || '2569',
      curriculumName: curriculumName || 'เทคโนโลยีสารสนเทศ',
      faculty: 'คณะวิทยาศาสตร์และเทคโนโลยีการเกษตร',
      department: department || 'วิทยาศาสตร์',
      level,
      priorCurriculum,
      totalCurriculumCredits,
      totalTransferredCredits,
      remainingCredits,
      evaluatedDate: evaluatedDate || new Date().toISOString().split('T')[0],
      evaluatorName: evaluatorName || 'คณะกรรมการประเมินผลการเทียบโอน',
      courses
    };
  }

  /**
   * Parses all sheets in a workbook containing one or more student transfer summary sheets.
   */
  function parseStudentTransferWorkbook(sheets, options = {}) {
    if (!sheets || typeof sheets !== 'object') {
      throw Error('รูปแบบข้อมูลชีตไม่ถูกต้อง');
    }

    const students = [];
    const errors = [];

    for (const [sheetName, rows] of Object.entries(sheets)) {
      if (!Array.isArray(rows) || rows.length < 8) continue;
      
      // Check if sheet contains transfer summary markers
      const sampleText = rows.slice(0, 15).flat().map(cleanText).join(' ');
      const isTransferSheet = sampleText.includes('แบบสรุปรายวิชาที่ขอเทียบโอน') ||
        sampleText.includes('รหัสประจำตัว') ||
        sampleText.includes('เทียบโอนผลการเรียน');

      if (!isTransferSheet) continue;

      try {
        const studentRecord = parseStudentTransferSheet(rows, options);
        studentRecord.sheetName = sheetName;
        students.push(studentRecord);
      } catch (err) {
        errors.push(`ชีต ${sheetName}: ${err.message}`);
      }
    }

    if (!students.length) {
      if (errors.length) {
        throw Error(errors.join('; '));
      }
      throw Error('ไม่พบข้อมูลแบบสรุปรายวิชาเทียบโอนในไฟล์ Excel กรุณาใช้ไฟล์แบบสรุปเทียบโอนทางการ');
    }

    return {
      students,
      count: students.length,
      errors
    };
  }

  const moduleExports = {
    cleanText,
    cleanNumber,
    parseCredits,
    parseStudentTransferSheet,
    parseStudentTransferWorkbook
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = moduleExports;
  } else {
    root.StudentTransferParser = moduleExports;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);


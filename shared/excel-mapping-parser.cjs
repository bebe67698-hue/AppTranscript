(function (root) {
  'use strict';

  function cleanText(val) {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') {
      if (val.richText && Array.isArray(val.richText)) {
        return val.richText.map(r => r.text || '').join('').trim();
      }
      if (val.text) return String(val.text).trim();
      if (val.result !== undefined) return String(val.result).trim();
    }
    return String(val).replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  }

  function normalizeCode(raw) {
    let c = cleanText(raw).toUpperCase().replace(/[\s_]+/g, '');
    c = c.replace(/^(GEBLC|GEBSC|GEBSO|GEBHT|GEBIN|GEDLC|GEDSC|GEDSO|GEDEL|FUNSC|FUNMA|BSCCT)[LI|](\d{2})/i, '$11$2');
    c = c.replace(/^(GEBLC|GEBSC|GEBSO|GEBHT|GEBIN|GEDLC|GEDSC|GEDSO|GEDEL|FUNSC|FUNMA|BSCCT)(\d)[LI|](\d)/i, '$1$20$3');
    c = c.replace(/^30000[I|L](\d{4})$/, '30000-1$1');
    c = c.replace(/^3000[I|L](\d{4})$/, '3000-1$1');
    c = c.replace(/^30000-(\d{3})$/, '30000-1$1');
    c = c.replace(/^3000-(\d{3})$/, '3000-1$1');
    return c;
  }

  function isValidTargetCode(code) {
    const c = normalizeCode(code);
    if (!c || /^\d{4}$/.test(c)) return false;
    if (/^(หรือ|และ|ไม่มี|เทียบได้|กลุ่มวิชา|หลักสูตร|รายวิชา|พ.ศ|พศ|หมวดวิชา|ตาราง|ข้อบังคับ|ประกาศ|ระดับ|จำนวน|หน่วยกิต)$/i.test(c)) return false;
    return /^[A-Z]{2,8}\d{2,4}$/i.test(c) || /^\d{8}$/.test(c);
  }

  function isValidSourceCode(code) {
    const c = normalizeCode(code);
    if (!c || c === '-' || /^(หรือ|และ|ไม่มี|เทียบได้|การเทียบโอน|การเทียบ|รหัสวิชา|รายวิชา|หน่วยกิต)$/i.test(c)) return false;
    if (/^\d{5}-\d{4}$/.test(c)) return true;
    if (/^\d{4}-\d{4}$/.test(c)) return true;
    if (/^(GEDLC|GEDSC|GEDSO|GEDEL|[A-Z]{2,6})\d{3,4}$/i.test(c)) return true;
    if (/^\d{8}$/.test(c)) return true;
    return false;
  }

  function parseCredits(val) {
    const text = cleanText(val);
    const match = text.match(/\b(\d(?:\.\d)?)\b/);
    if (match) {
      const num = Number(match[1]);
      if (num > 0 && num <= 30) return num;
    }
    return 3;
  }

  function detectMatrixColumns(headerRow, subHeaderRow = []) {
    // Structure:
    // Left: Target Course [Code, Name, Credits]
    // Followed by 1 or more Source Course Blocks [TransferCondition, Code, Name, Credits]
    
    // Look for target columns (first 3 columns by default or where subheaders are Code, Name, Credits)
    const targetBlock = {
      codeCol: 0,
      nameCol: 1,
      creditsCol: 2
    };

    // Find all source blocks
    const sourceBlocks = [];
    const maxCols = Math.max(headerRow.length, subHeaderRow.length);

    let currentSourceYear = '';
    for (let c = 0; c < maxCols; c++) {
      const hText = cleanText(headerRow[c]);
      const yearMatch = hText.match(/\b(25\d{2})\b/);
      if (yearMatch) {
        currentSourceYear = yearMatch[1];
      }

      const subText = cleanText(subHeaderRow[c]);
      if (c >= 3 && /^(รหัสวิชา|รหัส)$/i.test(subText)) {
        // This is a source course code column
        const codeCol = c;
        const condCol = (c > 0 && /เทียบ/i.test(cleanText(subHeaderRow[c - 1]) || cleanText(headerRow[c - 1]))) ? c - 1 : (c > 0 ? c - 1 : -1);
        const nameCol = (c + 1 < maxCols && /^(รายวิชา|ชื่อวิชา|ชื่อรายวิชา)$/i.test(cleanText(subHeaderRow[c + 1]))) ? c + 1 : c + 1;
        const creditsCol = (c + 2 < maxCols && /^(หน่วยกิต|นก\.?)$/i.test(cleanText(subHeaderRow[c + 2]))) ? c + 2 : c + 2;

        sourceBlocks.push({
          sourceYear: currentSourceYear,
          condCol,
          codeCol,
          nameCol,
          creditsCol
        });
      }
    }

    // Fallback if subheader row wasn't cleanly detected (standard 4-column repeating blocks starting from col 3):
    if (!sourceBlocks.length && maxCols >= 7) {
      for (let c = 3; c < maxCols; c += 4) {
        let blockYear = '';
        for (let k = c; k < Math.min(maxCols, c + 4); k++) {
          const ym = cleanText(headerRow[k]).match(/\b(25\d{2})\b/);
          if (ym) { blockYear = ym[1]; break; }
        }
        sourceBlocks.push({
          sourceYear: blockYear,
          condCol: c,
          codeCol: c + 1,
          nameCol: c + 2,
          creditsCol: c + 3
        });
      }
    }

    return { targetBlock, sourceBlocks };
  }

  function parseExcelMappingSheet(rows, options = {}) {
    if (!Array.isArray(rows) || !rows.length) return [];

    let subHeaderIndex = -1;
    for (let r = 0; r < Math.min(20, rows.length); r++) {
      const codeCount = (rows[r] || []).filter(v => /^รหัสวิชา$/i.test(cleanText(v))).length;
      if (codeCount >= 2) {
        subHeaderIndex = r;
        break;
      }
    }

    if (subHeaderIndex < 0) {
      for (let r = 0; r < Math.min(20, rows.length); r++) {
        const rowStr = (rows[r] || []).map(cleanText).join(' ');
        if (rowStr.includes('รหัสวิชา') && rowStr.includes('รายวิชา')) {
          subHeaderIndex = r;
          break;
        }
      }
    }

    const headerIndex = subHeaderIndex > 0 ? subHeaderIndex - 1 : 0;
    if (subHeaderIndex < 0) subHeaderIndex = 1;

    const headerRow = rows[headerIndex] || [];
    const subHeaderRow = rows[subHeaderIndex] || [];

    const { targetBlock, sourceBlocks } = detectMatrixColumns(headerRow, subHeaderRow);
    const startDataRow = subHeaderIndex + 1;

    let currentTarget = null;
    const mappings = [];
    const seenPairs = new Set();
    const pendingCondition = new Array(sourceBlocks.length).fill('');

    for (let r = startDataRow; r < rows.length; r++) {
      const row = rows[r] || [];
      const rowStr = row.map(cleanText).join(' ');
      if (!rowStr || /^(\*|หมายเหตุ|รวมหน่วยกิต|รวม)/i.test(rowStr)) continue;

      const rawTargetCode = row[targetBlock.codeCol];
      const normTargetCode = normalizeCode(rawTargetCode);

      if (isValidTargetCode(normTargetCode)) {
        const targetName = cleanText(row[targetBlock.nameCol]);
        const targetCredits = parseCredits(row[targetBlock.creditsCol]);
        currentTarget = {
          targetCode: normTargetCode,
          targetName: targetName || normTargetCode,
          targetCredits
        };
        pendingCondition.fill('');
      }

      if (!currentTarget) continue;

      // Process each source block
      for (let b = 0; b < sourceBlocks.length; b++) {
        const block = sourceBlocks[b];
        const rawCode = row[block.codeCol];
        const sourceCode = normalizeCode(rawCode);

        // Check if this row is a standalone condition row (e.g. 'และ' or 'หรือ')
        const blockText = [
          block.condCol >= 0 ? cleanText(row[block.condCol]) : '',
          cleanText(row[block.codeCol]),
          cleanText(row[block.nameCol])
        ].join(' ');

        if (/และ/i.test(blockText)) {
          pendingCondition[b] = 'and';
        } else if (/หรือ|หรืือ/i.test(blockText)) {
          pendingCondition[b] = 'or';
        }

        if (!isValidSourceCode(sourceCode) || sourceCode === currentTarget.targetCode) {
          continue;
        }

        const sourceName = cleanText(row[block.nameCol]);
        const sourceCredits = parseCredits(row[block.creditsCol]);
        const condCellText = block.condCol >= 0 ? cleanText(row[block.condCol]) : '';

        let condition = pendingCondition[b] || 'single';
        if (/และ/i.test(condCellText)) {
          condition = 'and';
        } else if (/หรือ|หรืือ/i.test(condCellText)) {
          condition = 'or';
        }
        pendingCondition[b] = '';

        const pairKey = `${sourceCode}:${currentTarget.targetCode}`;
        if (!seenPairs.has(pairKey)) {
          seenPairs.add(pairKey);
          mappings.push({
            targetCode: currentTarget.targetCode,
            targetName: currentTarget.targetName,
            targetCredits: currentTarget.targetCredits,
            sourceCode,
            sourceName: sourceName || sourceCode,
            sourceCredits,
            sourceYear: block.sourceYear || '',
            condition
          });
        }
      }
    }

    return mappings;
  }

  function parseExcelMappingWorkbook(sheets, options = {}) {
    if (!sheets || typeof sheets !== 'object') {
      throw Error('ไม่พบข้อมูลชีตในไฟล์ Excel');
    }

    const sheetNames = Object.keys(sheets);
    if (!sheetNames.length) {
      throw Error('ไฟล์ Excel ไม่มีข้อมูลชีต');
    }

    // Try finding the most relevant worksheet (e.g. contains 'เทียบโอน' or 'หมวดวิชาเฉพาะ' or first sheet)
    let selectedSheetName = sheetNames[0];
    for (const name of sheetNames) {
      if (/เทียบโอน|เฉพาะ|mapping|matrix/i.test(name)) {
        selectedSheetName = name;
        break;
      }
    }

    const rows = sheets[selectedSheetName] || [];
    const mappings = parseExcelMappingSheet(rows, options);

    return {
      sheetName: selectedSheetName,
      mappings,
      total: mappings.length
    };
  }

  const moduleExports = {
    cleanText,
    normalizeCode,
    isValidTargetCode,
    isValidSourceCode,
    parseCredits,
    detectMatrixColumns,
    parseExcelMappingSheet,
    parseExcelMappingWorkbook
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = moduleExports;
  } else {
    root.ExcelMappingParser = moduleExports;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

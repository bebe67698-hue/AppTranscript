const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseTranscript } = require('../shared/transcript.cjs');
const { normalizeSheets, normalizeWorkbook } = require('../shared/workbook.cjs');

function studyPlan() {
  return {'แผน 3 ปี เทียบโอน ': [
    ['แผนการศึกษาสำหรับนักศึกษาที่รับเข้าปีการศึกษา 2567'],
    ['หลักสูตร','วท.บ.เทคโนโลยีสารสนเทศ (4ปี)'],
    [null,'ลำดับ','กลุ่มวิชา','รหัสวิชา','ชื่อวิชา','รหัสวิชาบังคับก่อน','จำนวนหน่วยกิต'],
    ['ปีการศึกษา 2568',1,'วิชาเฉพาะ','BSCCT203','ระบบฐานข้อมูล',null,3],
    [null,2,'วิชาเฉพาะ','BSCCT907','การเตรียมความพร้อมฝึกประสบการณ์วิชาชีพ',null,1],
    [null,null,null,null,'ทางเทคโนโลยีสารสนเทศ'],
    [null,null,'รวม',null,null,null,{formula:'SUM(G4:G6)',result:4}],
    ['ปีการศึกษา 2562',1,null,null,null,null,{formula:'SUM(#REF!)',result:{error:'#REF!'}}]
  ]};
}

test('study plan uses the chosen curriculum year, joins continued names and never invents mappings', () => {
  const result=normalizeWorkbook(studyPlan(),{year:'2565'});
  assert.equal(result.format,'study-plan');
  assert.deepEqual(result.data.curricula,[{year:'2565',name:'วท.บ.เทคโนโลยีสารสนเทศ (เทียบโอน)'}]);
  assert.deepEqual(result.data.courses,[
    {year:'2565',code:'BSCCT203',name:'ระบบฐานข้อมูล',credits:3},
    {year:'2565',code:'BSCCT907',name:'การเตรียมความพร้อมฝึกประสบการณ์วิชาชีพ ทางเทคโนโลยีสารสนเทศ',credits:1}
  ]);
  assert.deepEqual(result.data.mappings,[]);
  assert.ok(result.warnings.length);
  assert.throws(()=>normalizeWorkbook(studyPlan()),/ปีหลักสูตร/);
});

test('study plan rejects invalid course cells and conflicting duplicate codes', () => {
  for(const [column,value] of [[3,123],[4,{formula:'A1'}],[6,{formula:'1+2',result:3}],[6,0],[3,''],[4,'']]) {
    const sheets=studyPlan();sheets[Object.keys(sheets)[0]][3][column]=value;
    assert.throws(()=>normalizeWorkbook(sheets,{year:'2567'}));
  }
  const sheets=studyPlan(),rows=sheets[Object.keys(sheets)[0]];
  rows.push([null,3,'วิชาเฉพาะ','BSCCT203','ชื่อที่ขัดแย้ง',null,3]);
  assert.throws(()=>normalizeWorkbook(sheets,{year:'2567'}),/ซ้ำ/);
});

test('transfer naming follows sheet or plan metadata and leaves regular curricula intact', () => {
  const rows=Object.values(studyPlan())[0];
  const regular=normalizeWorkbook({'แผนการศึกษา':rows},{year:'2567'});
  assert.equal(regular.data.curricula[0].name,'วท.บ.เทคโนโลยีสารสนเทศ (4ปี)');
  const transferRows=structuredClone(rows);
  transferRows[1].push('ระยะเวลาการศึกษา 3 ปี (เทียบโอน)');
  assert.equal(normalizeWorkbook({'แผนการศึกษา':transferRows},{year:'2567'}).data.curricula[0].name,'วท.บ.เทคโนโลยีสารสนเทศ (เทียบโอน)');
  transferRows[1][1]='วท.บ.เทคโนโลยีสารสนเทศ (เทียบโอน)';
  assert.equal(normalizeWorkbook({'แผนการศึกษา':transferRows},{year:'2567'}).data.curricula[0].name,'วท.บ.เทคโนโลยีสารสนเทศ (เทียบโอน)');
});

test('OCR parser reads codes, Thai/English names, credits and grades without guessing missing grades', () => {
  const result = parseTranscript('ACADEMIC TRANSCRIPT\nCS101 Introduction to Programming 3 B+\nIT201 ระบบฐานข้อมูล 3 C\n000123 ภาษาอังกฤษ 2 A\nIT202 System Analysis 3 I\nGPA 3.40');
  assert.equal(result.rows.length, 4);
  assert.deepEqual(result.rows[0], { code: 'CS101', name: 'Introduction to Programming', credits: 3, grade: 'B+' });
  assert.equal(result.rows[1].grade, 'C');
  assert.equal(result.rows[2].code, '000123');
  assert.equal(result.rows[3].grade, 'I');
  assert.equal(parseTranscript('No legible course rows').rows.length, 0);
});
test('workbook requires exact sheets/columns, preserves leading zeros and rejects formulas and duplicates', () => {
  const sheets = { curricula: [['year','name'],['2565','IT']], courses: [['year','code','name','credits'],['2565','0001','Course',3]], mappings: [['year','sourceCode','targetCode'],['2565','001','0001']] };
  assert.equal(normalizeSheets(sheets).courses[0].code, '0001');
  assert.throws(() => normalizeSheets({ ...sheets, courses: [['year','code'],['2565','IT1']] }));
  assert.throws(() => normalizeSheets({ ...sheets, curricula: [['year','name'],['2565',{ formula: '1+1' }]] }));
  assert.throws(() => normalizeSheets({ ...sheets, courses: [...sheets.courses,sheets.courses[1]] }));
});

const { parsePdfItemsToTable, parseMappingText, matchMappingsWithCatalog } = require('../shared/pdf-mapping.cjs');

test('uncertain OCR codes and digit grades remain editable instead of being guessed or dropped', () => {
  const parsed = parseTranscript('[T2071 ระบบฐานข้อมูล 3 6\nGE101 ภาษาอังกฤษ 3 8');
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].code, '[T2071');
  assert.equal(parsed.rows[0].grade, '6');
  assert.equal(parsed.rows[1].grade, '8');
});

test('vocational transcripts with semester prefixes, 2-column layout and Thai/decimal grades parse properly', () => {
  const sample = `
1/2567 30000-1101 ทักษะภาษาไทยเพื่อการสื่อสารในงานอาชีพ 2 3.0
1/2567 30000-1201 ภาษาอังกฤษสำหรับงานอาชีพ 2 4.0
2/2567 30000-1206 ภาษาอังกฤษสำหรับเทคโนโลยีธุรกิจดิจิทัล 1 4.0
2/2568 30203-0002 การใช้เครื่องใช้สำนักงานดิจิทัล 2 ผ.
S/2568 30203-2007 การจัดการสำนักงาน 2 4.0
1/2567 30000-2001 กิจกรรมเสริมสร้างสุจริต จิตอาสา ผ.
`;
  const result = parseTranscript(sample);
  assert.equal(result.rows.length, 6);
  assert.equal(result.rows[0].code, '30000-1101');
  assert.equal(result.rows[0].credits, 2);
  assert.equal(result.rows[0].grade, '3');
  assert.equal(result.rows[3].code, '30203-0002');
  assert.equal(result.rows[3].grade, 'ผ');
});

test('OCR parses lines with merged courses properly without swallowing the second course', () => {
  const sample = `30000-1201 ภาษาอังกฤษสำหรับงานอาชีพ 4 0 l 22567[31910-1002 l ธุรกิจดิจิทัล 4.0`;
  const result = parseTranscript(sample);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].code, '30000-1201');
  assert.equal(result.rows[0].grade, '0');
  assert.equal(result.rows[1].code, '31910-1002');
  assert.equal(result.rows[1].grade, '4');
});

test('PDF mapping parser extracts target codes on left and source codes on right with or-expansion', () => {
  const pdfItems = [
    { str: 'GEBLC101', x: 40, y: 500 },
    { str: 'ภาษาอังกฤษเพื่อการสื่อสารในชีวิตประจำวัน 3(3-0-6)', x: 90, y: 500 },
    { str: 'GEDLC101 ภาษาอังกฤษเพื่อการสื่อสาร 3(2-2-5)', x: 250, y: 500 },
    { str: '30000-1201 ภาษาอังกฤษเพื่อการสื่อสาร 2-2-3', x: 400, y: 500 },
    { str: '3000-1206 การสนทนาภาษาอังกฤษ 1 หรือ 3000-1207 การสนทนาภาษาอังกฤษ 2', x: 550, y: 500 },

    { str: 'GEBLC201', x: 40, y: 400 },
    { str: 'ศิลปะการใช้ภาษาไทย 3(3-0-6)', x: 90, y: 400 },
    { str: '30000-1101 ทักษะภาษาไทยเชิงวิชาชีพ หรือ 30000-1104 ทักษะภาษาไทยเชิงสร้างสรรค์', x: 300, y: 400 }
  ];

  const mappings = parsePdfItemsToTable(pdfItems);
  assert.equal(mappings.length, 6);
  assert.ok(mappings.some(m => m.targetCode === 'GEBLC101' && m.sourceCode === 'GEDLC101'));
  assert.ok(mappings.some(m => m.targetCode === 'GEBLC101' && m.sourceCode === '30000-1201'));
  assert.ok(mappings.some(m => m.targetCode === 'GEBLC101' && m.sourceCode === '3000-1206' && m.condition === 'or'));
  assert.ok(mappings.some(m => m.targetCode === 'GEBLC101' && m.sourceCode === '3000-1207' && m.condition === 'or'));
  assert.ok(mappings.some(m => m.targetCode === 'GEBLC201' && m.sourceCode === '30000-1101' && m.condition === 'or'));
  assert.ok(mappings.some(m => m.targetCode === 'GEBLC201' && m.sourceCode === '30000-1104' && m.condition === 'or'));
});

test('matchMappingsWithCatalog verifies existing courses, auto-creates missing courses and deduplicates', () => {
  const catalog = {
    curricula: [{ id: 1, year: '2565', name: 'IT' }],
    courses: [
      { id: 10, curriculum_id: 1, year: '2565', code: 'GEBLC101', name: 'Eng 1', credits: 3 },
      { id: 11, curriculum_id: 1, year: '2565', code: 'GEBLC201', name: 'Thai 1', credits: 3 }
    ],
    mappings: [
      { id: 100, curriculum_id: 1, year: '2565', source_code: '30000-1201', target_course_id: 10 }
    ]
  };

  const extracted = [
    { targetCode: 'GEBLC101', sourceCode: '30000-1201', sourceName: 'Eng' }, // existing (update)
    { targetCode: 'GEBLC201', sourceCode: '30000-1101', sourceName: 'Thai' }, // new
    { targetCode: 'BSCFT999', targetName: 'Food Tech 999', targetCredits: 3, sourceCode: '30000-9999', sourceName: 'Unknown' }, // new course to create
    { targetCode: 'GEBLC101', sourceCode: '30000-1201', sourceName: 'Eng Dup' } // duplicate source
  ];

  const matched = matchMappingsWithCatalog(extracted, '2565', catalog);
  assert.equal(matched.valid.length, 3);
  assert.equal(matched.newCount, 2);
  assert.equal(matched.updateCount, 1);
  assert.equal(matched.coursesToCreate.length, 1);
  assert.equal(matched.coursesToCreate[0].code, 'BSCFT999');
  assert.equal(matched.duplicateCount, 1);
});

const { parseStudentTransferSheet, parseStudentTransferWorkbook } = require('../shared/student-transfer-parser.cjs');

test('StudentTransferParser parses official transfer sheet with multi-course bracket grouping and credits summary', () => {
  const mockSheetRows = [
    ['แบบสรุปรายวิชาที่ขอเทียบโอนผลการเรียนรายวิชา / กลุ่มวิชา'],
    ['ชื่อนักศึกษา : นาย ณัฐวุฒิ พึ่งญาติ', 'หลักสูตร : เทคโนโลยีสารสนเทศ'],
    ['รหัสประจำตัว : 69242206001-6', 'สาขา : วิทยาศาสตร์'],
    ['ระดับ : ปริญญาตรี', 'ปีที่เข้าศึกษา : 2569'],
    ['สาขาวิชา เทคโนโลยีสารสนเทศ (ปวส.)'],
    ['ที่', 'รหัสวิชา', 'ชื่อวิชา', 'นก.', 'เกรด', 'ที่', 'รหัสวิชา', 'ชื่อวิชา', 'นก.', 'เกรด', 'ผลการเทียบ'],
    ['หมวดวิชาศึกษาทั่วไป'],
    [1, '30000-1201', 'ภาษาอังกฤษสำหรับงานอาชีพ', 2, '4', null, null, null, null, null, null],
    [2, '30000-1202', 'การเขียนและการนำเสนอโครงงาน', 1, '4', 1, '} GEBLC101', 'ภาษาอังกฤษเพื่อการสื่อสาร', 3, 'TC', 'ผ่าน'],
    ['หมวดวิชาชีพเฉพาะ'],
    [3, '31901-2007', 'เทคโนโลยีการจัดการฐานข้อมูล', 3, '4', 2, 'BSCCT203', 'ระบบฐานข้อมูล', 3, 'TC', 'ผ่าน'],
    ['รวมหน่วยกิตตามหลักสูตร 131 หน่วยกิต'],
    ['เทียบ / โอน / ยกเว้นได้ 42 หน่วยกิต'],
    ['จะต้องเรียนอีก 89 หน่วยกิต']
  ];

  const parsed = parseStudentTransferSheet(mockSheetRows);
  assert.equal(parsed.studentId, '69242206001-6');
  assert.equal(parsed.studentName, 'นาย ณัฐวุฒิ พึ่งญาติ');
  assert.equal(parsed.curriculumYear, '2569');
  assert.equal(parsed.curriculumName, 'เทคโนโลยีสารสนเทศ');
  assert.equal(parsed.totalCurriculumCredits, 131);
  assert.equal(parsed.totalTransferredCredits, 42);
  assert.equal(parsed.remainingCredits, 89);
  assert.equal(parsed.courses.length, 2);

  // Check multi-source bracket course
  const multiCourse = parsed.courses[0];
  assert.equal(multiCourse.targetCode, 'GEBLC101');
  assert.equal(multiCourse.sources.length, 2);
  assert.equal(multiCourse.sources[0].code, '30000-1201');
  assert.equal(multiCourse.sources[1].code, '30000-1202');
  assert.equal(multiCourse.passed, true);

  // Check single source course
  const singleCourse = parsed.courses[1];
  assert.equal(singleCourse.targetCode, 'BSCCT203');
  assert.equal(singleCourse.sources.length, 1);
  assert.equal(singleCourse.sources[0].code, '31901-2007');

  // Test workbook wrapper
  const workbookResult = parseStudentTransferWorkbook({ 'Sheet1': mockSheetRows });
  assert.equal(workbookResult.count, 1);
  assert.equal(workbookResult.students[0].studentId, '69242206001-6');
});



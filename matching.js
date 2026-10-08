/* Pure matching logic shared by the browser demo and Node tests. */
(function (root) {
  'use strict';
  const grades = Object.freeze({ 'A+': 4, A: 4, 'B+': 3.5, B: 3, 'C+': 2.5, C: 2, 'D+': 1.5, D: 1, F: 0 });
  function checkCourse(course, year, pairs) {
    const code = String(course.code ?? '').trim().toUpperCase();
    const grade = String(course.grade ?? '').trim().toUpperCase();
    if (!code || !String(course.name ?? '').trim() || !Number.isFinite(Number(course.credits)) || Number(course.credits) <= 0) {
      throw new Error('กรุณากรอกรหัสวิชา ชื่อวิชา และหน่วยกิตที่มากกว่า 0 ให้ครบถ้วน');
    }
    if (!Object.hasOwn(grades, grade)) throw new Error('กรุณาเลือกเกรดตัวอักษรที่รองรับ');
    if (!String(year ?? '').trim()) throw new Error('กรุณาเลือกปีหลักสูตร');
    if (grades[grade] < grades.C) return { status: 'ineligible', label: 'เทียบไม่ได้', reason: 'ผลการเรียนต่ำกว่า C จึงไม่ผ่านเงื่อนไขการเทียบโอน' };
    const pair = pairs.find(item => item.code === code && item.year === String(year));
    if (!pair) return { status: 'unknown', label: 'ไม่พบข้อมูล', reason: 'ไม่พบคู่เทียบในปีหลักสูตรที่เลือก กรุณารอ Admin อัปเดตข้อมูล' };
    return { status: 'eligible', label: 'เทียบได้', reason: `คู่เทียบตัวอย่าง: ${pair.target} · เกรดผ่านเกณฑ์ C ขึ้นไป` };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { checkCourse };
  else root.TransferMatching = Object.freeze({ checkCourse });
})(typeof globalThis !== 'undefined' ? globalThis : this);

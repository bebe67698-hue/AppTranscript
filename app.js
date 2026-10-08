'use strict';

// These fictional pairs demonstrate the interaction, not official equivalencies.
const demoPairs = Object.freeze([
  { code: 'CS101', year: '2565', target: 'IT101 การเขียนโปรแกรมเบื้องต้น' },
  { code: 'CS102', year: '2565', target: 'IT102 โครงสร้างข้อมูล' },
  { code: 'IT201', year: '2565', target: 'IT201 ระบบฐานข้อมูล' },
  { code: 'IT202', year: '2565', target: 'IT202 การวิเคราะห์และออกแบบระบบ' },
  { code: 'CS101', year: '2567', target: 'IT110 พื้นฐานการเขียนโปรแกรม' },
  { code: 'IT201', year: '2567', target: 'IT210 การจัดการฐานข้อมูล' }
]);
const demoCourses = [
  { code: 'CS101', name: 'การเขียนโปรแกรมเบื้องต้น', credits: 3, grade: 'B+' },
  { code: 'CS102', name: 'โครงสร้างข้อมูล', credits: 3, grade: 'A' },
  { code: 'IT201', name: 'ระบบฐานข้อมูล', credits: 3, grade: 'B' },
  { code: 'IT202', name: 'การวิเคราะห์และออกแบบระบบ', credits: 3, grade: 'D+' },
  { code: 'GE101', name: 'ภาษาอังกฤษเพื่อการสื่อสาร', credits: 3, grade: 'B' }
];

const navigation = document.querySelector('#navigation');
const menuToggle = document.querySelector('.menu-toggle');
function closeMenu() {
  navigation.classList.remove('is-open');
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'เปิดเมนู');
}
menuToggle.addEventListener('click', () => {
  const open = menuToggle.getAttribute('aria-expanded') !== 'true';
  navigation.classList.toggle('is-open', open);
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? 'ปิดเมนู' : 'เปิดเมนู');
});
navigation.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
document.addEventListener('click', event => { if (!event.target.closest('.site-header')) closeMenu(); });

const studentDialog = document.querySelector('#student-dialog');
const adminDialog = document.querySelector('#admin-dialog');
function openDialog(dialog) {
  closeMenu();
  dialog.showModal();
  document.body.classList.add('modal-open');
}
document.querySelectorAll('[data-open-student]').forEach(button => button.addEventListener('click', () => openDialog(studentDialog)));
document.querySelectorAll('[data-open-admin]').forEach(button => button.addEventListener('click', () => { location.href = '/admin.html'; }));
document.querySelectorAll('[data-student-system]').forEach(button => button.addEventListener('click', () => { location.href = '/student.html'; }));
document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.addEventListener('close', () => document.body.classList.remove('modal-open'));
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
});

const editor = document.querySelector('#course-editor');
const results = document.querySelector('#demo-results');
const reviewed = document.querySelector('#reviewed');
const yearSelect = document.querySelector('#curriculum-year');
const fileInput = document.querySelector('#transcript-file');
const fileMessage = document.querySelector('#file-message');
const formError = document.querySelector('#form-error');

function invalidateResults() {
  results.hidden = true;
  reviewed.checked = false;
  formError.textContent = '';
}

function renderEditor() {
  editor.replaceChildren();
  demoCourses.forEach((course, index) => {
    const row = document.createElement('tr');
    for (const [key, title] of [['code', 'รหัสวิชา'], ['name', 'ชื่อรายวิชา'], ['credits', 'หน่วยกิต'], ['grade', 'เกรด']]) {
      const cell = document.createElement('td');
      const control = document.createElement(key === 'grade' ? 'select' : 'input');
      control.setAttribute('aria-label', `${title} แถว ${index + 1}`);
      control.name = `${key}-${index}`;
      control.dataset.field = key;
      control.required = true;
      if (key === 'grade') {
        for (const grade of ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'F']) {
          control.add(new Option(grade, grade));
        }
      } else if (key === 'credits') {
        control.type = 'number';
        control.min = '0.5';
        control.max = '30';
        control.step = '0.5';
      } else {
        control.type = 'text';
        control.maxLength = key === 'code' ? 30 : 180;
      }
      control.value = course[key];
      cell.append(control);
      row.append(cell);
    }
    editor.append(row);
  });
  invalidateResults();
}
renderEditor();
editor.addEventListener('input', invalidateResults);
editor.addEventListener('change', invalidateResults);
yearSelect.addEventListener('change', invalidateResults);
document.querySelector('#reset-demo').addEventListener('click', () => {
  renderEditor();
  yearSelect.value = '2565';
  fileInput.value = '';
  fileMessage.textContent = '';
  fileMessage.classList.remove('error');
});

fileInput.addEventListener('change', () => {
  invalidateResults();
  const file = fileInput.files[0];
  fileMessage.classList.remove('error');
  if (!file) { fileMessage.textContent = ''; return; }
  const extensionOK = /\.(pdf|jpe?g)$/i.test(file.name);
  const typeOK = !file.type || ['application/pdf', 'image/jpeg'].includes(file.type);
  if (!extensionOK || !typeOK || file.size > 10 * 1024 * 1024 || file.size === 0) {
    fileMessage.textContent = 'กรุณาเลือกไฟล์ PDF หรือ JPG ที่มีข้อมูลและมีขนาดไม่เกิน 10 MB';
    fileMessage.classList.add('error');
    fileInput.value = '';
    return;
  }
  fileMessage.textContent = `เลือกไฟล์: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB) · ยังไม่ได้อ่าน OCR ตารางยังเป็นข้อมูลสาธิต คุณแก้ไขข้อมูลเองได้`;
});

document.querySelector('#student-form').addEventListener('submit', event => {
  event.preventDefault();
  formError.textContent = '';
  if (!reviewed.checked) {
    formError.textContent = 'กรุณาตรวจทานข้อมูลและทำเครื่องหมายยืนยันก่อนตรวจสอบ';
    reviewed.focus();
    return;
  }
  const courses = Array.from(editor.rows, row => Object.fromEntries(Array.from(row.querySelectorAll('[data-field]'), control => [control.dataset.field, control.value.trim()])));
  let checked;
  try {
    checked = courses.map(course => ({ course, result: TransferMatching.checkCourse(course, yearSelect.value, demoPairs) }));
  } catch (error) {
    formError.textContent = error.message;
    results.hidden = true;
    return;
  }
  const list = document.querySelector('#result-list');
  list.replaceChildren();
  for (const { course, result } of checked) {
    const row = document.createElement('article');
    row.className = 'demo-result-row';
    const text = document.createElement('div');
    const title = document.createElement('h4');
    title.textContent = `${course.code.toUpperCase()} · ${course.name}`;
    const reason = document.createElement('p');
    reason.textContent = result.reason;
    const badge = document.createElement('span');
    badge.className = `status ${result.status}`;
    badge.textContent = result.label;
    text.append(title, reason);
    row.append(text, badge);
    list.append(row);
  }
  const count = status => checked.filter(item => item.result.status === status).length;
  document.querySelector('#results-summary').textContent = `หลักสูตร พ.ศ. ${yearSelect.value} · ${checked.length} รายวิชา · เทียบได้ ${count('eligible')} · เทียบไม่ได้ ${count('ineligible')} · ไม่พบข้อมูล ${count('unknown')}`;
  results.hidden = false;
  results.querySelector('h3').focus({ preventScroll: true });
  results.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
});

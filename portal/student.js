import {$,el,api,boot,busy,notice,options,showView,formatDate} from './shared.js';
import {readTranscript} from './ocr.js';

let readController=null;
let reading=false;
let checking=false;
let originalFileUrl=null;
const supportedGrades=['4','3.5','3','2.5','2','1.5','1','0','A+','A','B+','B','C+','C','D+','D','F','P','S','TC','ผ','ม.ผ.','W','I'];
const steps=()=>document.querySelectorAll('.progress-steps li');
function stage(index){steps().forEach((step,i)=>step.classList.toggle('active',i<=index));}
function invalidate(){
  $('#review-confirm').checked=false;$('#student-results').hidden=true;stage($('#review-rows').children.length?1:0);
}
function updateCount(){
  const count=$('#review-rows').children.length;
  $('#row-count').textContent=`${count} รายวิชา · ตรวจและแก้ไขได้ทุกช่อง`;
  $('#review-empty').hidden=count>0;
  invalidate();
}
function normalizeCourseGrade(raw) {
  if(!raw) return '';
  const g=String(raw).trim().toUpperCase();
  if(['4.0','40'].includes(g)) return '4';
  if(['3.0','30'].includes(g)) return '3';
  if(['2.0','20'].includes(g)) return '2';
  if(['1.0','10'].includes(g)) return '1';
  if(['0.0','00'].includes(g)) return '0';
  if(['ผ.','ผ','พ'].includes(g)) return 'ผ';
  if(['ม.ผ.','มผ'].includes(g)) return 'ม.ผ.';
  return g;
}
function addRow(course={code:'',name:'',credits:3,grade:''}) {
  if($('#review-rows').children.length>=200) {notice('เพิ่มได้ไม่เกิน 200 รายวิชา',true);return;}
  const row=el('tr');
  const normalizedGrade=normalizeCourseGrade(course.grade);
  for(const [key,title] of [['code','รหัสวิชา'],['name','ชื่อรายวิชา'],['credits','หน่วยกิต'],['grade','เกรด']]) {
    const cell=el('td'),control=el(key==='grade'?'select':'input');
    control.dataset.field=key;control.required=true;control.setAttribute('aria-label',title);
    if(key==='grade') {
      control.add(new Option('เลือกเกรด',''));
      supportedGrades.forEach(grade=>control.add(new Option(grade,grade)));
      if(normalizedGrade && !supportedGrades.includes(normalizedGrade)) control.add(new Option(`${normalizedGrade} — ต้องตรวจทาน`,normalizedGrade));
      control.value=normalizedGrade;
    } else {
      control.type=key==='credits'?'number':'text';control.maxLength=key==='code'?30:180;
      if(key==='credits'){control.min='0';control.max='30';control.step='0.5';}
      control.value=course[key];
    }
    cell.append(control);row.append(cell);
  }
  const removeCell=el('td'),remove=el('button','row-remove','×');remove.type='button';remove.setAttribute('aria-label','ลบแถวรายวิชานี้');remove.addEventListener('click',()=>{row.remove();updateCount();});removeCell.append(remove);row.append(removeCell);
  $('#review-rows').append(row);updateCount();
}
function parseRaw() {
  const rawText=$('#raw-text').value;
  const parsed=TranscriptParser.parseTranscript(rawText);
  if(parsed.rows.length>200) throw Error('พบรายวิชาเกิน 200 แถว กรุณาแบ่งเอกสาร');
  
  // Auto-detect student ID from transcript text if not already typed
  const idMatch=rawText.match(/\b([0-9]{11,13}-[0-9]|[0-9]{11,14})\b/);
  if(idMatch && !$('#student-id-input').value) {
    $('#student-id-input').value=idMatch[1];
  }
  
  $('#review-rows').replaceChildren();parsed.rows.forEach(addRow);updateCount();
  notice(parsed.rows.length?`แยกได้ ${parsed.rows.length} รายวิชา กรุณาตรวจสอบกับต้นฉบับ รวมถึงรายวิชาที่ OCR อาจอ่านไม่ครบ`:'ไม่พบแถวรายวิชาที่แยกได้อัตโนมัติ กรุณาดูข้อความ OCR และเพิ่มข้อมูลด้วยตนเอง',!parsed.rows.length);
}
function lockReview(locked) {
  $('#review-form').querySelectorAll('input,select,button').forEach(control=>control.disabled=locked);
  $('#student-id-input').disabled=locked;
  $('#student-file').disabled=locked;
  $('#read-document').disabled=locked;
  $('#parse-text').disabled=locked;
  $('#raw-text').disabled=locked;
}
$('#add-course-row').addEventListener('click',()=>addRow());
$('#review-rows').addEventListener('input',invalidate);
$('#review-rows').addEventListener('change',invalidate);
$('#student-id-input').addEventListener('input',invalidate);
$('#student-file').addEventListener('change',()=>{
  invalidate();$('#review-rows').replaceChildren();updateCount();$('#raw-text').value='';$('#raw-details').hidden=true;$('#ocr-progress').textContent='';notice('');
  if(originalFileUrl) URL.revokeObjectURL(originalFileUrl);
  originalFileUrl=null;
  const files=Array.from($('#student-file').files);
  const link=$('#open-original');
  link.hidden=true;link.removeAttribute('href');
  if(files.length>0){
    const firstFile=files[0];
    if(/\.(pdf|jpe?g|png)$/i.test(firstFile.name) && firstFile.size<=10*1024*1024){
      originalFileUrl=URL.createObjectURL(firstFile);link.href=originalFileUrl;
      link.textContent=files.length>1?`เปิดดูรูปแรก (${firstFile.name}) ↗`:'เปิดเอกสารต้นฉบับเพื่อตรวจทาน ↗';
      link.hidden=false;
    }
  }
});
$('#parse-text').addEventListener('click',event=>busy(event.currentTarget,async()=>parseRaw()));
$('#read-document').addEventListener('click',async()=>{
  if(reading || checking)return;
  const files=Array.from($('#student-file').files);
  if(!files.length){notice('กรุณาเลือกไฟล์ภาพถ่าย (JPG) หรือ PDF ก่อน',true);return;}
  reading=true;readController=new AbortController();invalidate();notice('');lockReview(true);$('#cancel-ocr').hidden=false;
  try {
    const text=await readTranscript(files,message=>$('#ocr-progress').textContent=message,readController.signal);
    $('#raw-text').value=text.slice(0,200000);$('#raw-details').hidden=false;parseRaw();$('#ocr-progress').textContent='อ่านเอกสารเสร็จแล้ว กรุณาตรวจทานข้อมูลรายวิชาและรหัสนักศึกษา';
  } catch(error){$('#ocr-progress').textContent=error.message;notice(error.message,true);}
  finally{reading=false;lockReview(false);$('#cancel-ocr').hidden=true;}
});
$('#cancel-ocr').addEventListener('click',()=>readController?.abort());

function renderResults(record) {
  // Support both new student transfer evaluation record and legacy checks format
  const isStudentRecord=Boolean(record.studentId || (record.results && record.results.studentId));
  const data=record.results && record.results.studentId ? record.results : record;
  
  $('#result-meta').textContent=`รหัส ${data.studentId} · ${data.studentName || 'นักศึกษาเทียบโอน'} · หลักสูตร พ.ศ. ${data.curriculumYear || data.year} (${data.curriculumName || data.curriculum_name}) · ${formatDate(data.created_at || record.created_at)}`;
  
  function chip(label, strongVal, suffix = '') {
    const c = el('div', 'stat-chip');
    c.append(document.createTextNode(label + ' '), el('strong', '', String(strongVal)), document.createTextNode(suffix ? ' ' + suffix : ''));
    return c;
  }
  
  const metaChips=$('#student-result-meta-chips');
  metaChips.replaceChildren(
    chip('👤 รหัสนักศึกษา:', data.studentId),
    chip('📝 ชื่อ-นามสกุล:', data.studentName || 'นักศึกษาเทียบโอน'),
    chip('🎓 หลักสูตร:', `${data.curriculumName || data.curriculum_name} (${data.curriculumYear || data.year})`),
    chip('📚 รวมตามหลักสูตร:', `${data.totalCurriculumCredits || 131} หน่วยกิต`)
  );
  
  const transCredits=data.verifiedTransferredCredits ?? data.totalTransferredCredits ?? 42;
  const remCredits=data.remainingCredits ?? Math.max(0, (data.totalCurriculumCredits || 131) - transCredits);
  
  const countsContainer=$('#result-counts');
  countsContainer.replaceChildren(
    el('span','status eligible',`🟢 เทียบโอนได้: ${transCredits} หน่วยกิต`),
    el('span','status unknown',`🔵 จะต้องเรียนอีก: ${remCredits} หน่วยกิต`),
    el('span','status eligible',`📋 วิชาที่เทียบได้: ${Array.isArray(data.courses)?data.courses.filter(c=>c.passed || c.status==='eligible').length:0} วิชา`)
  );
  
  const tableContainer=$('#student-result-table-container');
  tableContainer.replaceChildren();
  
  if(Array.isArray(data.courses) && data.courses.length) {
    const tableEl=el('table','data-table');
    const head=el('thead'),hrow=el('tr');
    ['หมวดวิชา','รายวิชาเดิม (ปวส.)','วิชาเทียบได้ (ป.ตรี)','หน่วยกิต','เกรด','ผลการเทียบโอน'].forEach(title=>{
      const th=el('th','',title);th.scope='col';hrow.append(th);
    });
    head.append(hrow);
    const tbody=el('tbody');
    
    data.courses.forEach(c=>{
      const row=el('tr');
      const groupCell=el('td','',c.group || 'หมวดวิชาศึกษาทั่วไป');
      
      const sourcesText=Array.isArray(c.sources) && c.sources.length
        ? c.sources.map(s=>`${s.code} ${s.name || ''} (${s.credits || 3} นก.${s.actualGrade ? ` [เกรด ${s.actualGrade}]` : (s.grade ? ` [เกรด ${s.grade}]` : '')})`).join('\n+ ')
        : (c.sourceCode ? `${c.sourceCode} ${c.sourceName || ''}` : '-');
      const srcCell=el('td','',sourcesText);
      srcCell.style.whiteSpace='pre-line';
      
      const targetText=`${c.targetCode} · ${c.targetName}`;
      const targetCell=el('td','',targetText);
      const creditsCell=el('td','',`${c.targetCredits} นก.`);
      const gradeCell=el('td','',c.targetGrade || 'TC');
      
      const statusBadge=el('span',`badge-status ${c.passed || c.status==='eligible' ? 'new' : 'unmatched'}`, c.passed || c.status==='eligible' ? 'ผ่าน (เทียบโอนได้)' : 'ไม่พบใน Transcript');
      const statusCell=el('td');statusCell.append(statusBadge);
      
      row.append(groupCell,srcCell,targetCell,creditsCell,gradeCell,statusCell);
      tbody.append(row);
    });
    tableEl.append(head,tbody);
    const scroll=el('div','portal-table-scroll import-table');
    scroll.style.maxHeight='450px';
    scroll.append(tableEl);
    tableContainer.append(scroll);
  }
  
  $('#student-results').hidden=false;
  stage(2);
  $('#student-results h2').focus({preventScroll:true});
  $('#student-results').scrollIntoView({block:'start'});
}

$('#review-form').addEventListener('submit',async event=>{
  event.preventDefault();
  if(checking || reading)return;
  const studentId=$('#student-id-input').value.trim();
  if(!studentId){notice('กรุณาระบุรหัสประจำตัวนักศึกษา เช่น 69242206001-6',true);return;}
  const courses=Array.from($('#review-rows').children,row=>Object.fromEntries(Array.from(row.querySelectorAll('[data-field]'),control=>[control.dataset.field,control.value.trim()])));
  if(!courses.length){notice('กรุณาอัปโหลดใบ Transcript หรือเพิ่มรายวิชาก่อนตรวจสอบ',true);return;}
  if(courses.some(course=>!supportedGrades.includes(course.grade))){notice('พบเกรดที่ไม่รองรับ กรุณาตรวจทานกับ Transcript',true);return;}
  checking=true;lockReview(true);notice('');
  try {
    const result=await api('/api/student/verify-transfer',{studentId,courses});
    renderResults(result);
    notice('ตรวจสอบผลการเทียบโอนเรียบร้อยแล้ว');
  } catch(error){
    notice(error.message,true);
  } finally{
    checking=false;lockReview(false);
  }
});

async function loadHistory() {
  const rows=await api('/api/history');const list=$('#history-list');list.replaceChildren();
  if(!rows.length){list.append(el('p','empty-state','ยังไม่มีประวัติการตรวจสอบ ผลจะถูกบันทึกเมื่อคุณกดตรวจสอบผลการเทียบโอน'));return;}
  for(const record of rows) {
    const row=el('article','history-row'),copy=el('div');copy.append(el('h2','',`หลักสูตร พ.ศ. ${record.year} · ${record.curriculum_name}`),el('p','',formatDate(record.created_at)));
    const button=el('button','table-edit','ดูผล');button.setAttribute('aria-label',`ดูผล ${formatDate(record.created_at)}`);button.addEventListener('click',()=>busy(button,async()=>{const detail=await api(`/api/history/${record.id}`);showView('check');renderResults(detail);}));row.append(copy,button);list.append(row);
  }
}
document.querySelector('[data-nav=history]').addEventListener('click',()=>loadHistory().catch(error=>notice(error.message,true)));
$('#refresh-history').addEventListener('click',event=>busy(event.currentTarget,loadHistory));
$('#print-results').addEventListener('click',()=>window.print());
window.addEventListener('pagehide',()=>{readController?.abort();if(originalFileUrl)URL.revokeObjectURL(originalFileUrl);});

try {
  const user = await boot('student');
  if (user && user.studentId && $('#student-id-input')) {
    $('#student-id-input').value = user.studentId;
  }
} catch(error){notice(error.message,true);}


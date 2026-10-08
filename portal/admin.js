import {$,el,api,boot,busy,notice,options,showView} from './shared.js';
import {readWorkbook,downloadTemplate,readStudentTransferWorkbook,readExcelMappingWorkbook} from './excel.js';
import {readPdfMappings} from './pdf-mapping.js';

let catalog={curricula:[],courses:[],mappings:[]};
let studentTransfers=[];
let pendingStudentTransfer=null;
let importData=null;
let pdfMappingData=null;
let excelMappingData=null;
let pdfAbort=null;
let editing=null;
let deleting=null;
let clearing=null;
const labels={curricula:'หลักสูตร',courses:'รายวิชา',mappings:'คู่เทียบรายวิชา'};
const descriptions={curricula:'เพิ่มและแก้ไขหลักสูตรเทคโนโลยีสารสนเทศ แยกตามปี พ.ศ.',courses:'รายวิชาและหน่วยกิตที่อยู่ในแต่ละปีหลักสูตร',mappings:'จับคู่รหัสวิชาต้นทางกับรายวิชาในหลักสูตร โดยอ้างอิงปีหลักสูตร'};

function table(headers,rows) {
  const table=el('table','data-table');
  const head=el('thead'),header=el('tr');
  headers.forEach(title=>{const cell=el('th','',title);cell.scope='col';header.append(cell);});head.append(header);
  const body=el('tbody');
  rows.forEach(cells=>{const row=el('tr');cells.forEach(content=>{const cell=el('td');if(content instanceof Node)cell.append(content);else cell.textContent=String(content);row.append(cell);});body.append(row);});
  table.append(head,body);return table;
}
function buildList(kind) {
  const section=document.querySelector(`[data-view="${kind}"]`);
  const heading=el('div','page-heading'),copy=el('div');
  copy.append(el('span','section-label','CURRICULUM MANAGEMENT'),el('h1','',`จัดการ${labels[kind]}`),el('p','',descriptions[kind]));
  const actions=el('div','table-btn-group');
  const add=el('button','button primary',`+ เพิ่ม${labels[kind]}`);add.addEventListener('click',()=>openEditor(kind));actions.append(add);
  if(kind==='mappings'){
    const importExcelBtn=el('button','button secondary','📊 นำเข้าคู่เทียบจาก Excel');
    importExcelBtn.addEventListener('click',openExcelMappingDialog);
    const importPdfBtn=el('button','button secondary','↥ นำเข้าคู่เทียบจาก PDF');
    importPdfBtn.addEventListener('click',openPdfMappingDialog);
    actions.append(importExcelBtn,importPdfBtn);
  }
  const clearBtn=el('button','button secondary-danger','🗑️ ลบทั้งหมด');
  clearBtn.addEventListener('click',()=>openClearDialog(kind));
  actions.append(clearBtn);
  heading.append(copy,actions);
  const filters=el('div','filter-bar');
  const filterLabel=el('label','field','ปีหลักสูตร');
  const select=el('select');select.id=`${kind}-year`;select.addEventListener('change',()=>renderList(kind));filterLabel.append(select);
  const searchLabel=el('label','field','ค้นหาข้อมูล'),search=el('input');search.type='search';search.placeholder='ค้นหารหัสวิชา ชื่อ หรือปีหลักสูตร';search.id=`${kind}-search`;search.addEventListener('input',()=>renderList(kind));searchLabel.append(search);
  filters.append(filterLabel,searchLabel);
  const list=el('div','surface table-surface');list.id=`${kind}-list`;
  const banner=el('div','info-banner');banner.append(el('strong','',kind==='mappings'?'ไม่พบคู่เทียบ? เพิ่มข้อมูลให้นักศึกษาตรวจสอบอีกครั้ง':'ข้อมูลนี้ใช้ร่วมกันในการตรวจสอบรายวิชา'),el('p','','ใช้เฉพาะหลักสูตรเทคโนโลยีสารสนเทศ ผลการตรวจสอบไม่ใช่การอนุมัติอย่างเป็นทางการ'));
  section.append(heading,filters,list,banner);
}
function renderList(kind) {
  const year=$(`#${kind}-year`).value;
  const search=$(`#${kind}-search`).value.trim().toLowerCase();
  const rows=catalog[kind].filter(row=>(!year || String(kind==='curricula'?row.id:row.curriculum_id)===year) && Object.values(row).some(value=>String(value).toLowerCase().includes(search)));
  const container=$(`#${kind}-list`);container.replaceChildren();
  if(!rows.length) {container.append(el('p','empty-state',catalog[kind].length?'ไม่พบข้อมูลที่ตรงกับการค้นหา':`ยังไม่มี${labels[kind]} เริ่มต้นด้วยปุ่มเพิ่มด้านบน หรือนำเข้าจาก Excel`));return;}
  const headers=kind==='curricula'?['ปีหลักสูตร','ชื่อหลักสูตร IT','จัดการ']:kind==='courses'?['รหัสวิชา','ชื่อรายวิชา','หน่วยกิต','ปีหลักสูตร','จัดการ']:['รหัสวิชาต้นทาง','รายวิชาในหลักสูตร','ปีหลักสูตร','จัดการ'];
  const cells=rows.map(row=>{
    const edit=el('button','table-edit','แก้ไข');edit.setAttribute('aria-label',`แก้ไข ${row.source_code || row.code || row.year}`);edit.addEventListener('click',()=>openEditor(kind,row));
    const remove=el('button','table-edit table-delete','ลบ');remove.setAttribute('aria-label',`ลบ ${row.source_code || row.code || row.year}`);remove.addEventListener('click',()=>openDelete(kind,row));
    const actions=el('div','record-actions');actions.append(edit,remove);
    return kind==='curricula'?[row.year,row.name,actions]:kind==='courses'?[row.code,row.name,row.credits,row.year,actions]:[row.source_code,`${row.target_code} · ${row.target_name}`,row.year,actions];
  });
  const scroll=el('div','portal-table-scroll');scroll.append(table(headers,cells));container.append(scroll);
}
function openDelete(kind,row) {
  deleting={kind,id:row.id,studentId:row.student_id};
  $('#delete-title').textContent=kind==='student_transfers'?'ลบผลเทียบโอนรายบุคคล':`ลบ${labels[kind]}`;
  $('#delete-description').textContent=kind==='curricula'?`พ.ศ. ${row.year} · ${row.name}`:kind==='courses'?`${row.code} · ${row.name} · พ.ศ. ${row.year}`:kind==='student_transfers'?`${row.student_id} · ${row.student_name}`:`${row.source_code} → ${row.target_code} · ${row.target_name} · พ.ศ. ${row.year}`;
  $('#delete-error').textContent='';
  $('#delete-warning').textContent=kind==='curricula'?'ลบได้เมื่อไม่มีรายวิชาและคู่เทียบในหลักสูตรนี้':kind==='courses'?'ลบได้เมื่อไม่มีคู่เทียบที่อ้างอิงรายวิชานี้':kind==='student_transfers'?'หลังลบ นักศึกษารหัสนี้จะไม่สามารถตรวจสอบผลเทียบโอนทางการได้':'หลังลบ รหัสวิชานี้จะไม่พบคู่เทียบในการตรวจสอบครั้งใหม่';
  $('#delete-dialog').showModal();
}
$('#delete-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const button=$('#confirm-delete');button.disabled=true;$('#delete-error').textContent='';
  try {
    if(deleting.kind==='student_transfers') {
      await api('/api/admin/student-transfers/delete',{studentId:deleting.studentId || deleting.id});
    } else {
      await api(`/api/admin/${deleting.kind}/delete`,{id:deleting.id});
    }
    invalidateImport();
    await refresh();$('#delete-dialog').close();notice('ลบข้อมูลเรียบร้อยแล้ว');
  } catch(error){$('#delete-error').textContent=error.message;} finally {button.disabled=false;}
});
$('#close-delete').addEventListener('click',()=>$('#delete-dialog').close());
$('#cancel-delete').addEventListener('click',()=>$('#delete-dialog').close());

function openClearDialog(kind) {
  const yearFilter=$(`#${kind}-year`)?$(`#${kind}-year`).value:'';
  const rows=kind==='student_transfers'?studentTransfers:(catalog[kind] || []);
  if(!rows.length) {
    notice(`ไม่มีข้อมูล${labels[kind] || 'เทียบโอน'}ให้ลบ`,true);
    return;
  }
  clearing={kind,yearFilter};
  $('#clear-title').textContent=`ลบ${labels[kind] || 'ผลเทียบโอนรายบุคคล'}ทั้งหมด`;
  $('#clear-description').textContent=`คุณกำลังจะลบข้อมูล${labels[kind] || 'ผลเทียบโอนรายบุคคล'}ออกจากระบบ`;
  $('#clear-error').textContent='';
  $('#confirm-clear').checked=false;

  const select=$('#clear-scope-select');
  select.replaceChildren();

  if(kind==='student_transfers') {
    const totalCount=studentTransfers.length;
    const optAll=el('option','',`ลบข้อมูลนักศึกษาทั้งหมด (${totalCount} คน)`);
    optAll.value='all';
    select.append(optAll);
  } else {
    const totalCount=catalog[kind].length;
    const yearValues=[];
    catalog[kind].forEach(r=>{
      const y=String(kind==='curricula'?r.year:(r.year || ''));
      if(y && !yearValues.includes(y)) yearValues.push(y);
    });

    if(yearFilter && yearValues.includes(yearFilter)) {
      const yearCount=catalog[kind].filter(r=>String(kind==='curricula'?r.id:r.curriculum_id)===yearFilter || String(r.year)===yearFilter).length;
      const currObj=catalog.curricula.find(c=>String(c.id)===yearFilter || String(c.year)===yearFilter);
      const yearDisplay=currObj?`หลักสูตร พ.ศ. ${currObj.year}`:`ปีหลักสูตร ${yearFilter}`;
      const optYear=el('option','',`เฉพาะ ${yearDisplay} (จำนวน ${yearCount} รายการ)`);
      optYear.value=currObj?currObj.year:yearFilter;
      select.append(optYear);
    }

    const optAll=el('option','',`ลบทุกปีหลักสูตรทั้งหมด (จำนวน ${totalCount} รายการ)`);
    optAll.value='all';
    select.append(optAll);
  }

  $('#clear-dialog').showModal();
}
$('#close-clear').addEventListener('click',()=>$('#clear-dialog').close());
$('#cancel-clear').addEventListener('click',()=>$('#clear-dialog').close());

$('#clear-form').addEventListener('submit',async event=>{
  event.preventDefault();
  if(!$('#confirm-clear').checked) {
    $('#clear-error').textContent='กรุณาทำเครื่องหมายยืนยันการลบ';
    return;
  }
  const button=$('#confirm-clear-btn');
  button.disabled=true;
  $('#clear-error').textContent='';
  const selectedScope=$('#clear-scope-select').value;
  const payload=selectedScope && selectedScope!=='all'?{year:selectedScope}:{};

  try {
    const endpoint=clearing.kind==='student_transfers'
      ?'/api/admin/student-transfers/clear'
      :`/api/admin/${clearing.kind}/clear`;
    const res=await api(endpoint,payload);
    invalidateImport();
    await refresh();
    $('#clear-dialog').close();
    notice(`ลบข้อมูลทั้งหมดเรียบร้อยแล้ว (ลบ ${res.deleted || 0} รายการ)`);
  } catch(error) {
    $('#clear-error').textContent=error.message;
  } finally {
    button.disabled=false;
  }
});
$('#clear-student-transfers')?.addEventListener('click',()=>openClearDialog('student_transfers'));

function renderStudentTransfersList() {
  const container=$('#student-transfers-table-container');
  if(!container) return;
  container.replaceChildren();
  if(!studentTransfers.length) {
    container.append(el('p','empty-state','ยังไม่มีข้อมูลเทียบโอนรายบุคคล กรุณาอัปโหลดไฟล์ Excel แบบสรุปเทียบโอนด้านบน'));
    return;
  }
  const headers=['รหัสประจำตัว','ชื่อ-นามสกุล','ปีหลักสูตร','เทียบได้ (นก.)','ต้องเรียนเพิ่ม (นก.)','ข้อมูลเข้าสู่ระบบ','จัดการ'];
  const rows=studentTransfers.map(st=>{
    const viewBtn=el('button','table-edit','ดูรายละเอียด');
    viewBtn.addEventListener('click',()=>openStudentDetail(st.student_id));
    const deleteBtn=el('button','table-edit table-delete','ลบ');
    deleteBtn.addEventListener('click',()=>openDelete('student_transfers',st));
    const actions=el('div','record-actions');
    actions.append(viewBtn,deleteBtn);
    const loginBadge=el('span','badge-status new',`User/Pass: ${st.student_id}`);
    return [
      st.student_id,
      st.student_name,
      `${st.curriculum_year} (${st.curriculum_name})`,
      `${st.total_transferred_credits} นก.`,
      `${st.remaining_credits} นก.`,
      loginBadge,
      actions
    ];
  });
  const scroll=el('div','portal-table-scroll');
  scroll.append(table(headers,rows));
  container.append(scroll);
}

async function openStudentDetail(studentId) {
  try {
    const record=await api(`/api/admin/student-transfers/${encodeURIComponent(studentId)}`);
    $('#student-detail-title').textContent=`ผลเทียบโอน: ${record.studentName} (${record.studentId})`;
    
    function chip(label, strongVal, suffix = '') {
      const c = el('div', 'stat-chip');
      c.append(document.createTextNode(label + ' '), el('strong', '', String(strongVal)), document.createTextNode(suffix ? ' ' + suffix : ''));
      return c;
    }
    
    const metaCard=$('#student-detail-meta');
    metaCard.replaceChildren(
      chip('👤 รหัส นศ.:', record.studentId),
      chip('📝 ชื่อ-สกุล:', record.studentName),
      chip('🔑 รหัสเข้าสู่ระบบ:', `User/Pass: ${record.studentId}`),
      chip('🎓 หลักสูตร:', `${record.curriculumName} (${record.curriculumYear})`),
      chip('📚 รวมหลักสูตร:', record.totalCurriculumCredits, 'นก.'),
      chip('🟢 เทียบโอนได้:', record.totalTransferredCredits, 'นก.'),
      chip('🔵 ต้องเรียนอีก:', record.remainingCredits, 'นก.')
    );
    
    const tableContainer=$('#student-detail-table-container');
    tableContainer.replaceChildren();
    
    const headers=['หมวดวิชา','รายวิชาเดิม (ปวส.)','วิชาเทียบได้ (ป.ตรี)','หน่วยกิต','เกรด','ผล'];
    const rows=record.courses.map(c=>{
      const sourcesText=c.sources.map(s=>`${s.code} ${s.name} (${s.credits} นก. เกรด ${s.grade || '-'})`).join('\n+ ');
      return [
        c.group,
        sourcesText || '-',
        `${c.targetCode} ${c.targetName}`,
        `${c.targetCredits} นก.`,
        c.targetGrade || 'TC',
        el('span',`badge-status ${c.passed ? 'new' : 'unmatched'}`, c.passed ? 'ผ่าน (TC)' : 'ไม่ผ่าน')
      ];
    });
    
    const scroll=el('div','portal-table-scroll');
    scroll.style.maxHeight='380px';
    scroll.append(table(headers,rows));
    tableContainer.append(scroll);
    
    $('#student-detail-dialog').showModal();
  } catch(error) {
    notice(error.message, true);
  }
}

$('#close-student-detail').addEventListener('click',()=>$('#student-detail-dialog').close());
$('#close-student-detail-btn').addEventListener('click',()=>$('#student-detail-dialog').close());
$('#refresh-student-transfers').addEventListener('click',()=>refresh());

async function refresh() {
  catalog=await api('/api/admin/catalog');
  try {
    studentTransfers=await api('/api/admin/student-transfers');
  } catch(_) {
    studentTransfers=[];
  }
  $('#overview-counts').replaceChildren();
  for(const kind of Object.keys(labels)) {
    const card=el('div','count-card');card.append(el('strong','',catalog[kind].length),el('span','',labels[kind]));$('#overview-counts').append(card);
    options($(`#${kind}-year`),catalog.curricula,row=>`พ.ศ. ${row.year} · ${row.name}`,'ทุกปีหลักสูตร');
    renderList(kind);
  }
  const stCard=el('div','count-card');
  stCard.append(el('strong','',studentTransfers.length),el('span','','ผลเทียบโอนรายบุคคล'));
  $('#overview-counts').append(stCard);
  renderStudentTransfersList();
}
function field(name,title,value,type='text') {
  const label=el('label','field',title);
  const input=el('input');input.name=name;input.type=type;input.value=value ?? '';input.required=true;
  input.maxLength=name==='code' || name==='sourceCode'?30:180;
  if(type==='number'){input.min=name==='year'?'2400':'0.5';input.max=name==='year'?'2800':'30';input.step=name==='year'?'1':'0.5';}
  label.append(input);return label;
}
function openEditor(kind,row) {
  if(kind!=='curricula' && !catalog.curricula.length) {notice('กรุณาเพิ่มหลักสูตรก่อน',true);return;}
  if(kind==='mappings' && !catalog.courses.length) {notice('กรุณาเพิ่มรายวิชาในหลักสูตรก่อนกำหนดคู่เทียบ',true);return;}
  editing={kind,id:row?.id};
  $('#edit-title').textContent=`${row?'แก้ไข':'เพิ่ม'}${labels[kind]}`;
  $('#edit-error').textContent='';
  const fields=$('#edit-fields');fields.replaceChildren();
  if(kind==='curricula') {
    fields.append(field('year','ปีหลักสูตร (พ.ศ.)',row?.year,'number'),field('name','ชื่อหลักสูตรเทคโนโลยีสารสนเทศ',row?.name || 'เทคโนโลยีสารสนเทศ'));
    if(row) fields.querySelector('[name=year]').readOnly=true;
  } else {
    const label=el('label','field','ปีหลักสูตร IT'),select=el('select');select.name='curriculumId';select.required=true;
    options(select,catalog.curricula,c=>`พ.ศ. ${c.year} · ${c.name}`);
    select.value=String(row?.curriculum_id || $(`#${kind}-year`).value || catalog.curricula[0].id);
    if(row && kind==='courses') select.disabled=true;
    label.append(select);fields.append(label);
    if(kind==='courses') fields.append(field('code','รหัสวิชา',row?.code),field('name','ชื่อรายวิชา',row?.name),field('credits','หน่วยกิต',row?.credits ?? 3,'number'));
    else {
      fields.append(field('sourceCode','รหัสวิชาต้นทางจาก Transcript',row?.source_code));
      const targetLabel=el('label','field','รายวิชาปลายทางในหลักสูตร'),target=el('select');target.name='targetCourseId';target.required=true;
      function updateTargets(){options(target,catalog.courses.filter(c=>String(c.curriculum_id)===select.value),c=>`${c.code} · ${c.name}`,'เลือกรายวิชาปลายทาง');}
      select.addEventListener('change',updateTargets);updateTargets();
      if(row) target.value=String(row.target_course_id);
      targetLabel.append(target);fields.append(targetLabel);
    }
  }
  $('#edit-dialog').showModal();
}
$('#edit-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const button=$('#save-record');button.disabled=true;$('#edit-error').textContent='';
  try {
    const data=Object.fromEntries(new FormData(event.target));
    const select=event.target.querySelector('[name=curriculumId]');if(select)data.curriculumId=select.value;
    if(editing.id)data.id=editing.id;
    await api(`/api/admin/${editing.kind}`,data);
    invalidateImport();
    await refresh();$('#edit-dialog').close();notice('บันทึกข้อมูลเรียบร้อยแล้ว');
  } catch(error){$('#edit-error').textContent=error.message;} finally{button.disabled=false;}
});
$('#close-edit').addEventListener('click',()=>$('#edit-dialog').close());
$('#cancel-edit').addEventListener('click',()=>$('#edit-dialog').close());
$('#start-curricula').addEventListener('click',()=>showView('curricula'));

function invalidateImport(){importData=null;}

$('#student-transfer-file').addEventListener('change',()=>{
  $('#student-transfer-preview').hidden=true;
  $('#confirm-student-transfer').checked=false;
  $('#student-transfer-progress').textContent='';
  pendingStudentTransfer=null;
});

$('#preview-student-transfer').addEventListener('click',event=>busy(event.currentTarget,async()=>{
  const fileInput=$('#student-transfer-file');
  const file=fileInput.files[0];
  if(!file){$('#student-transfer-progress').textContent='กรุณาเลือกไฟล์ Excel (.xlsx) ก่อน';return;}
  $('#student-transfer-progress').textContent='กำลังอ่านและประมวลผลไฟล์ Excel...';
  $('#student-transfer-preview').hidden=true;
  $('#confirm-student-transfer').checked=false;
  
  try {
    const parsed=await readStudentTransferWorkbook(file);
    if(!parsed.students || !parsed.students.length) throw Error('ไม่พบข้อมูลแบบสรุปเทียบโอนในไฟล์');
    const studentData=parsed.students[0];
    pendingStudentTransfer=studentData;
    
    $('#student-transfer-progress').textContent=`อ่านไฟล์สำเร็จ! พบข้อมูลนักศึกษา ${studentData.studentName} (${studentData.studentId}) จำนวน ${studentData.courses.length} รายวิชา`;
    
    function chip(label, strongVal, suffix = '') {
      const c = el('div', 'stat-chip');
      c.append(document.createTextNode(label + ' '), el('strong', '', String(strongVal)), document.createTextNode(suffix ? ' ' + suffix : ''));
      return c;
    }
    
    const metaContainer=$('#student-transfer-meta-card');
    metaContainer.replaceChildren(
      chip('👤 รหัส นศ.:', studentData.studentId),
      chip('📝 ชื่อ-สกุล:', studentData.studentName),
      chip('🎓 หลักสูตร:', `${studentData.curriculumName} (${studentData.curriculumYear})`),
      chip('📚 รวมตามหลักสูตร:', studentData.totalCurriculumCredits, 'นก.'),
      chip('🟢 เทียบโอนได้:', studentData.totalTransferredCredits, 'นก.'),
      chip('🔵 จะต้องเรียนอีก:', studentData.remainingCredits, 'นก.')
    );
    
    const previewContainer=$('#student-transfer-courses-preview');
    previewContainer.replaceChildren();
    
    const headers=['หมวดวิชา','รายวิชาเดิม (ปวส.)','วิชาเทียบได้ (ป.ตรี)','หน่วยกิต','เกรด','ผลการพิจารณา'];
    const rows=studentData.courses.map(c=>{
      const sourcesText=c.sources.map(s=>`${s.code} ${s.name} (${s.credits} นก. เกรด ${s.grade || '-'})`).join('\n+ ');
      return [
        c.group,
        sourcesText || '-',
        `${c.targetCode} ${c.targetName}`,
        `${c.targetCredits} นก.`,
        c.targetGrade || 'TC',
        el('span',`badge-status ${c.passed ? 'new' : 'unmatched'}`, c.passed ? 'ผ่าน (TC)' : 'ไม่ผ่าน')
      ];
    });
    
    const scroll=el('div','portal-table-scroll import-table');
    scroll.style.maxHeight='340px';
    scroll.append(table(headers,rows));
    previewContainer.append(scroll);
    
    $('#student-transfer-preview').hidden=false;
    notice('อ่านข้อมูลสำเร็จ กรุณาตรวจสอบความถูกต้องก่อนยืนยันบันทึก');
  } catch(error){
    $('#student-transfer-progress').textContent=`เกิดข้อผิดพลาด: ${error.message}`;
    notice(error.message,true);
  }
}));

$('#commit-student-transfer').addEventListener('click',event=>busy(event.currentTarget,async()=>{
  if(!pendingStudentTransfer || !$('#confirm-student-transfer').checked) {
    throw Error('กรุณาตรวจสอบข้อมูลและทำเครื่องหมายยืนยันความถูกต้อง');
  }
  await api('/api/admin/student-transfers/save', pendingStudentTransfer);
  pendingStudentTransfer=null;
  $('#student-transfer-preview').hidden=true;
  $('#student-transfer-file').value='';
  $('#student-transfer-progress').textContent='';
  await refresh();
  notice('บันทึกผลการเทียบโอนรายบุคคลเรียบร้อยแล้ว');
}));


function openExcelMappingDialog() {
  if(!catalog.curricula.length){notice('กรุณาเพิ่มหลักสูตรก่อน',true);return;}
  if(!catalog.courses.length){notice('กรุณาเพิ่มรายวิชาในหลักสูตรก่อนกำหนดคู่เทียบ',true);return;}
  const select=$('#excel-mapping-import-curriculum');
  options(select,catalog.curricula,c=>`พ.ศ. ${c.year} · ${c.name}`);
  if($('#mappings-year').value) select.value=$('#mappings-year').value;
  $('#excel-mapping-file').value='';
  $('#excel-mapping-import-progress').textContent='';
  $('#excel-mapping-preview-section').hidden=true;
  $('#confirm-excel-mapping-import').checked=false;
  $('#start-excel-mapping-import').disabled=false;
  excelMappingData=null;
  $('#excel-mapping-dialog').showModal();
}
$('#close-excel-mapping-dialog').addEventListener('click',()=>$('#excel-mapping-dialog').close());
$('#cancel-excel-mapping-dialog-btn').addEventListener('click',()=>$('#excel-mapping-dialog').close());

$('#start-excel-mapping-import').addEventListener('click',async()=>{
  const fileInput=$('#excel-mapping-file');
  const file=fileInput.files[0];
  if(!file){$('#excel-mapping-import-progress').textContent='กรุณาเลือกไฟล์ Excel ตารางเทียบโอน';return;}
  const targetCurriculumId=$('#excel-mapping-import-curriculum').value;
  const selectedCurriculum=catalog.curricula.find(c=>String(c.id)===String(targetCurriculumId));
  if(!selectedCurriculum){$('#excel-mapping-import-progress').textContent='กรุณาเลือกหลักสูตรเป้าหมาย';return;}

  $('#start-excel-mapping-import').disabled=true;
  $('#excel-mapping-preview-section').hidden=true;
  $('#confirm-excel-mapping-import').checked=false;
  $('#excel-mapping-import-progress').textContent='กำลังอ่านและวิเคราะห์โครงสร้างตารางคู่เทียบ Excel...';

  try {
    const data=await readExcelMappingWorkbook(file,{year:selectedCurriculum.year});
    if(!data || !data.mappings || !data.mappings.length) {
      $('#excel-mapping-import-progress').textContent='อ่านไฟล์ Excel สำเร็จ แต่ไม่พบคู่เทียบรายวิชา กรุณาตรวจสอบหัวตารางและรหัสวิชา';
      return;
    }

    const matchedData=(globalThis.ExcelMappingParser?.matchMappingsWithCatalog || globalThis.PdfMappingParser.matchMappingsWithCatalog)(data.mappings,selectedCurriculum.year,catalog);
    excelMappingData={curriculum:selectedCurriculum,matchedData,rawResult:data};

    $('#excel-mapping-import-progress').textContent=`อ่านชีต "${data.sheetName || 'ข้อมูล'}" สำเร็จ! พบทั้งหมด ${matchedData.totalExtracted} รายการ`;

    function chip(label,strongVal,suffix='') {
      const c=el('div','stat-chip');
      c.append(document.createTextNode(label+' '),el('strong','',String(strongVal)),document.createTextNode(suffix?' '+suffix:''));
      return c;
    }

    const stats=$('#excel-mapping-stats');
    const createdCoursesCount=matchedData.coursesToCreate.length;
    stats.replaceChildren(
      chip('📋 ทั้งหมด:',matchedData.totalExtracted,'รายการ'),
      chip('🟢 พร้อมนำเข้า:',matchedData.valid.length,`(สร้างวิชาใหม่ ${createdCoursesCount}, คู่เทียบ ${matchedData.valid.length})`),
      chip('⚠️ ตัดรายการซ้ำ:',matchedData.duplicateCount,'รายการ')
    );

    $('#excel-mapping-summary-note').textContent=`จับคู่กับหลักสูตร พ.ศ. ${selectedCurriculum.year} (${selectedCurriculum.name}) · แยกกลุ่มรหัสวิชาตามปีหลักสูตร ปวส. (2567, 2563, 2557) ให้อัตโนมัติ`;

    if(createdCoursesCount>0) {
      const unmatchedNotice=$('#excel-mapping-unmatched-notice');
      unmatchedNotice.hidden=false;
      unmatchedNotice.textContent=`ระบบจะสร้างรายวิชาปลายทางที่ตรวจพบใน Excel เพิ่มเติม ${createdCoursesCount} วิชา เข้าสู่หลักสูตรปี ${selectedCurriculum.year} ให้อัตโนมัติ (เช่น ${matchedData.coursesToCreate.slice(0,4).map(c=>c.code+' '+c.name).join(', ')})`;
    } else {
      $('#excel-mapping-unmatched-notice').hidden=true;
    }

    const tablesContainer=$('#excel-mapping-preview-tables');
    tablesContainer.replaceChildren();

    if(matchedData.valid.length>0) {
      const sec=el('section');
      sec.append(el('h4','',`รายการคู่เทียบที่พร้อมบันทึก (${matchedData.valid.length} รายการ)`));
      const headers=['รหัสวิชาต้นทาง (ปวส.)','ชื่อวิชาต้นทาง','รหัสวิชาปลายทาง (ป.ตรี)','ชื่อวิชาในระบบ IT','สถานะ'];
      const rows=matchedData.valid.map(row=>{
        const badge=el('span',`badge-status ${row.status}`,row.status==='update'?'อัปเดตคู่เทียบเดิม':'เพิ่มคู่เทียบใหม่');
        const condBadge=row.condition==='and'?el('span','badge-status and','ต้องเรียนคู่กัน (และ)'):(row.condition==='or'?el('span','badge-status or','วิชาทางเลือก (หรือ)'):'');
        const statusCell=el('div','record-actions');
        statusCell.append(badge);
        if(condBadge) statusCell.append(condBadge);
        return [row.sourceCode,row.sourceName || '-',row.targetCode,row.targetName,statusCell];
      });
      const scroll=el('div','portal-table-scroll import-table');
      scroll.style.maxHeight='280px';
      scroll.append(table(headers,rows));
      sec.append(scroll);
      tablesContainer.append(sec);
    }
    $('#excel-mapping-preview-section').hidden=false;
  } catch(error) {
    $('#excel-mapping-import-progress').textContent=`เกิดข้อผิดพลาด: ${error.message}`;
  } finally {
    $('#start-excel-mapping-import').disabled=false;
  }
});

$('#commit-excel-mapping-import').addEventListener('click',event=>busy(event.currentTarget,async()=>{
  if(!excelMappingData || !$('#confirm-excel-mapping-import').checked) throw Error('กรุณาตรวจสอบรายการคู่เทียบและทำเครื่องหมายยืนยัน');
  const valid=excelMappingData.matchedData.valid;
  const coursesToCreate=excelMappingData.matchedData.coursesToCreate || [];
  if(!valid.length && !coursesToCreate.length) throw Error('ไม่มีรายการคู่เทียบที่พร้อมบันทึก');
  
  const payload={
    data:{
      curricula:[],
      courses:coursesToCreate,
      mappings:valid.map(m=>({year:m.year,sourceCode:m.sourceCode,targetCode:m.targetCode}))
    },
    dryRun:false
  };
  const result=await api('/api/admin/import',payload);
  excelMappingData=null;
  $('#excel-mapping-dialog').close();
  await refresh();
  notice(`บันทึกคู่เทียบจาก Excel สำเร็จ ${result.total} รายการ (เพิ่มใหม่ ${result.created} อัปเดต ${result.updated})`);
}));

function openPdfMappingDialog() {
  if(!catalog.curricula.length){notice('กรุณาเพิ่มหลักสูตรก่อน',true);return;}
  if(!catalog.courses.length){notice('กรุณาเพิ่มรายวิชาในหลักสูตรก่อนกำหนดคู่เทียบ',true);return;}
  const select=$('#pdf-import-curriculum');
  options(select,catalog.curricula,c=>`พ.ศ. ${c.year} · ${c.name}`);
  if($('#mappings-year').value) select.value=$('#mappings-year').value;
  $('#pdf-mapping-file').value='';
  $('#pdf-import-progress').textContent='';
  $('#pdf-preview-section').hidden=true;
  $('#confirm-pdf-import').checked=false;
  $('#cancel-pdf-import').hidden=true;
  $('#start-pdf-import').disabled=false;
  pdfMappingData=null;
  $('#pdf-mapping-dialog').showModal();
}
$('#close-pdf-dialog').addEventListener('click',()=>{if(pdfAbort)pdfAbort.abort();$('#pdf-mapping-dialog').close();});
$('#cancel-pdf-dialog-btn').addEventListener('click',()=>{if(pdfAbort)pdfAbort.abort();$('#pdf-mapping-dialog').close();});
$('#cancel-pdf-import').addEventListener('click',()=>{if(pdfAbort)pdfAbort.abort();});

$('#start-pdf-import').addEventListener('click',async()=>{
  const fileInput=$('#pdf-mapping-file');
  const file=fileInput.files[0];
  if(!file){$('#pdf-import-progress').textContent='กรุณาเลือกไฟล์ PDF ตารางเทียบโอน';return;}
  const targetCurriculumId=$('#pdf-import-curriculum').value;
  const selectedCurriculum=catalog.curricula.find(c=>String(c.id)===String(targetCurriculumId));
  if(!selectedCurriculum){$('#pdf-import-progress').textContent='กรุณาเลือกหลักสูตรเป้าหมาย';return;}

  pdfAbort=new AbortController();
  $('#start-pdf-import').disabled=true;
  $('#cancel-pdf-import').hidden=false;
  $('#pdf-preview-section').hidden=true;
  $('#confirm-pdf-import').checked=false;

  try {
    const {mappings,numPages}=await readPdfMappings(file,text=>{$('#pdf-import-progress').textContent=text;},pdfAbort.signal);
    if(!mappings.length){$('#pdf-import-progress').textContent=`อ่านเอกสาร ${numPages} หน้าเสร็จสิ้น แต่ไม่พบคู่เทียบรายวิชา กรุณาตรวจสอบไฟล์`;return;}

    const matchedData=globalThis.PdfMappingParser.matchMappingsWithCatalog(mappings,selectedCurriculum.year,catalog);
    pdfMappingData={curriculum:selectedCurriculum,matchedData};

    $('#pdf-import-progress').textContent=`อ่านเอกสาร ${numPages} หน้าสำเร็จ! พบทั้งหมด ${matchedData.totalExtracted} รายการ`;

    function chip(label, strongVal, suffix = '') {
      const c = el('div', 'stat-chip');
      c.append(document.createTextNode(label + ' '), el('strong', '', String(strongVal)), document.createTextNode(suffix ? ' ' + suffix : ''));
      return c;
    }

    const stats = $('#pdf-stats');
    const createdCoursesCount = matchedData.coursesToCreate.length;
    stats.replaceChildren(
      chip('📋 ทั้งหมด:', matchedData.totalExtracted, 'รายการ'),
      chip('🟢 พร้อมนำเข้า:', matchedData.valid.length, `(สร้างวิชาใหม่ ${createdCoursesCount}, คู่เทียบ ${matchedData.valid.length})`),
      chip('⚠️ ตัดรายการซ้ำ:', matchedData.duplicateCount, 'รายการ')
    );

    $('#pdf-summary-note').textContent = `จับคู่กับหลักสูตร พ.ศ. ${selectedCurriculum.year} (${selectedCurriculum.name}) · รายการที่มีคำว่า "หรือ" ถูกแยกสร้างเป็นคู่เทียบให้อัตโนมัติ`;

    if (createdCoursesCount > 0) {
      const unmatchedNotice = $('#pdf-unmatched-notice');
      unmatchedNotice.hidden = false;
      unmatchedNotice.textContent = `ระบบจะสร้างรายวิชาปลายทางที่ตรวจพบใน PDF เพิ่มเติม ${createdCoursesCount} วิชา เข้าสู่หลักสูตรปี ${selectedCurriculum.year} ให้อัตโนมัติ (เช่น ${matchedData.coursesToCreate.slice(0, 4).map(c => c.code + ' ' + c.name).join(', ')})`;
    } else {
      $('#pdf-unmatched-notice').hidden = true;
    }

    const tablesContainer = $('#pdf-preview-tables');
    tablesContainer.replaceChildren();

    if (matchedData.valid.length > 0) {
      const sec = el('section');
      sec.append(el('h4', '', `รายการคู่เทียบที่พร้อมบันทึก (${matchedData.valid.length} รายการ)`));
      const headers = ['รหัสวิชาต้นทาง (ปวส.)', 'ชื่อวิชาต้นทาง', 'รหัสวิชาปลายทาง (ป.ตรี)', 'ชื่อวิชาในระบบ IT', 'สถานะ'];
      const rows = matchedData.valid.map(row => {
        const badge = el('span', `badge-status ${row.status}`, row.status === 'update' ? 'อัปเดตคู่เทียบเดิม' : 'เพิ่มคู่เทียบใหม่');
        const condBadge = row.condition === 'or' ? el('span', 'badge-status or', 'วิชาทางเลือก (หรือ)') : '';
        const statusCell = el('div', 'record-actions');
        statusCell.append(badge);
        if (condBadge) statusCell.append(condBadge);
        return [row.sourceCode, row.sourceName || '-', row.targetCode, row.targetName, statusCell];
      });
      const scroll = el('div', 'portal-table-scroll import-table');
      scroll.style.maxHeight = '280px';
      scroll.append(table(headers, rows));
      sec.append(scroll);
      tablesContainer.append(sec);
    }
    $('#pdf-preview-section').hidden = false;
  } catch(error){
    $('#pdf-import-progress').textContent = `เกิดข้อผิดพลาด: ${error.message}`;
  } finally {
    $('#start-pdf-import').disabled = false;
    $('#cancel-pdf-import').hidden = true;
    pdfAbort = null;
  }
});

$('#commit-pdf-import').addEventListener('click', event => busy(event.currentTarget, async () => {
  if (!pdfMappingData || !$('#confirm-pdf-import').checked) throw Error('กรุณาตรวจสอบรายการคู่เทียบและทำเครื่องหมายยืนยัน');
  const valid = pdfMappingData.matchedData.valid;
  const coursesToCreate = pdfMappingData.matchedData.coursesToCreate || [];
  if (!valid.length && !coursesToCreate.length) throw Error('ไม่มีรายการคู่เทียบที่พร้อมบันทึก');
  
  const payload = {
    data: {
      curricula: [],
      courses: coursesToCreate,
      mappings: valid.map(m => ({ year: m.year, sourceCode: m.sourceCode, targetCode: m.targetCode }))
    },
    dryRun: false
  };
  const result = await api('/api/admin/import', payload);
  pdfMappingData = null;
  $('#pdf-mapping-dialog').close();
  await refresh();
  notice(`บันทึกคู่เทียบสำเร็จ ${result.total} รายการ (เพิ่มใหม่ ${result.created} อัปเดต ${result.updated})`);
}));

try {
  const user=await boot('admin');
  if(user){Object.keys(labels).forEach(buildList);await refresh();}
} catch(error){notice(error.message,true);}

export const $ = selector => document.querySelector(selector);
export function el(tag, className, content) {
  const node=document.createElement(tag);
  if(className) node.className=className;
  if(content!==undefined) node.textContent=content;
  return node;
}
let session=null;
let portalRole=null;
export async function api(path, data) {
  const response=await fetch(path,{method:data===undefined?'GET':'POST',headers:{'X-Portal-Role':portalRole,...(data===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':session?.csrf || ''})},body:data===undefined?undefined:JSON.stringify(data)});
  const body=await response.json();
  if(!response.ok) {
    if(response.status===401 && session?.user) { session=null; location.reload(); }
    throw Error(body.error || 'ไม่สามารถดำเนินการได้');
  }
  return body;
}
export function notice(message,error=false) {
  const box=$('#notice');
  box.textContent=message;
  box.classList.toggle('is-error',error);
  box.hidden=!message;
  if(message) box.scrollIntoView({block:'nearest'});
}
export async function busy(button, action) {
  button.disabled=true;
  const original=button.textContent;
  button.textContent='กำลังดำเนินการ…';
  try { return await action(); } catch(error) { notice(error.message,true); }
  finally { button.disabled=false;button.textContent=original; }
}
export function formatDate(value) { return new Date(value).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'}); }
export function options(select, rows, label, placeholder='เลือกหลักสูตร') {
  const current=select.value;
  select.replaceChildren(new Option(placeholder,''));
  rows.forEach(row=>select.add(new Option(label(row),String(row.id))));
  if(rows.some(row=>String(row.id)===current)) select.value=current;
}
export function showView(name) {
  document.querySelectorAll('[data-view]').forEach(section=>section.hidden=section.dataset.view!==name);
  document.querySelectorAll('[data-nav]').forEach(button=>{button.classList.toggle('active',button.dataset.nav===name);button.setAttribute('aria-current',button.dataset.nav===name?'page':'false');});
  $('#sidebar').classList.remove('mobile-open');
  $('#portal-menu').setAttribute('aria-expanded','false');
  notice('');
}
function renderAuth(role, resolve) {
  const panel=$('#auth-panel');
  panel.hidden=false;
  $('#workspace').hidden=true;
  const setup=role==='admin' && session.needsSetup;
  let mode=setup?'setup':'login';
  function draw() {
    panel.replaceChildren();
    const box=el('section','auth-card');
    box.append(
      el('span','auth-mark','IT'),
      el('h1','',mode==='setup'?'ตั้งค่าผู้ดูแลระบบคนแรก':mode==='register'?'สร้างบัญชีนักศึกษา':role==='admin'?'เข้าสู่ระบบ Admin':'เข้าสู่ระบบนักศึกษา')
    );
    box.append(
      el('p','muted',
        mode==='setup'?'กำหนดบัญชี Admin ของคุณเพื่อเริ่มจัดการข้อมูลหลักสูตร':
        role==='admin'?'เข้าสู่ระบบสำหรับผู้ดูแลข้อมูลหลักสูตร':
        'เข้าสู่ระบบด้วยรหัสประจำตัวนักศึกษาเพื่อตรวจสอบผลการเทียบโอนรายบุคคล'
      )
    );
    const form=el('form','auth-form');
    
    if (role==='student' && mode==='login') {
      const idLabel=el('label','field','รหัสประจำตัวนักศึกษา หรือ อีเมล');
      const idInput=el('input');
      idInput.name='email';
      idInput.type='text';
      idInput.required=true;
      idInput.placeholder='เช่น 69242206001-6';
      idInput.autocomplete='username';
      idLabel.append(idInput);
      
      const passLabel=el('label','field','รหัสผ่าน');
      const passInput=el('input');
      passInput.name='password';
      passInput.type='password';
      passInput.required=true;
      passInput.placeholder='รหัสผ่าน (เริ่มต้นคือรหัสนักศึกษา)';
      passInput.autocomplete='current-password';
      passLabel.append(passInput);
      passLabel.append(el('small','','💡 รหัสผ่านเริ่มต้นคือ "รหัสประจำตัวนักศึกษา" ของคุณ'));
      
      form.append(idLabel,passLabel);
    } else {
      for(const [key,title,type] of [...(mode==='login'?[]:[['name','ชื่อ–นามสกุล','text']]),['email','อีเมล','email'],['password','รหัสผ่าน','password']]) {
        const label=el('label','field',title);
        const input=el('input');input.name=key;input.type=type;input.required=true;input.maxLength=key==='password'?128:key==='name'?100:254;
        input.autocomplete=key==='password'?(mode==='login'?'current-password':'new-password'):key;
        if(key==='password' && mode!=='login') {input.minLength=10;label.append(el('small','','อย่างน้อย 10 ตัวอักษร'));}
        label.append(input);form.append(label);
      }
    }

    const errorBox=el('p','form-error');errorBox.setAttribute('role','alert');form.append(errorBox);
    const submit=el('button','button primary full-width',mode==='setup'?'สร้างบัญชี Admin':mode==='register'?'สมัครสมาชิก':'เข้าสู่ระบบ');submit.type='submit';form.append(submit);
    form.addEventListener('submit',async event=>{
      event.preventDefault();submit.disabled=true;errorBox.textContent='';
      try {
        session=await api(`/api/auth/${mode}`,Object.fromEntries(new FormData(form)));
        if(session.user.role!==role) throw Error('กรุณาใช้บัญชีให้ตรงกับหน้าระบบนี้');
        panel.hidden=true;$('#workspace').hidden=false;resolve(session.user);
      } catch(error) {errorBox.textContent=error.message;}
      finally {submit.disabled=false;}
    });
    box.append(form);
    if(role==='student') {
      const switcher=el('button','text-link auth-switch',mode==='login'?'ต้องการสร้างบัญชีใหม่แบบกำหนดเอง?':'มีบัญชีรหัสนักศึกษาแล้ว? เข้าสู่ระบบ');switcher.type='button';switcher.addEventListener('click',()=>{mode=mode==='login'?'register':'login';draw();});box.append(switcher);
    }
    box.append(el('p','auth-footnote','เฉพาะหลักสูตรเทคโนโลยีสารสนเทศ · เข้าสู่ระบบตามรหัสนักศึกษาที่นำเข้า'));
    panel.append(box);
  }
  draw();
}
export async function boot(role) {
  portalRole=role;
  $('#portal-menu').addEventListener('click',()=>{const open=$('#sidebar').classList.toggle('mobile-open');$('#portal-menu').setAttribute('aria-expanded',String(open));});
  $('#logout').addEventListener('click',()=>busy($('#logout'),async()=>{await api('/api/auth/logout',{});location.reload();}));
  document.querySelectorAll('[data-nav]').forEach(button=>button.addEventListener('click',()=>showView(button.dataset.nav)));
  try {session=await api('/api/session');}
  catch {$('#auth-panel').hidden=false;$('#auth-panel').textContent='เชื่อมต่อระบบไม่ได้ กรุณาเปิดผ่าน Node.js ด้วย npm start และลองรีเฟรชหน้า';throw Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');}
  if(session.user && session.user.role!==role) session={...session,user:null,csrf:null};
  const user=session.user || await new Promise(resolve=>renderAuth(role,resolve));
  $('#auth-panel').hidden=true;$('#workspace').hidden=false;
  $('#user-name').textContent=user.studentId ? `${user.name} (${user.studentId})` : user.name;
  return user;
}

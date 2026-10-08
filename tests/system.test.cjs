const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createStore } = require('../server/store.cjs');
const { createApp } = require('../server/app.cjs');

test('Admin and Student keep separate cookies through login, expiry and logout', async () => {
  const store=createStore(':memory:'),server=createApp(store);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  async function call(path,role,cookie='',data) {
    const response=await fetch(base+path,{method:data?'POST':'GET',headers:{Origin:base,'Content-Type':'application/json','X-Portal-Role':role,Cookie:cookie,...(data?.csrf?{'X-CSRF-Token':data.csrf}:{})},body:data?JSON.stringify(data):undefined});
    return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  try {
    const admin=await call('/api/auth/setup','admin','',{name:'Admin',email:'a@qa.example',password:'test-password-123'});
    const student=await call('/api/auth/register','student',admin.cookie,{name:'Student',email:'s@qa.example',password:'test-password-123'});
    assert.match(admin.cookie,/^it_admin_session=/);
    assert.match(student.cookie,/^it_student_session=/);
    const cookies=admin.cookie+'; '+student.cookie;
    assert.equal((await call('/api/session','admin',cookies)).body.user.role,'admin');
    assert.equal((await call('/api/session','student',cookies)).body.user.role,'student');
    assert.equal((await call('/api/admin/catalog','student',cookies)).status,403);
    const wrong=await call('/api/auth/login','student',cookies,{email:'a@qa.example',password:'test-password-123'});
    assert.equal(wrong.status,403);
    assert.equal(wrong.cookie,undefined);
    assert.equal((await call('/api/session','student',cookies)).body.user.role,'student');
    store.db.prepare('UPDATE sessions SET expires=0 WHERE user_id=?').run(student.body.user.id);
    assert.equal((await call('/api/session','student',cookies)).body.user,null);
    assert.equal((await call('/api/history','student',cookies)).status,401);
    assert.equal((await call('/api/session','admin',cookies)).body.user.role,'admin');
    const renewed=await call('/api/auth/login','student',cookies,{email:'s@qa.example',password:'test-password-123'});
    const both=admin.cookie+'; '+renewed.cookie;
    assert.equal((await call('/api/auth/logout','admin',both,{csrf:admin.body.csrf})).status,200);
    assert.equal((await call('/api/session','admin',both)).body.user,null);
    assert.equal((await call('/api/session','student',both)).body.user.role,'student');
    assert.equal((await call('/api/session','admin',`it_admin_session=${renewed.cookie.split('=')[1]}`)).body.user,null);
  } finally {await new Promise(resolve=>server.close(resolve));store.close();}
});

test('deletion requires removing dependents first and preserves saved student history', () => {
  const store=createStore(':memory:');
  try {
    const curriculum=store.saveCurriculum({year:'2567',name:'IT'});
    const course=store.saveCourse({curriculumId:curriculum.id,code:'IT1',name:'One',credits:3});
    const mapping=store.saveMapping({curriculumId:curriculum.id,sourceCode:'CS1',targetCourseId:course.id});
    store.db.prepare('INSERT INTO users(id,name,email,password_hash,role) VALUES(?,?,?,?,?)').run('test','Student','s@test.example','unused','student');
    const history=store.saveCheck('test',curriculum.id,[{code:'CS1',name:'One',credits:3,grade:'C'}]);
    assert.throws(()=>store.deleteRecord('curricula',curriculum.id),error=>error.status===409);
    assert.throws(()=>store.deleteRecord('courses',course.id),error=>error.status===409);
    assert.equal(store.catalog().mappings.length,1);
    store.deleteRecord('mappings',mapping.id);
    assert.equal(store.check(curriculum.id,[{code:'CS1',name:'One',credits:3,grade:'C'}])[0].status,'unknown');
    store.deleteRecord('courses',course.id);
    store.deleteRecord('curricula',curriculum.id);
    assert.deepEqual(store.catalog(),{curricula:[],courses:[],mappings:[]});
    assert.equal(JSON.parse(store.db.prepare('SELECT results FROM checks WHERE id=?').get(history.id).results)[0].status,'eligible');
    assert.throws(()=>store.deleteRecord('curricula',curriculum.id),error=>error.status===404);
    assert.throws(()=>store.deleteRecord('users','test'));
  } finally {store.close();}
});

test('curricula, courses and mappings survive closing and reopening SQLite', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const directory = fs.mkdtempSync(path.join(__dirname, '.sqlite-test-'));
  const filename = path.join(directory, 'test.sqlite');
  let store;
  try {
    store = createStore(filename);
    const curriculum = store.saveCurriculum({ year: '2565', name: 'IT' });
    const course = store.saveCourse({ curriculumId: curriculum.id, code: 'IT101', name: 'Programming', credits: 3 });
    store.saveMapping({ curriculumId: curriculum.id, sourceCode: 'CS101', targetCourseId: course.id });
    store.close();
    store = createStore(filename);
    assert.equal(store.catalog().mappings.length, 1);
    assert.equal(store.check(curriculum.id, [{ code: 'CS101', name: 'Programming', credits: 3, grade: 'C' }])[0].status, 'eligible');
  } finally {
    store?.close();
    // Only remove this test's explicitly created file and empty directory.
    if (fs.existsSync(filename)) fs.unlinkSync(filename);
    fs.rmdirSync(directory);
  }
});

test('store enforces IT curricula, unique pairs, year isolation and atomic imports', () => {
  const store = createStore(':memory:');
  try {
    const a = store.saveCurriculum({ year: '2565', name: 'เทคโนโลยีสารสนเทศ' });
    const b = store.saveCurriculum({ year: '2567', name: 'เทคโนโลยีสารสนเทศ' });
    const c = store.saveCourse({ curriculumId: a.id, code: 'IT101', name: 'Programming', credits: 3 });
    store.saveMapping({ curriculumId: a.id, sourceCode: 'CS101', targetCourseId: c.id });
    assert.throws(() => store.saveMapping({ curriculumId: b.id, sourceCode: 'CS101', targetCourseId: c.id }));
    assert.throws(() => store.saveCurriculum({ year: '2569', name: 'บัญชี', program: 'ACCOUNTING' }));
    const row = { code: 'CS101', name: 'Programming', credits: 3, grade: 'C' };
    assert.equal(store.check(a.id, [row])[0].status, 'eligible');
    assert.equal(store.check(b.id, [row])[0].status, 'unknown');
    assert.equal(store.check(a.id, [{ ...row, grade: 'D+' }])[0].status, 'ineligible');
    const before = store.catalog();
    assert.throws(() => store.importData({ curricula: [{ year: '2570', name: 'New IT' }], courses: [], mappings: [{ year: '2570', sourceCode: 'A1', targetCode: 'MISSING' }] }, false));
    assert.deepEqual(store.catalog(), before);
    const batch = { curricula: [{ year: '2570', name: 'IT 2570' }], courses: [{ year: '2570', code: 'IT1', name: 'One', credits: 3 }], mappings: [{ year: '2570', sourceCode: 'CS1', targetCode: 'IT1' }] };
    store.importData(batch, true);
    assert.deepEqual(store.catalog(), before, 'preview must never commit');
    store.importData(batch, false);
    assert.equal(store.catalog().curricula.length, 3);
  } finally { store.close(); }
});

test('HTTP requires authentication, role and CSRF; students only see their own history', async () => {
  const store = createStore(':memory:');
  const server = createApp(store);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, { method = 'GET', data, session, origin = base, csrf = true } = {}) {
    const response = await fetch(base + path, { method, headers: {
      ...(session?.body?.user?.role ? { 'X-Portal-Role': session.body.user.role } : {}),
      ...(data ? { 'Content-Type': 'application/json' } : {}),
      ...(method !== 'GET' ? { Origin: origin } : {}),
      ...(session ? { Cookie: session.cookie, ...(csrf ? { 'X-CSRF-Token': session.csrf } : {}) } : {})
    }, body: data ? JSON.stringify(data) : undefined });
    const body = await response.json();
    return { status: response.status, body, cookie: response.headers.get('set-cookie')?.split(';')[0], csrf: body.csrf };
  }
  try {
    assert.equal((await request('/api/admin/catalog')).status, 401);
    const admin = await request('/api/auth/setup', { method: 'POST', data: { name: 'Admin', email: 'admin@example.test', password: 'test-password-123' } });
    assert.equal(admin.status, 201);
    assert.equal((await request('/api/auth/setup', { method: 'POST', data: { name: 'Other', email: 'other@example.test', password: 'test-password-123' } })).status, 409);
    const student = await request('/api/auth/register', { method: 'POST', data: { name: 'Student', email: 'student@example.test', password: 'test-password-123', role: 'admin' } });
    assert.equal(student.body.user.role, 'student');
    assert.equal((await request('/api/admin/catalog', { session: student })).status, 403);
    assert.equal((await request('/api/admin/curricula', { method: 'POST', session: admin, csrf: false, data: { year: '2565', name: 'IT' } })).status, 403);
    assert.equal((await request('/api/admin/curricula', { method: 'POST', session: admin, origin: 'https://evil.example', data: { year: '2565', name: 'IT' } })).status, 403);
    const curriculum = await request('/api/admin/curricula', { method: 'POST', session: admin, data: { year: '2565', name: 'IT' } });
    assert.equal(curriculum.status, 200);
    const removePath='/api/admin/curricula/delete';
    const removable=await request('/api/admin/curricula',{method:'POST',session:admin,data:{year:'2570',name:'IT'}});
    const deletion={id:removable.body.id};
    assert.equal((await request(removePath,{method:'POST',data:deletion})).status,401);
    assert.equal((await request(removePath,{method:'POST',session:student,data:deletion})).status,403);
    assert.equal((await request(removePath,{method:'POST',session:admin,csrf:false,data:deletion})).status,403);
    assert.equal((await request(removePath,{method:'POST',session:admin,data:deletion})).status,200);
    assert.equal((await request(removePath,{method:'POST',session:admin,data:deletion})).status,404);
    assert.equal((await request('/api/check', { method: 'POST', session: student, data: { curriculumId: curriculum.body.id, reviewed: false, courses: [{ code: 'CS1', name: 'One', credits: 3, grade: 'C' }] } })).status, 400);
    const check = await request('/api/check', { method: 'POST', session: student, data: { curriculumId: curriculum.body.id, reviewed: true, courses: [{ code: 'CS1', name: 'One', credits: 3, grade: 'C' }] } });
    assert.equal(check.status, 201);
    assert.equal(check.body.results[0].status, 'unknown');
    const other = await request('/api/auth/register', { method: 'POST', data: { name: 'Second', email: 'second@example.test', password: 'test-password-123' } });
    assert.equal((await request('/api/history', { session: other })).body.length, 0);
    assert.equal((await request(`/api/history/${check.body.id}`, { session: other })).status, 404);
    assert.equal((await request('/api/history', { session: student })).body.length, 1);
    assert.equal((await request('/api/auth/logout', { method: 'POST', session: student, data: {} })).status, 200);
    assert.equal((await request('/api/history', { session: student })).status, 401);
    const denied = await fetch(base + '/data/transfer.sqlite');
    assert.equal(denied.status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); store.close(); }
});

test('Individual Student Transfer system: Admin import and Student verify transfer with transcript courses', async () => {
  const store = createStore(':memory:');
  const server = createApp(store);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function request(path, { method = 'GET', data, session, origin = base } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(session?.body?.user?.role ? { 'X-Portal-Role': session.body.user.role } : {}),
        ...(data ? { 'Content-Type': 'application/json' } : {}),
        ...(method !== 'GET' ? { Origin: origin } : {}),
        ...(session ? { Cookie: session.cookie, 'X-CSRF-Token': session.csrf } : {})
      },
      body: data ? JSON.stringify(data) : undefined
    });
    const body = await response.json();
    return { status: response.status, body, cookie: response.headers.get('set-cookie')?.split(';')[0], csrf: body.csrf };
  }

  try {
    const admin = await request('/api/auth/setup', { method: 'POST', data: { name: 'Admin', email: 'adm@example.test', password: 'password-123' } });
    const student = await request('/api/auth/register', { method: 'POST', data: { name: 'Student', email: 'stu@example.test', password: 'password-123' } });

    // 1. Admin imports student transfer record
    const studentTransferData = {
      studentId: '69242206001-6',
      studentName: 'นาย ณัฐวุฒิ พึ่งญาติ',
      curriculumYear: '2569',
      curriculumName: 'เทคโนโลยีสารสนเทศ',
      faculty: 'คณะวิทยาศาสตร์และเทคโนโลยีการเกษตร',
      department: 'วิทยาศาสตร์',
      level: 'ปริญญาตรี',
      totalCurriculumCredits: 131,
      totalTransferredCredits: 42,
      remainingCredits: 89,
      courses: [
        {
          group: 'หมวดวิชาศึกษาทั่วไป',
          targetCode: 'GEBLC101',
          targetName: 'ภาษาอังกฤษเพื่อการสื่อสาร',
          targetCredits: 3,
          targetGrade: 'TC',
          passed: true,
          sources: [
            { code: '30000-1201', name: 'ภาษาอังกฤษสำหรับงานอาชีพ', credits: 2, grade: '4' },
            { code: '30000-1202', name: 'การเขียนและนำเสนอ', credits: 1, grade: '3.5' }
          ]
        },
        {
          group: 'หมวดวิชาชีพเฉพาะ',
          targetCode: 'BSCCT203',
          targetName: 'ระบบฐานข้อมูล',
          targetCredits: 3,
          targetGrade: 'TC',
          passed: true,
          sources: [
            { code: '31901-2007', name: 'เทคโนโลยีการจัดการฐานข้อมูล', credits: 3, grade: '4' }
          ]
        }
      ]
    };

    const saveRes = await request('/api/admin/student-transfers/save', {
      method: 'POST',
      session: admin,
      data: studentTransferData
    });
    assert.equal(saveRes.status, 200);
    assert.equal(saveRes.body.studentId, '69242206001-6');

    // 1.1 Student logs in directly using Student ID and default password (Student ID)
    const studentLogin = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { Origin: base, 'Content-Type': 'application/json', 'X-Portal-Role': 'student' },
      body: JSON.stringify({ email: '69242206001-6', password: '69242206001-6' })
    });
    assert.equal(studentLogin.status, 200);
    const studentLoginBody = await studentLogin.json();
    assert.equal(studentLoginBody.user.name, 'นาย ณัฐวุฒิ พึ่งญาติ');
    assert.equal(studentLoginBody.user.studentId, '69242206001-6');
    assert.equal(studentLoginBody.user.role, 'student');

    // 1.2 Student logs in using compact student ID without hyphens
    const compactLogin = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { Origin: base, 'Content-Type': 'application/json', 'X-Portal-Role': 'student' },
      body: JSON.stringify({ email: '692422060016', password: '692422060016' })
    });
    assert.equal(compactLogin.status, 200);

    // 2. Admin lists student transfers
    const listRes = await request('/api/admin/student-transfers', { session: admin });
    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.length, 1);
    assert.equal(listRes.body[0].student_id, '69242206001-6');

    // 3. Student attempts verification with nonexistent student ID -> 404 error
    const nonExistent = await request('/api/student/verify-transfer', {
      method: 'POST',
      session: student,
      data: {
        studentId: '99999999999-9',
        courses: [{ code: '30000-1201', name: 'Eng', credits: 2, grade: '4' }]
      }
    });
    assert.equal(nonExistent.status, 404);

    // 4. Student verifies with valid Student ID and matching OCR courses
    const studentOcrCourses = [
      { code: '30000-1201', name: 'ภาษาอังกฤษสำหรับงานอาชีพ', credits: 2, grade: '4' },
      { code: '30000-1202', name: 'การเขียนและนำเสนอ', credits: 1, grade: '3.5' },
      { code: '31901-2007', name: 'เทคโนโลยีการจัดการฐานข้อมูล', credits: 3, grade: '4' }
    ];

    const verifyRes = await request('/api/student/verify-transfer', {
      method: 'POST',
      session: student,
      data: {
        studentId: '69242206001-6',
        courses: studentOcrCourses
      }
    });

    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.body.studentId, '69242206001-6');
    assert.equal(verifyRes.body.verifiedTransferredCredits, 6);
    assert.equal(verifyRes.body.courses.length, 2);
    assert.equal(verifyRes.body.courses[0].status, 'eligible');
    assert.equal(verifyRes.body.courses[1].status, 'eligible');

    // 5. Check history was recorded for student
    const historyRes = await request('/api/history', { session: student });
    assert.equal(historyRes.status, 200);
    assert.equal(historyRes.body.length, 1);

    // 6. Admin deletes student transfer record
    const deleteRes = await request('/api/admin/student-transfers/delete', {
      method: 'POST',
      session: admin,
      data: { studentId: '69242206001-6' }
    });
    assert.equal(deleteRes.status, 200);

    const emptyList = await request('/api/admin/student-transfers', { session: admin });
    assert.equal(emptyList.body.length, 0);

  } finally {
    await new Promise(resolve => server.close(resolve));
    store.close();
  }
});

test('Bulk clear removes mappings by curriculum year and clears all records', async () => {
  const store = createStore(':memory:');
  const server = createApp(store);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function request(path, { method = 'GET', session = null, data = null } = {}) {
    const headers = {
      Origin: base,
      'Content-Type': 'application/json',
      'X-Portal-Role': 'admin'
    };
    if (session) {
      headers.Cookie = session.cookie;
      if (method !== 'GET') headers['X-CSRF-Token'] = session.csrf;
    }
    const res = await fetch(base + path, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined
    });
    return { status: res.status, body: await res.json() };
  }

  try {
    const setupRes = await request('/api/auth/setup', {
      method: 'POST',
      data: { name: 'Admin', email: 'adm@test.example', password: 'password123' }
    });
    const loginRes = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { Origin: base, 'Content-Type': 'application/json', 'X-Portal-Role': 'admin' },
      body: JSON.stringify({ email: 'adm@test.example', password: 'password123' })
    });
    const admin = {
      cookie: loginRes.headers.get('set-cookie')?.split(';')[0],
      csrf: (await loginRes.json()).csrf
    };

    const c65 = store.saveCurriculum({ year: '2565', name: 'IT 2565' });
    const c69 = store.saveCurriculum({ year: '2569', name: 'IT 2569' });

    const course65 = store.saveCourse({ curriculumId: c65.id, code: 'BSCCT101', name: 'Fund IT', credits: 3 });
    const course69 = store.saveCourse({ curriculumId: c69.id, code: 'BSCCT101', name: 'Fund IT', credits: 3 });

    store.saveMapping({ curriculumId: c65.id, sourceCode: '30001-1003', targetCourseId: course65.id });
    store.saveMapping({ curriculumId: c65.id, sourceCode: '30001-2001', targetCourseId: course65.id });
    store.saveMapping({ curriculumId: c69.id, sourceCode: '30001-1003', targetCourseId: course69.id });

    assert.equal(store.catalog().mappings.length, 3);

    // 1. Clear mappings specifically for year 2565
    const clear65Res = await request('/api/admin/mappings/clear', {
      method: 'POST',
      session: admin,
      data: { year: '2565' }
    });
    assert.equal(clear65Res.status, 200);
    assert.equal(clear65Res.body.deleted, 2);
    assert.equal(store.catalog().mappings.length, 1);
    assert.equal(store.catalog().mappings[0].year, '2569');

    // 2. Clear all remaining mappings
    const clearAllRes = await request('/api/admin/mappings/clear', {
      method: 'POST',
      session: admin,
      data: {}
    });
    assert.equal(clearAllRes.status, 200);
    assert.equal(clearAllRes.body.deleted, 1);
    assert.equal(store.catalog().mappings.length, 0);

    // 3. Clear courses
    const clearCoursesRes = await request('/api/admin/courses/clear', {
      method: 'POST',
      session: admin,
      data: {}
    });
    assert.equal(clearCoursesRes.status, 200);
    assert.equal(clearCoursesRes.body.deleted, 2);
    assert.equal(store.catalog().courses.length, 0);

  } finally {
    await new Promise(resolve => server.close(resolve));
    store.close();
  }
});


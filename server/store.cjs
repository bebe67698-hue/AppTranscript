'use strict';
const { DatabaseSync } = require('node:sqlite');
const { randomUUID, randomBytes, scryptSync } = require('node:crypto');
const { checkCourse } = require('../matching.js');

function passwordHashSync(password, salt = randomBytes(16).toString('hex')) {
  const key = scryptSync(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}

class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
function text(value, label, max = 180) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new AppError(`${label}ไม่ถูกต้อง (ไม่เกิน ${max} ตัวอักษร)`);
  return value.trim();
}
function code(value) {
  const result = text(value, 'รหัสวิชา', 30).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._ -]*$/.test(result)) throw new AppError('รหัสวิชาต้องเป็นตัวอักษรอังกฤษ ตัวเลข จุด ขีด หรือช่องว่าง');
  return result;
}
function year(value) {
  if (!/^\d{4}$/.test(String(value)) || Number(value) < 2400 || Number(value) > 2800) throw new AppError('ปีหลักสูตรต้องเป็น พ.ศ. 4 หลัก ระหว่าง 2400–2800');
  return String(value);
}
function id(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new AppError('รหัสข้อมูลไม่ถูกต้อง');
  return number;
}
function createStore(filename) {
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','student')), student_id TEXT);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS curricula (id INTEGER PRIMARY KEY, year TEXT NOT NULL UNIQUE, name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS courses (id INTEGER PRIMARY KEY, curriculum_id INTEGER NOT NULL REFERENCES curricula(id), code TEXT NOT NULL, name TEXT NOT NULL, credits REAL NOT NULL CHECK(credits>0 AND credits<=30), UNIQUE(curriculum_id,code));
    CREATE TABLE IF NOT EXISTS mappings (id INTEGER PRIMARY KEY, curriculum_id INTEGER NOT NULL REFERENCES curricula(id), source_code TEXT NOT NULL, target_course_id INTEGER NOT NULL REFERENCES courses(id), UNIQUE(curriculum_id,source_code));
    CREATE TABLE IF NOT EXISTS checks (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, year TEXT NOT NULL, curriculum_name TEXT NOT NULL, results TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS student_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL UNIQUE,
      student_name TEXT NOT NULL,
      curriculum_year TEXT NOT NULL,
      curriculum_name TEXT NOT NULL,
      faculty TEXT NOT NULL,
      department TEXT NOT NULL,
      level TEXT NOT NULL,
      prior_curriculum TEXT,
      total_curriculum_credits REAL NOT NULL,
      total_transferred_credits REAL NOT NULL,
      remaining_credits REAL NOT NULL,
      evaluated_date TEXT,
      evaluator_name TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS student_transfer_courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_transfer_id INTEGER NOT NULL REFERENCES student_transfers(id) ON DELETE CASCADE,
      course_group TEXT NOT NULL,
      target_code TEXT NOT NULL,
      target_name TEXT NOT NULL,
      target_credits REAL NOT NULL,
      target_grade TEXT NOT NULL,
      passed INTEGER NOT NULL,
      sources_json TEXT NOT NULL
    );
  `);
  try { db.exec('ALTER TABLE users ADD COLUMN student_id TEXT'); } catch (_) {}
  try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_student_id ON users(student_id) WHERE student_id IS NOT NULL'); } catch (_) {}

  // Migrate existing student_transfers to users if missing
  try {
    const existingTransfers = db.prepare('SELECT student_id, student_name FROM student_transfers').all();
    for (const st of existingTransfers) {
      const cleanId = String(st.student_id).trim();
      const compactId = cleanId.replace(/[^a-zA-Z0-9]/g, '');
      const email = `${compactId || cleanId}@student.it.local`.toLowerCase();
      const exists = db.prepare('SELECT id FROM users WHERE student_id=? OR email=?').get(cleanId, email);
      if (!exists) {
        const hash = passwordHashSync(cleanId);
        db.prepare('INSERT INTO users(id, name, email, password_hash, role, student_id) VALUES(?,?,?,?,?,?)')
          .run(randomUUID(), st.student_name, email, hash, 'student', cleanId);
      }
    }
  } catch (_) {}
  function requireRecord(table, recordId) {
    const row = db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id(recordId));
    if (!row) throw new AppError('ไม่พบข้อมูลที่เลือก', 404);
    return row;
  }
  function saveCurriculum(data) {
    if (data.program && data.program !== 'IT') throw new AppError('รองรับเฉพาะหลักสูตรเทคโนโลยีสารสนเทศ');
    const values = [year(data.year), text(data.name, 'ชื่อหลักสูตร')];
    let resultId;
    if (data.id) {
      const old = requireRecord('curricula', data.id);
      if (old.year !== values[0]) throw new AppError('เปลี่ยนปีของหลักสูตรเดิมไม่ได้ กรุณาเพิ่มหลักสูตรใหม่เพื่อรักษาคู่เทียบเดิม');
      db.prepare('UPDATE curricula SET name=? WHERE id=?').run(values[1], old.id);
      resultId = old.id;
    } else resultId = Number(db.prepare('INSERT INTO curricula(year,name) VALUES(?,?)').run(...values).lastInsertRowid);
    return requireRecord('curricula', resultId);
  }
  function saveCourse(data) {
    const curriculum = requireRecord('curricula', data.curriculumId);
    const credits = Number(data.credits);
    if (!Number.isFinite(credits) || credits <= 0 || credits > 30 || credits * 2 % 1 !== 0) throw new AppError('หน่วยกิตต้องมากกว่า 0 ไม่เกิน 30 และเพิ่มครั้งละ 0.5');
    const values = [curriculum.id, code(data.code), text(data.name, 'ชื่อรายวิชา'), credits];
    let resultId;
    if (data.id) {
      const old = requireRecord('courses', data.id);
      if (old.curriculum_id !== curriculum.id) throw new AppError('ย้ายรายวิชาข้ามหลักสูตรไม่ได้ กรุณาเพิ่มรายวิชาใหม่');
      db.prepare('UPDATE courses SET curriculum_id=?,code=?,name=?,credits=? WHERE id=?').run(...values, old.id);
      resultId = old.id;
    } else resultId = Number(db.prepare('INSERT INTO courses(curriculum_id,code,name,credits) VALUES(?,?,?,?)').run(...values).lastInsertRowid);
    return requireRecord('courses', resultId);
  }
  function saveMapping(data) {
    const curriculum = requireRecord('curricula', data.curriculumId);
    const course = requireRecord('courses', data.targetCourseId);
    if (course.curriculum_id !== curriculum.id) throw new AppError('รายวิชาปลายทางต้องอยู่ในปีหลักสูตรเดียวกัน');
    const values = [curriculum.id, code(data.sourceCode), course.id];
    let resultId;
    if (data.id) {
      resultId = requireRecord('mappings', data.id).id;
      db.prepare('UPDATE mappings SET curriculum_id=?,source_code=?,target_course_id=? WHERE id=?').run(...values, resultId);
    } else resultId = Number(db.prepare('INSERT INTO mappings(curriculum_id,source_code,target_course_id) VALUES(?,?,?)').run(...values).lastInsertRowid);
    return requireRecord('mappings', resultId);
  }
  function catalog() {
    return {
      curricula: db.prepare('SELECT * FROM curricula ORDER BY year DESC').all(),
      courses: db.prepare('SELECT courses.*,curricula.year FROM courses JOIN curricula ON curricula.id=courses.curriculum_id ORDER BY year DESC,code').all(),
      mappings: db.prepare('SELECT mappings.*,curricula.year,courses.code AS target_code,courses.name AS target_name FROM mappings JOIN curricula ON curricula.id=mappings.curriculum_id JOIN courses ON courses.id=mappings.target_course_id ORDER BY year DESC,source_code').all()
    };
  }
  function deleteRecord(kind, recordId) {
    if (!['curricula','courses','mappings'].includes(kind)) throw new AppError('ประเภทข้อมูลไม่ถูกต้อง');
    const record = requireRecord(kind, recordId);
    db.exec('BEGIN IMMEDIATE');
    try {
      if (kind === 'curricula') {
        const courses = db.prepare('SELECT COUNT(*) AS count FROM courses WHERE curriculum_id=?').get(record.id).count;
        const mappings = db.prepare('SELECT COUNT(*) AS count FROM mappings WHERE curriculum_id=?').get(record.id).count;
        if (courses || mappings) throw new AppError(`หลักสูตรนี้มี ${courses} รายวิชา และ ${mappings} คู่เทียบ กรุณาลบคู่เทียบและรายวิชาก่อน`,409);
      }
      if (kind === 'courses') {
        const count = db.prepare('SELECT COUNT(*) AS count FROM mappings WHERE target_course_id=?').get(record.id).count;
        if (count) throw new AppError(`รายวิชานี้ถูกใช้ใน ${count} คู่เทียบ กรุณาลบคู่เทียบที่อ้างอิงก่อน`,409);
      }
      db.prepare(`DELETE FROM ${kind} WHERE id=?`).run(record.id);
      db.exec('COMMIT');
      return {ok:true};
    } catch (error) {db.exec('ROLLBACK');throw error;}
  }
  function clearRecords(kind, options = {}) {
    if (!['curricula','courses','mappings','student_transfers'].includes(kind)) throw new AppError('ประเภทข้อมูลไม่ถูกต้อง');
    const curriculumYear = options.year ? year(options.year) : null;
    db.exec('BEGIN IMMEDIATE');
    try {
      let count = 0;
      if (kind === 'student_transfers') {
        if (curriculumYear) {
          const transfers = db.prepare('SELECT student_id FROM student_transfers WHERE curriculum_year=?').all(curriculumYear);
          for (const t of transfers) {
            const user = db.prepare("SELECT id FROM users WHERE role='student' AND student_id=?").get(t.student_id);
            if (user) {
              db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
              const hasChecks = db.prepare('SELECT COUNT(*) as count FROM checks WHERE user_id=?').get(user.id).count;
              if (!hasChecks) db.prepare('DELETE FROM users WHERE id=?').run(user.id);
            }
          }
          const res = db.prepare('DELETE FROM student_transfers WHERE curriculum_year=?').run(curriculumYear);
          count = res.changes;
        } else {
          const studentUsers = db.prepare("SELECT id FROM users WHERE role='student' AND student_id IS NOT NULL").all();
          for (const u of studentUsers) {
            db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
            const hasChecks = db.prepare('SELECT COUNT(*) as count FROM checks WHERE user_id=?').get(u.id).count;
            if (!hasChecks) db.prepare('DELETE FROM users WHERE id=?').run(u.id);
          }
          const res = db.prepare('DELETE FROM student_transfers').run();
          count = res.changes;
        }
      } else if (kind === 'mappings') {
        if (curriculumYear) {
          const curr = db.prepare('SELECT id FROM curricula WHERE year=?').get(curriculumYear);
          if (curr) {
            const res = db.prepare('DELETE FROM mappings WHERE curriculum_id=?').run(curr.id);
            count = res.changes;
          }
        } else {
          const res = db.prepare('DELETE FROM mappings').run();
          count = res.changes;
        }
      } else if (kind === 'courses') {
        if (curriculumYear) {
          const curr = db.prepare('SELECT id FROM curricula WHERE year=?').get(curriculumYear);
          if (curr) {
            const mappingCount = db.prepare('SELECT COUNT(*) AS count FROM mappings WHERE curriculum_id=?').get(curr.id).count;
            if (mappingCount > 0) {
              throw new AppError(`มีคู่เทียบในหลักสูตรปี ${curriculumYear} อยู่ ${mappingCount} รายการ กรุณาลบคู่เทียบก่อนลบรายวิชา`, 409);
            }
            const res = db.prepare('DELETE FROM courses WHERE curriculum_id=?').run(curr.id);
            count = res.changes;
          }
        } else {
          const mappingCount = db.prepare('SELECT COUNT(*) AS count FROM mappings').get().count;
          if (mappingCount > 0) {
            throw new AppError(`มีคู่เทียบในระบบอยู่ ${mappingCount} รายการ กรุณาลบคู่เทียบก่อนลบรายวิชาทั้งหมด`, 409);
          }
          const res = db.prepare('DELETE FROM courses').run();
          count = res.changes;
        }
      } else if (kind === 'curricula') {
        if (curriculumYear) {
          const curr = db.prepare('SELECT id FROM curricula WHERE year=?').get(curriculumYear);
          if (curr) {
            const coursesCount = db.prepare('SELECT COUNT(*) AS count FROM courses WHERE curriculum_id=?').get(curr.id).count;
            const mappingCount = db.prepare('SELECT COUNT(*) AS count FROM mappings WHERE curriculum_id=?').get(curr.id).count;
            if (coursesCount > 0 || mappingCount > 0) {
              throw new AppError(`หลักสูตรปี ${curriculumYear} มี ${coursesCount} รายวิชา และ ${mappingCount} คู่เทียบ กรุณาลบคู่เทียบและรายวิชาก่อน`, 409);
            }
            const res = db.prepare('DELETE FROM curricula WHERE id=?').run(curr.id);
            count = res.changes;
          }
        } else {
          const coursesCount = db.prepare('SELECT COUNT(*) AS count FROM courses').get().count;
          const mappingCount = db.prepare('SELECT COUNT(*) AS count FROM mappings').get().count;
          if (coursesCount > 0 || mappingCount > 0) {
            throw new AppError(`มีรายวิชาและคู่เทียบในระบบ กรุณาลบคู่เทียบและรายวิชาก่อนลบหลักสูตรทั้งหมด`, 409);
          }
          const res = db.prepare('DELETE FROM curricula').run();
          count = res.changes;
        }
      }
      db.exec('COMMIT');
      return { ok: true, deleted: count };
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  function importData(data, dryRun) {
    if (!data || !['curricula','courses','mappings'].every(key => Array.isArray(data[key]))) throw new AppError('รูปแบบข้อมูลนำเข้าไม่ถูกต้อง');
    const count = data.curricula.length + data.courses.length + data.mappings.length;
    if (!count || count > 1000) throw new AppError('นำเข้าได้ 1–1,000 แถวต่อครั้ง');
    db.exec('BEGIN IMMEDIATE');
    const counts = { created: 0, updated: 0, total: count };
    try {
      for (const kind of ['curricula','courses','mappings']) {
        const seen = new Set();
        for (const row of data[kind]) {
          const rowYear = year(row.year);
          const key = `${rowYear}:${kind === 'curricula' ? '' : code(row[kind === 'courses' ? 'code' : 'sourceCode'])}`;
          if (seen.has(key)) throw new AppError(`พบข้อมูลซ้ำในชีต ${kind}: ${key}`);
          seen.add(key);
          let existing;
          if (kind === 'curricula') {
            existing = db.prepare('SELECT id FROM curricula WHERE year=?').get(rowYear);
            saveCurriculum({ ...row, id: existing?.id });
          } else {
            const curriculum = db.prepare('SELECT id FROM curricula WHERE year=?').get(rowYear);
            if (!curriculum) throw new AppError(`ไม่พบหลักสูตรปี ${rowYear}`);
            if (kind === 'courses') {
              existing = db.prepare('SELECT id FROM courses WHERE curriculum_id=? AND code=?').get(curriculum.id, code(row.code));
              saveCourse({ ...row, id: existing?.id, curriculumId: curriculum.id });
            } else {
              const target = db.prepare('SELECT id FROM courses WHERE curriculum_id=? AND code=?').get(curriculum.id, code(row.targetCode));
              if (!target) throw new AppError(`ไม่พบรายวิชาปลายทาง ${row.targetCode} ในปี ${rowYear}`);
              existing = db.prepare('SELECT id FROM mappings WHERE curriculum_id=? AND source_code=?').get(curriculum.id, code(row.sourceCode));
              saveMapping({ id: existing?.id, curriculumId: curriculum.id, sourceCode: row.sourceCode, targetCourseId: target.id });
            }
          }
          counts[existing ? 'updated' : 'created']++;
        }
      }
      db.exec(dryRun ? 'ROLLBACK' : 'COMMIT');
      return counts;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }

  function saveStudentTransfer(data) {
    if (!data || typeof data !== 'object') throw new AppError('ข้อมูลผลเทียบโอนรายบุคคลไม่ถูกต้อง');
    const studentId = text(data.studentId, 'รหัสประจำตัวนักศึกษา', 50);
    const studentName = text(data.studentName, 'ชื่อนักศึกษา', 180);
    const curriculumYear = year(data.curriculumYear || '2569');
    const curriculumName = text(data.curriculumName || 'เทคโนโลยีสารสนเทศ', 'ชื่อหลักสูตร');
    const faculty = text(data.faculty || 'คณะวิทยาศาสตร์และเทคโนโลยีการเกษตร', 'คณะ');
    const department = text(data.department || 'วิทยาศาสตร์', 'สาขา');
    const level = text(data.level || 'ปริญญาตรี', 'ระดับการศึกษา');
    const priorCurriculum = data.priorCurriculum ? String(data.priorCurriculum).slice(0, 300) : '';
    const totalCurriculumCredits = Number(data.totalCurriculumCredits) || 131;
    const totalTransferredCredits = Number(data.totalTransferredCredits) || 0;
    const remainingCredits = Number(data.remainingCredits) || Math.max(0, totalCurriculumCredits - totalTransferredCredits);
    const evaluatedDate = data.evaluatedDate ? String(data.evaluatedDate).slice(0, 50) : new Date().toISOString().split('T')[0];
    const evaluatorName = data.evaluatorName ? String(data.evaluatorName).slice(0, 180) : '';
    const now = new Date().toISOString();

    if (!Array.isArray(data.courses) || !data.courses.length) {
      throw new AppError('ต้องมีรายการรายวิชาเทียบโอนอย่างน้อย 1 รายการ');
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      const existing = db.prepare('SELECT id FROM student_transfers WHERE student_id=?').get(studentId);
      let recordId;
      if (existing) {
        db.prepare(`
          UPDATE student_transfers 
          SET student_name=?, curriculum_year=?, curriculum_name=?, faculty=?, department=?, level=?, 
              prior_curriculum=?, total_curriculum_credits=?, total_transferred_credits=?, remaining_credits=?, 
              evaluated_date=?, evaluator_name=?, updated_at=?
          WHERE id=?
        `).run(
          studentName, curriculumYear, curriculumName, faculty, department, level,
          priorCurriculum, totalCurriculumCredits, totalTransferredCredits, remainingCredits,
          evaluatedDate, evaluatorName, now, existing.id
        );
        recordId = existing.id;
        db.prepare('DELETE FROM student_transfer_courses WHERE student_transfer_id=?').run(recordId);
      } else {
        const insert = db.prepare(`
          INSERT INTO student_transfers (
            student_id, student_name, curriculum_year, curriculum_name, faculty, department, level,
            prior_curriculum, total_curriculum_credits, total_transferred_credits, remaining_credits,
            evaluated_date, evaluator_name, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          studentId, studentName, curriculumYear, curriculumName, faculty, department, level,
          priorCurriculum, totalCurriculumCredits, totalTransferredCredits, remainingCredits,
          evaluatedDate, evaluatorName, now, now
        );
        recordId = Number(insert.lastInsertRowid);
      }

      const insertCourse = db.prepare(`
        INSERT INTO student_transfer_courses (
          student_transfer_id, course_group, target_code, target_name, target_credits, target_grade, passed, sources_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const c of data.courses) {
        insertCourse.run(
          recordId,
          c.group || 'หมวดวิชาศึกษาทั่วไป',
          code(c.targetCode),
          text(c.targetName || c.targetCode, 'ชื่อวิชาปลายทาง'),
          Number(c.targetCredits) || 3,
          String(c.targetGrade || 'TC').trim(),
          c.passed ? 1 : 0,
          JSON.stringify(c.sources || [])
        );
      }

      // Auto-generate or update student login credentials
      const cleanStudentId = String(studentId).trim();
      const compactStudentId = cleanStudentId.replace(/[^a-zA-Z0-9]/g, '');
      const studentEmail = `${compactStudentId || cleanStudentId}@student.it.local`.toLowerCase();
      const defaultHash = passwordHashSync(cleanStudentId);

      const existingUser = db.prepare('SELECT id FROM users WHERE student_id=? OR email=?').get(cleanStudentId, studentEmail);
      if (existingUser) {
        db.prepare('UPDATE users SET name=?, student_id=?, email=?, password_hash=? WHERE id=?')
          .run(studentName, cleanStudentId, studentEmail, defaultHash, existingUser.id);
      } else {
        const newUserId = randomUUID();
        db.prepare('INSERT INTO users(id, name, email, password_hash, role, student_id) VALUES(?,?,?,?,?,?)')
          .run(newUserId, studentName, studentEmail, defaultHash, 'student', cleanStudentId);
      }

      db.exec('COMMIT');
      return getStudentTransfer(studentId);
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  function listStudentTransfers() {
    return db.prepare(`
      SELECT id, student_id, student_name, curriculum_year, curriculum_name, 
             total_curriculum_credits, total_transferred_credits, remaining_credits, evaluated_date, updated_at
      FROM student_transfers
      ORDER BY updated_at DESC
    `).all();
  }

  function getStudentTransfer(studentId) {
    const cleanId = String(studentId || '').trim();
    const compactId = cleanId.replace(/[^a-zA-Z0-9]/g, '');
    let record = db.prepare('SELECT * FROM student_transfers WHERE student_id=? OR id=?').get(cleanId, Number(cleanId) || 0);
    if (!record && compactId) {
      const all = db.prepare('SELECT * FROM student_transfers').all();
      record = all.find(r => r.student_id.replace(/[^a-zA-Z0-9]/g, '') === compactId);
    }
    if (!record) return null;
    const courseRows = db.prepare('SELECT * FROM student_transfer_courses WHERE student_transfer_id=? ORDER BY id ASC').all(record.id);
    const courses = courseRows.map(row => ({
      id: row.id,
      group: row.course_group,
      targetCode: row.target_code,
      targetName: row.target_name,
      targetCredits: row.target_credits,
      targetGrade: row.target_grade,
      passed: Boolean(row.passed),
      sources: JSON.parse(row.sources_json || '[]')
    }));
    return {
      id: record.id,
      studentId: record.student_id,
      studentName: record.student_name,
      curriculumYear: record.curriculum_year,
      curriculumName: record.curriculum_name,
      faculty: record.faculty,
      department: record.department,
      level: record.level,
      priorCurriculum: record.prior_curriculum,
      totalCurriculumCredits: record.total_curriculum_credits,
      totalTransferredCredits: record.total_transferred_credits,
      remainingCredits: record.remaining_credits,
      evaluatedDate: record.evaluated_date,
      evaluatorName: record.evaluator_name,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      courses
    };
  }

  function deleteStudentTransfer(studentId) {
    const cleanId = String(studentId || '').trim();
    const record = db.prepare('SELECT id FROM student_transfers WHERE student_id=? OR id=?').get(cleanId, Number(cleanId) || 0);
    if (!record) throw new AppError('ไม่พบข้อมูลนักศึกษาที่ต้องการลบ', 404);
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('DELETE FROM student_transfer_courses WHERE student_transfer_id=?').run(record.id);
      db.prepare('DELETE FROM student_transfers WHERE id=?').run(record.id);
      const user = db.prepare("SELECT id FROM users WHERE role='student' AND student_id=?").get(cleanId);
      if (user) {
        db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
        const hasChecks = db.prepare('SELECT COUNT(*) as count FROM checks WHERE user_id=?').get(user.id).count;
        if (!hasChecks) db.prepare('DELETE FROM users WHERE id=?').run(user.id);
      }
      db.exec('COMMIT');
      return { ok: true };
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  function verifyStudentTransfer(studentId, ocrCourses, userId) {
    const studentRecord = getStudentTransfer(studentId);
    if (!studentRecord) {
      throw new AppError(`ไม่พบข้อมูลผลการเทียบโอนของรหัสนักศึกษา ${studentId} ในระบบ กรุณาติดต่อผู้ดูแลระบบเพื่อนำเข้าข้อมูลสรุปการเทียบโอน`, 404);
    }
    if (!Array.isArray(ocrCourses) || !ocrCourses.length) {
      throw new AppError('กรุณาอัปโหลดใบ Transcript เพื่อให้ระบบอ่านรายวิชาและตรวจสอบผล', 400);
    }

    const normCode = c => String(c || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const passingGrades = new Set(['A+','A','B+','B','C+','C','D+','D','P','S','TC','1','1.5','2','2.5','3','3.5','4']);

    const ocrMap = new Map();
    for (const c of ocrCourses) {
      const codeKey = normCode(c.code);
      if (codeKey) ocrMap.set(codeKey, c);
    }

    let verifiedTransferredCredits = 0;
    const verifiedCourses = studentRecord.courses.map(course => {
      const sourcesCheck = course.sources.map(src => {
        const found = ocrMap.get(normCode(src.code));
        const hasPassedGrade = found && (passingGrades.has(String(found.grade || '').toUpperCase()) || Number(found.grade) >= 1.0);
        return {
          ...src,
          foundInTranscript: Boolean(found),
          actualGrade: found ? found.grade : null,
          isPassed: Boolean(hasPassedGrade)
        };
      });

      const allSourcesVerified = sourcesCheck.length > 0 && sourcesCheck.every(s => s.foundInTranscript);
      const isEligible = course.passed && (allSourcesVerified || course.sources.length === 0);

      if (isEligible) {
        verifiedTransferredCredits += course.targetCredits;
      }

      return {
        ...course,
        status: isEligible ? 'eligible' : (sourcesCheck.some(s => s.foundInTranscript) ? 'partial' : 'missing_in_transcript'),
        statusLabel: isEligible ? 'เทียบโอนได้' : 'ไม่พบใน Transcript',
        sources: sourcesCheck
      };
    });

    const remainingCredits = Math.max(0, studentRecord.totalCurriculumCredits - verifiedTransferredCredits);

    const checkResult = {
      id: randomUUID(),
      created_at: new Date().toISOString(),
      studentId: studentRecord.studentId,
      studentName: studentRecord.studentName,
      curriculumYear: studentRecord.curriculumYear,
      curriculumName: studentRecord.curriculumName,
      faculty: studentRecord.faculty,
      department: studentRecord.department,
      totalCurriculumCredits: studentRecord.totalCurriculumCredits,
      totalTransferredCredits: studentRecord.totalTransferredCredits,
      verifiedTransferredCredits,
      remainingCredits,
      evaluatedDate: studentRecord.evaluatedDate,
      evaluatorName: studentRecord.evaluatorName,
      courses: verifiedCourses
    };

    if (userId) {
      db.prepare('INSERT INTO checks VALUES(?,?,?,?,?,?)').run(
        checkResult.id,
        userId,
        checkResult.created_at,
        checkResult.curriculumYear,
        `${checkResult.curriculumName} (รหัส ${checkResult.studentId})`,
        JSON.stringify(checkResult)
      );
    }

    return checkResult;
  }

  function check(curriculumId, rows) {
    const curriculum = requireRecord('curricula', curriculumId);
    if (!Array.isArray(rows) || !rows.length || rows.length > 200) throw new AppError('ตรวจสอบได้ 1–200 รายวิชาต่อครั้ง');
    const pairs = db.prepare('SELECT m.source_code AS code,c.code || ? || c.name AS target FROM mappings m JOIN courses c ON c.id=m.target_course_id WHERE m.curriculum_id=?').all(' ',curriculum.id).map(p => ({ ...p, year: curriculum.year }));
    const seen = new Set();
    return rows.map(row => {
      const normalized = { code: code(row.code), name: text(row.name,'ชื่อรายวิชา'), credits: Number(row.credits), grade: String(row.grade || '').trim().toUpperCase() };
      if (normalized.credits > 30 || normalized.credits * 2 % 1 !== 0) throw new AppError('หน่วยกิตไม่ถูกต้อง');
      if (seen.has(normalized.code)) throw new AppError(`รหัสวิชา ${normalized.code} ซ้ำ กรุณาตรวจทานก่อนส่ง`);
      seen.add(normalized.code);
      const result = checkCourse(normalized, curriculum.year, pairs);
      return { ...normalized, ...result, reason: result.reason.replace('คู่เทียบตัวอย่าง:', 'คู่เทียบ:') };
    });
  }
  function saveCheck(userId, curriculumId, rows) {
    const results = check(curriculumId, rows);
    const curriculum = requireRecord('curricula', curriculumId);
    const record = { id: randomUUID(), created_at: new Date().toISOString(), year: curriculum.year, curriculum_name: curriculum.name, results };
    db.prepare('INSERT INTO checks VALUES(?,?,?,?,?,?)').run(record.id,userId,record.created_at,record.year,record.curriculum_name,JSON.stringify(results));
    return record;
  }
  return { 
    db, 
    saveCurriculum, 
    saveCourse, 
    saveMapping, 
    deleteRecord, 
    clearRecords,
    catalog, 
    importData, 
    saveStudentTransfer,
    listStudentTransfers,
    getStudentTransfer,
    deleteStudentTransfer,
    verifyStudentTransfer,
    check, 
    saveCheck, 
    close: () => db.close() 
  };
}
module.exports = { createStore, AppError, text };


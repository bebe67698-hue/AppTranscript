'use strict';
const { randomBytes, randomUUID, scrypt, scryptSync, timingSafeEqual, createHash } = require('node:crypto');
const { promisify } = require('node:util');
const { AppError, text } = require('./store.cjs');
const derive = promisify(scrypt);
const hashToken = token => createHash('sha256').update(token).digest('hex');

function passwordHashSync(password, salt = randomBytes(16).toString('hex')) {
  const key = scryptSync(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}

async function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  const key = await derive(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}
function createAuth(db) {
  const attempts = new Map();
  function throttle(ip) {
    const now = Date.now();
    for (const [key, entry] of attempts) if (entry.until < now) attempts.delete(key);
    const entry = attempts.get(ip) || { count: 0, until: now + 15 * 60_000 };
    entry.count++;
    attempts.set(ip, entry);
    if (entry.count > 30) throw new AppError('ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอ 15 นาที',429);
  }
  function session(cookie, role) {
    const prefix = `it_${role}_session=`;
    const token = (cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(prefix))?.slice(prefix.length);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const row = db.prepare('SELECT users.id,users.name,users.email,users.role,users.student_id,sessions.csrf FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires>?').get(hashToken(token),Date.now());
    return row && row.role === role ? { user: { id:row.id,name:row.name,email:row.email,role:row.role,studentId:row.student_id || null }, csrf:row.csrf, token } : null;
  }
  function issue(user) {
    db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
    const token = randomBytes(32).toString('hex');
    const csrf = randomBytes(24).toString('hex');
    db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hashToken(token),user.id,csrf,Date.now()+8*60*60_000);
    return { user: { id:user.id,name:user.name,email:user.email,role:user.role,studentId:user.student_id || null }, csrf, token };
  }
  function needsSetup() { return !db.prepare("SELECT 1 FROM users WHERE role='admin'").get(); }
  async function register(data, role) {
    const name = text(data.name,'ชื่อ',100);
    const email = text(data.email,'อีเมล',254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError('รูปแบบอีเมลไม่ถูกต้อง');
    if (typeof data.password !== 'string' || data.password.length < 10 || data.password.length > 128) throw new AppError('รหัสผ่านต้องมี 10–128 ตัวอักษร');
    const hash = await passwordHash(data.password);
    // Recheck after async hashing to prevent simultaneous initial-admin requests.
    if (role === 'admin' && !needsSetup()) throw new AppError('ระบบมีบัญชีผู้ดูแลแล้ว',409);
    if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) throw new AppError('ไม่สามารถสมัครด้วยอีเมลนี้ได้',409);
    const user = { id:randomUUID(),name,email,role,student_id:null };
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(user.id,name,email,hash,role,null);
    return issue(user);
  }
  async function login(data, role) {
    const rawIdentifier = String(data.email || data.username || data.studentId || '').trim();
    const identifier = rawIdentifier.toLowerCase();
    const password = String(data.password || '');
    if (!identifier || !password || password.length > 128) throw new AppError('กรุณากรอกรหัสประจำตัว/อีเมล และรหัสผ่าน',401);
    
    const compactId = identifier.replace(/[^a-z0-9]/g, '');

    // Search by exact email or student_id
    let user = db.prepare('SELECT * FROM users WHERE LOWER(email)=? OR LOWER(student_id)=?').get(identifier, identifier);
    if (!user && compactId) {
      const allUsers = db.prepare('SELECT * FROM users').all();
      user = allUsers.find(u => 
        (u.student_id && u.student_id.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === compactId) ||
        (u.email && u.email.toLowerCase().startsWith(compactId))
      );
    }

    if (!user) {
      if (role === 'student') {
        throw new AppError(`ไม่พบบัญชีสำหรับรหัสนักศึกษา "${rawIdentifier}" กรุณาติดต่อผู้ดูแลระบบเพื่อนำเข้าข้อมูลผลเทียบโอน`,401);
      }
      throw new AppError('อีเมลหรือรหัสผ่านไม่ถูกต้อง',401);
    }

    const stored = user?.password_hash || `${'0'.repeat(32)}:${'0'.repeat(128)}`;
    const actual = await passwordHash(password, stored.split(':')[0]);
    let valid = timingSafeEqual(Buffer.from(actual.split(':')[1],'hex'),Buffer.from(stored.split(':')[1],'hex'));
    
    // Also accept password matching student ID without hyphens
    if (!valid && user.student_id) {
      const cleanStudentId = user.student_id.trim();
      const compactStudentId = cleanStudentId.replace(/[^a-zA-Z0-9]/g, '');
      const cleanInputPassword = password.trim();
      const compactInputPassword = cleanInputPassword.replace(/[^a-zA-Z0-9]/g, '');
      if (cleanInputPassword === cleanStudentId || compactInputPassword === compactStudentId) {
        valid = true;
      }
    }

    if (!valid) throw new AppError('รหัสผ่านไม่ถูกต้อง (รหัสผ่านเริ่มต้นคือรหัสประจำตัวนักศึกษาของคุณ)',401);
    if (role && user.role !== role) throw new AppError(role === 'admin' ? 'กรุณาใช้บัญชี Admin สำหรับหน้านี้' : 'กรุณาใช้บัญชีนักศึกษาสำหรับหน้านี้',403);
    return issue(user);
  }
  return { session, issue, needsSetup, register, login, throttle, passwordHashSync, logout: token => db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token)) };
}
module.exports = { createAuth, passwordHashSync };

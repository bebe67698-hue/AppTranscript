'use strict';
const http = require('node:http');
const path = require('node:path');
const { createReadStream } = require('node:fs');
const { stat } = require('node:fs/promises');
const { createAuth } = require('./auth.cjs');
const { AppError } = require('./store.cjs');
const root = path.resolve(__dirname,'..');
const publicFiles = new Set(['index.html','styles.css','app.js','matching.js','admin.html','student.html','portal.css','portal/shared.js','portal/admin.js','portal/student.js','portal/ocr.js','portal/excel.js','portal/excel-worker.js','portal/pdf-mapping.js','shared/transcript.cjs','shared/workbook.cjs','shared/pdf-mapping.cjs','shared/student-transfer-parser.cjs','shared/excel-mapping-parser.cjs']);
const mime = { '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.cjs':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.wasm':'application/wasm','.gz':'application/gzip','.png':'image/png','.svg':'image/svg+xml' };
function json(res,status,data) { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(data)); }
async function body(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw new AppError('ต้องส่งข้อมูล JSON',415);
  let size=0; const chunks=[];
  for await (const chunk of req) { size+=chunk.length; if(size>1024*1024) throw new AppError('ข้อมูลใหญ่เกิน 1 MB',413); chunks.push(chunk); }
  try { const data=JSON.parse(Buffer.concat(chunks).toString('utf8')); if(!data || Array.isArray(data) || typeof data!=='object') throw Error(); return data; }
  catch { throw new AppError('ข้อมูล JSON ไม่ถูกต้อง'); }
}
function createApp(store) {
  const auth=createAuth(store.db);
  const server=http.createServer(async (req,res) => {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Cross-Origin-Resource-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      const host=req.headers.host || '';
      // if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) throw new AppError('Host ไม่ได้รับอนุญาต',403);
      const url=new URL(req.url,`http://${host}`);
      if (!url.pathname.startsWith('/api/')) {
        if (!['GET','HEAD'].includes(req.method)) throw new AppError('Method ไม่รองรับ',405);
        let relative=decodeURIComponent(url.pathname).replace(/^\//,'') || 'index.html';
        let filename;
        if (publicFiles.has(relative)) filename=path.join(root,relative);
        else {
          const vendors=[['vendor/pdfjs/','pdfjs-dist/'],['vendor/tesseract/','tesseract.js/dist/'],['vendor/tesseract-core/','tesseract.js-core/'],['vendor/exceljs/','exceljs/dist/']];
          const prefix=vendors.find(([publicPath])=>relative.startsWith(publicPath));
          if (prefix) {
            const suffix=relative.slice(prefix[0].length);
            if (!/^[a-zA-Z0-9_./-]+$/.test(suffix) || suffix.split('/').includes('..')) throw new AppError('ไม่พบไฟล์',404);
            filename=path.join(root,'node_modules',prefix[1],suffix);
          } else if (/^vendor\/tessdata\/(eng|tha)\.traineddata\.gz$/.test(relative)) {
            const language=relative.split('/')[2].split('.')[0];
            filename=path.join(root,'node_modules','@tesseract.js-data',language,'4.0.0',`${language}.traineddata.gz`);
          } else throw new AppError('ไม่พบไฟล์',404);
        }
        let info; try { info=await stat(filename); } catch { throw new AppError('ไม่พบไฟล์',404); }
        if(!info.isFile()) throw new AppError('ไม่พบไฟล์',404);
        res.writeHead(200,{'Content-Type':mime[path.extname(filename)] || 'application/octet-stream','Content-Length':info.size,'Cache-Control':relative.startsWith('vendor/')?'public, max-age=86400':'no-cache'});
        if(req.method==='HEAD') res.end(); else createReadStream(filename).on('error',()=>res.destroy()).pipe(res);
        return;
      }
      const portalRole=req.headers['x-portal-role'] || (url.pathname.startsWith('/api/admin/') || url.pathname==='/api/auth/setup'?'admin':'student');
      if(!['admin','student'].includes(portalRole)) throw new AppError('ประเภทหน้าระบบไม่ถูกต้อง');
      const session=auth.session(req.headers.cookie,portalRole);
      const mutation=!['GET','HEAD'].includes(req.method);
      if(mutation && req.headers.origin!==`http://${host}` && req.headers.origin!==`https://${host}`) throw new AppError('คำขอไม่ได้มาจากเว็บไซต์นี้',403);
      if(url.pathname==='/api/session' && req.method==='GET') return json(res,200,{user:session?.user || null,csrf:session?.csrf || null,needsSetup:auth.needsSetup()});
      if(['/api/auth/setup','/api/auth/register','/api/auth/login'].includes(url.pathname) && req.method==='POST') {
        auth.throttle(req.socket.remoteAddress);
        const data=await body(req);
        // if(url.pathname.endsWith('/setup') && !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) throw new AppError('ตั้งค่าผู้ดูแลได้จากเครื่องเซิร์ฟเวอร์เท่านั้น',403);
        const registrationRole=url.pathname.endsWith('/setup')?'admin':'student';
        if(!url.pathname.endsWith('/login') && portalRole!==registrationRole) throw new AppError('กรุณาสมัครบัญชีจากหน้าระบบที่ถูกต้อง',403);
        const result=url.pathname.endsWith('/login')?await auth.login(data,portalRole):await auth.register(data,registrationRole);
        if(session) auth.logout(session.token);
        res.setHeader('Set-Cookie',`it_${portalRole}_session=${result.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800`);
        return json(res,url.pathname.endsWith('/login')?200:201,{user:result.user,csrf:result.csrf});
      }
      if(!session) throw new AppError('กรุณาเข้าสู่ระบบ',401);
      if(mutation && req.headers['x-csrf-token']!==session.csrf) throw new AppError('การยืนยันคำขอหมดอายุ กรุณารีเฟรชหน้า',403);
      if(url.pathname==='/api/auth/logout' && req.method==='POST') {
        auth.logout(session.token); res.setHeader('Set-Cookie',`it_${portalRole}_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`); return json(res,200,{ok:true});
      }
      if(url.pathname.startsWith('/api/admin/')) {
        if(session.user.role!=='admin') throw new AppError('เฉพาะผู้ดูแลระบบเท่านั้น',403);
        if(url.pathname==='/api/admin/catalog' && req.method==='GET') return json(res,200,store.catalog());
        if(url.pathname==='/api/admin/student-transfers' && req.method==='GET') return json(res,200,store.listStudentTransfers());
        if(url.pathname.startsWith('/api/admin/student-transfers/') && req.method==='GET') {
          const id=decodeURIComponent(url.pathname.split('/').pop());
          const record=store.getStudentTransfer(id);
          if(!record) throw new AppError('ไม่พบข้อมูลนักศึกษา',404);
          return json(res,200,record);
        }
        if(req.method==='POST') {
          const data=await body(req);
          const saves={ '/api/admin/curricula':store.saveCurriculum,'/api/admin/courses':store.saveCourse,'/api/admin/mappings':store.saveMapping };
          const deletion=url.pathname.match(/^\/api\/admin\/(curricula|courses|mappings)\/delete$/);
          if(deletion) return json(res,200,store.deleteRecord(deletion[1],data.id));
          const clearMatch=url.pathname.match(/^\/api\/admin\/(curricula|courses|mappings|student-transfers)\/clear$/);
          if(clearMatch) return json(res,200,store.clearRecords(clearMatch[1]==='student-transfers'?'student_transfers':clearMatch[1],data));
          if(saves[url.pathname]) return json(res,200,saves[url.pathname](data));
          if(url.pathname==='/api/admin/import') return json(res,200,store.importData(data.data,data.dryRun!==false));
          if(url.pathname==='/api/admin/student-transfers/save') return json(res,200,store.saveStudentTransfer(data));
          if(url.pathname==='/api/admin/student-transfers/delete') return json(res,200,store.deleteStudentTransfer(data.studentId || data.id));
        }
        throw new AppError('ไม่พบเส้นทางที่ร้องขอ',404);
      }
      if(url.pathname==='/api/curricula' && req.method==='GET') return json(res,200,store.catalog().curricula);
      if(session.user.role!=='student') throw new AppError('ฟังก์ชันนี้สำหรับบัญชีนักศึกษา',403);
      if(url.pathname==='/api/student/verify-transfer' && req.method==='POST') {
        const data=await body(req);
        return json(res,200,store.verifyStudentTransfer(data.studentId, data.courses, session.user.id));
      }
      if(url.pathname==='/api/check' && req.method==='POST') {
        const data=await body(req);
        if(data.reviewed!==true) throw new AppError('กรุณายืนยันการตรวจทานข้อมูลก่อนตรวจสอบ');
        return json(res,201,store.saveCheck(session.user.id,data.curriculumId,data.courses));
      }
      if(url.pathname==='/api/history' && req.method==='GET') return json(res,200,store.db.prepare('SELECT id,created_at,year,curriculum_name FROM checks WHERE user_id=? ORDER BY created_at DESC LIMIT 100').all(session.user.id));
      if(/^\/api\/history\/[a-f0-9-]+$/.test(url.pathname) && req.method==='GET') {
        const record=store.db.prepare('SELECT id,created_at,year,curriculum_name,results FROM checks WHERE id=? AND user_id=?').get(url.pathname.split('/').pop(),session.user.id);
        if(!record) throw new AppError('ไม่พบประวัติการตรวจสอบ',404);
        return json(res,200,{...record,results:JSON.parse(record.results)});
      }
      throw new AppError('ไม่พบเส้นทางที่ร้องขอ',404);

    } catch(error) {
      if(res.headersSent) { res.end(); return; }
      const duplicate=error.code==='ERR_SQLITE_ERROR' && /UNIQUE constraint/.test(error.message);
      const known=error instanceof AppError || /^กรุณา/.test(error.message);
      json(res,duplicate?409:known?(error.status || 400):500,{error:duplicate?'มีข้อมูลรหัสหรือปีนี้อยู่แล้ว กรุณาแก้ไขรายการเดิม':known?error.message:'ไม่สามารถดำเนินการได้ กรุณาลองอีกครั้ง'});
    }
  });
  server.requestTimeout=30_000;
  server.headersTimeout=15_000;
  return server;
}
module.exports={createApp};

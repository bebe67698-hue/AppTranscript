const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const files=['app.js','matching.js'];
for(const dir of ['server','shared','portal','scripts','tests']) if(fs.existsSync(dir)) for(const file of fs.readdirSync(dir)) if(/\.(c?js)$/.test(file)) files.push(path.join(dir,file));
for(const file of files){const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(result.status!==0)process.exit(1);}
console.log(`Syntax checked ${files.length} JavaScript files.`);

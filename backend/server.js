import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const {Pool}=pg;
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const app=express();
const PORT=Number(process.env.PORT||10000);
const JWT_SECRET=process.env.JWT_SECRET||'dev-only-change-me';
const ADMIN_EMAIL=(process.env.ADMIN_EMAIL||'bashashascodaryschool@gmail.com').toLowerCase();
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||'';
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL?.includes('localhost')?false:{rejectUnauthorized:false}});

app.set('trust proxy',1);
app.use(helmet({crossOriginResourcePolicy:{policy:'cross-origin'}}));
app.use(cors({origin:true,credentials:true}));
app.use(express.json({limit:'12mb'}));
app.use(rateLimit({windowMs:15*60*1000,max:300,standardHeaders:true,legacyHeaders:false}));

const schema=fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8');
async function init(){
 if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
 await pool.query(schema);
 if(ADMIN_PASSWORD){
   const hash=await bcrypt.hash(ADMIN_PASSWORD,12);
   await pool.query(`insert into users(email,password_hash,role,display_name) values($1,$2,'admin','Bashasha Secondary School Administrator')
     on conflict(email) do update set role='admin',display_name='Bashasha Secondary School Administrator',password_hash=$2`,[ADMIN_EMAIL,hash]);
 }
}
function auth(roles=[]){
 return (req,res,next)=>{
   try{
     const token=(req.headers.authorization||'').replace(/^Bearer\s+/,'');
     const user=jwt.verify(token,JWT_SECRET);
     if(roles.length&&!roles.includes(user.role)) return res.status(403).json({error:'Access denied'});
     req.user=user; next();
   }catch{return res.status(401).json({error:'Unauthorized'});}
 };
}
function validateFayda(v){return /^[0-9]{16}$/.test(String(v||''));}
function normalizeGrade(v){return Number(String(v||'').replace(/^Grade\s*/i,''));}
function validSection(v){return ['Section A','Section B','Section C','Section D'].includes(v);}
function publicStudent(s){
 return {studentId:s.student_id,fullName:s.full_name,firstName:s.first_name,middleName:s.middle_name,lastName:s.last_name,
 gender:s.gender,dob:s.dob,faydaId:s.fayda_id,phone:s.phone,country:s.country,region:s.region,city:s.city,woreda:s.woreda,
 subCityOrZone:s.sub_city_or_zone,kebele:s.kebele,specificAddress:s.specific_address,academicYear:s.academic_year,
 grade:s.grade,section:s.section,studyOption:s.study_option,studentPhotoUrl:s.student_photo_url,
 guardian:{name:s.guardian_full_name,phone:s.guardian_phone,faydaId:s.guardian_fayda_id,country:s.guardian_country,
 region:s.guardian_region,city:s.guardian_city,woreda:s.guardian_woreda,subCityOrZone:s.guardian_sub_city_or_zone,
 kebele:s.guardian_kebele,specificAddress:s.guardian_specific_address,photoUrl:s.guardian_photo_url}};
}
app.get('/api/health',(req,res)=>res.json({ok:true,school:'Bashasha Secondary School',database:!!process.env.DATABASE_URL}));

app.post('/api/auth/login',async(req,res)=>{
 try{
  const email=String(req.body.email||'').trim().toLowerCase(), password=String(req.body.password||'');
  if(!email||!password) return res.status(400).json({error:'Email and password are required'});
  const q=await pool.query('select id,email,password_hash,role,display_name from users where lower(email)=lower($1)',[email]);
  if(!q.rowCount||!(await bcrypt.compare(password,q.rows[0].password_hash))) return res.status(401).json({error:'Invalid email or password.'});
  const u=q.rows[0]; const token=jwt.sign({id:u.id,email:u.email,role:u.role},JWT_SECRET,{expiresIn:'8h'});
  res.json({token,user:{id:u.id,email:u.email,role:u.role,displayName:u.display_name}});
 }catch(e){res.status(500).json({error:'Unable to sign in right now. Please try again.'});}
});

app.post('/api/applications',async(req,res)=>{
 try{
  const b=req.body,g=normalizeGrade(b.grade);
  if(!validateFayda(b.faydaId)||!validateFayda(b.guardianFaydaId)) return res.status(400).json({error:'Fayda ID must contain exactly 16 digits.'});
  if(!['Male','Female'].includes(b.gender)||!g||!validSection(b.section)) return res.status(400).json({error:'Please provide valid student information.'});
  if([11,12].includes(g)&&!['Natural Science','Social Science','Regular'].includes(b.studyOption)) return res.status(400).json({error:'Study option is required for Grade 11 and Grade 12.'});
  if([9,10].includes(g)) b.studyOption=null;
  const year=String(b.academicYear||new Date().getFullYear());
  const count=await pool.query('select count(*)::int as n from applications where academic_year=$1',[year]);
  const aid='APP-'+year+'-'+String(count.rows[0].n+1).padStart(5,'0');
  const q=await pool.query(`insert into applications(application_id,first_name,middle_name,last_name,gender,dob,fayda_id,phone,country,region,city,woreda,sub_city_or_zone,kebele,specific_address,academic_year,grade,section,study_option,student_photo_url,guardian_full_name,guardian_phone,guardian_fayda_id,guardian_country,guardian_region,guardian_city,guardian_woreda,guardian_sub_city_or_zone,guardian_kebele,guardian_specific_address,guardian_photo_url)
  values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31) returning application_id,status`,
  [aid,b.firstName,b.middleName||null,b.lastName,b.gender,b.dob,b.faydaId,b.phone,b.country||'Ethiopia',b.region,b.city,b.woreda,b.subCityOrZone||null,b.kebele||null,b.specificAddress||null,year,g,b.section,b.studyOption||null,b.studentPhotoUrl||null,b.guardianName,b.guardianPhone,b.guardianFaydaId,b.guardianCountry||'Ethiopia',b.guardianRegion,b.guardianCity,b.guardianWoreda,b.guardianSubCityOrZone||null,b.guardianKebele||null,b.guardianSpecificAddress||null,b.guardianPhotoUrl||null]);
  res.status(201).json({applicationId:q.rows[0].application_id,status:q.rows[0].status});
 }catch(e){res.status(500).json({error:e.message});}
});

app.get('/api/applications/status/:id',async(req,res)=>{
 const q=await pool.query('select application_id,student_id,first_name,middle_name,last_name,grade,academic_year,status from applications where application_id=$1 or student_id=$1',[req.params.id]);
 if(!q.rowCount)return res.status(404).json({error:'Application ID not found.'});res.json(q.rows[0]);
});
app.get('/api/applications',auth(['admin','teacher']),async(req,res)=>res.json((await pool.query('select * from applications order by created_at desc')).rows));
app.patch('/api/applications/:id/status',auth(['admin']),async(req,res)=>{
 const status=req.body.status;
 if(!['Pending','Accepted','Rejected'].includes(status))return res.status(400).json({error:'Invalid status'});
 const c=await pool.connect();
 try{
  await c.query('begin');
  const a=(await c.query('select * from applications where id=$1 for update',[req.params.id])).rows[0];
  if(!a){await c.query('rollback');return res.status(404).json({error:'Application not found'});}
  if(status==='Accepted'&&!a.student_id){
   const n=(await c.query('select coalesce(max(right(student_id,4)::int),0)+1 n from students where academic_year=$1',[a.academic_year])).rows[0].n;
   const sid='BSS-'+a.academic_year+'-'+String(n).padStart(4,'0');
   await c.query(`insert into students(student_id,application_id,first_name,middle_name,last_name,full_name,gender,dob,fayda_id,phone,country,region,city,woreda,sub_city_or_zone,kebele,specific_address,academic_year,grade,section,study_option,student_photo_url,guardian_full_name,guardian_phone,guardian_fayda_id,guardian_country,guardian_region,guardian_city,guardian_woreda,guardian_sub_city_or_zone,guardian_kebele,guardian_specific_address,guardian_photo_url)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33)`,
   [sid,a.id,a.first_name,a.middle_name,a.last_name,[a.first_name,a.middle_name,a.last_name].filter(Boolean).join(' '),a.gender,a.dob,a.fayda_id,a.phone,a.country,a.region,a.city,a.woreda,a.sub_city_or_zone,a.kebele,a.specific_address,a.academic_year,a.grade,a.section,a.study_option,a.student_photo_url,a.guardian_full_name,a.guardian_phone,a.guardian_fayda_id,a.guardian_country,a.guardian_region,a.guardian_city,a.guardian_woreda,a.guardian_sub_city_or_zone,a.guardian_kebele,a.guardian_specific_address,a.guardian_photo_url]);
   await c.query('update applications set status=$1,student_id=$2,updated_at=now() where id=$3',[status,sid,a.id]);
   await c.query('commit'); return res.json({ok:true,studentId:sid,status});
  }
  await c.query('update applications set status=$1,updated_at=now() where id=$2',[status,a.id]);
  await c.query('commit');res.json({ok:true,status});
 }catch(e){await c.query('rollback');res.status(500).json({error:e.message});}finally{c.release();}
});
app.post('/api/applications/:id/accept',auth(['admin']),async(req,res)=>{const c=await pool.connect();try{await c.query('begin');const a=(await c.query('select * from applications where id=$1 for update',[req.params.id])).rows[0];if(!a){await c.query('rollback');return res.status(404).json({error:'Application not found'});}if(!a.student_id){const n=(await c.query("select coalesce(max(right(student_id,4)::int),0)+1 n from students where academic_year=$1",[a.academic_year])).rows[0].n;const sid='BSS-'+a.academic_year+'-'+String(n).padStart(4,'0');await c.query(`insert into students(student_id,application_id,first_name,middle_name,last_name,full_name,gender,dob,fayda_id,phone,country,region,city,woreda,sub_city_or_zone,kebele,specific_address,academic_year,grade,section,study_option,student_photo_url,guardian_full_name,guardian_phone,guardian_fayda_id,guardian_country,guardian_region,guardian_city,guardian_woreda,guardian_sub_city_or_zone,guardian_kebele,guardian_specific_address,guardian_photo_url) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33)`,[sid,a.id,a.first_name,a.middle_name,a.last_name,[a.first_name,a.middle_name,a.last_name].filter(Boolean).join(' '),a.gender,a.dob,a.fayda_id,a.phone,a.country,a.region,a.city,a.woreda,a.sub_city_or_zone,a.kebele,a.specific_address,a.academic_year,a.grade,a.section,a.study_option,a.student_photo_url,a.guardian_full_name,a.guardian_phone,a.guardian_fayda_id,a.guardian_country,a.guardian_region,a.guardian_city,a.guardian_woreda,a.guardian_sub_city_or_zone,a.guardian_kebele,a.guardian_specific_address,a.guardian_photo_url]);await c.query('update applications set status=$1,student_id=$2,updated_at=now() where id=$3',['Accepted',sid,a.id]);await c.query('commit');return res.json({ok:true,studentId:sid,status:'Accepted'});}await c.query('update applications set status=$1,updated_at=now() where id=$2',['Accepted',a.id]);await c.query('commit');res.json({ok:true,studentId:a.student_id,status:'Accepted'});}catch(e){await c.query('rollback');res.status(500).json({error:e.message});}finally{c.release();}});

app.get('/api/students',auth(['admin','teacher']),async(req,res)=>res.json((await pool.query('select * from students order by admission_date desc,student_id')).rows));
app.get('/api/students/:studentId',auth(['admin','teacher']),async(req,res)=>{const q=await pool.query('select * from students where student_id=$1',[req.params.studentId]);if(!q.rowCount)return res.status(404).json({error:'Student not found'});res.json(q.rows[0]);});

app.get('/api/subjects',async(req,res)=>{
 const p=[];let sql='select * from subjects where 1=1';
 if(req.query.grade){p.push(normalizeGrade(req.query.grade));sql+=' and grade=$'+p.length;}
 if(req.query.section){p.push(req.query.section);sql+=' and section=$'+p.length;}
 if(req.query.studyOption){p.push(req.query.studyOption);sql+=' and coalesce(study_option,\'\')=coalesce($'+p.length+',\'\')';}
 res.json((await pool.query(sql+' order by grade,section,subject_name',p)).rows);
});
app.post('/api/subjects',auth(['admin','teacher']),async(req,res)=>{
 const b=req.body,g=normalizeGrade(b.grade);
 if(!g||!validSection(b.section)||!b.subjectName||!Number(b.maximumMark))return res.status(400).json({error:'Invalid subject data'});
 const option=[11,12].includes(g)?b.studyOption:null;
 try{const q=await pool.query('insert into subjects(grade,section,study_option,subject_name,subject_code,maximum_mark) values($1,$2,$3,$4,$5,$6) returning *',[g,b.section,option,b.subjectName,b.subjectCode||null,b.maximumMark]);res.status(201).json(q.rows[0]);}catch(e){res.status(400).json({error:e.message});}
});
app.put('/api/subjects/:id',auth(['admin','teacher']),async(req,res)=>{const b=req.body;const q=await pool.query('update subjects set subject_name=$1,subject_code=$2,maximum_mark=$3 where id=$4 returning *',[b.subjectName,b.subjectCode||null,b.maximumMark,req.params.id]);if(!q.rowCount)return res.status(404).json({error:'Subject not found'});res.json(q.rows[0]);});
app.delete('/api/subjects/:id',auth(['admin']),async(req,res)=>{const dep=await pool.query('select 1 from marks where subject_id=$1 limit 1',[req.params.id]);if(dep.rowCount)return res.status(409).json({error:'Cannot delete a subject that already has marks.'});await pool.query('delete from subjects where id=$1',[req.params.id]);res.json({ok:true});});

async function resultFor(s){
 const rows=(await pool.query(`select sub.id,sub.subject_name,sub.subject_code,sub.maximum_mark,m.mark,m.id as mark_id from subjects sub left join marks m on m.subject_id=sub.id and m.student_id=$1 and m.academic_year=$2 where sub.grade=$3 and sub.section=$4 and coalesce(sub.study_option,'')=coalesce($5,'') order by sub.subject_name`,[s.id,s.academic_year,s.grade,s.section,s.study_option])).rows;
 const graded=rows.filter(x=>x.mark!==null), total=graded.reduce((n,x)=>n+Number(x.mark),0), maxTotal=graded.reduce((n,x)=>n+Number(x.maximum_mark),0);
 const average=maxTotal?Number((total/maxTotal*100).toFixed(2)):0;
 const threshold=Number((await pool.query('select pass_threshold from school_settings where id=1')).rows[0]?.pass_threshold||50);
 let status='NOT GRADED';if(graded.length&&graded.length<rows.length)status='INCOMPLETE';else if(graded.length===rows.length&&rows.length)status=average>=threshold?'PASS':'FAIL';
 return {subjects:rows.map(x=>({id:x.id,subjectName:x.subject_name,subjectCode:x.subject_code,mark:x.mark===null?0:Number(x.mark),maximumMark:Number(x.maximum_mark),status:x.mark===null?'Not Graded':'Graded'})),total,maxTotal,average,status};
}
app.get('/api/results/:studentId',async(req,res)=>{
 const q=await pool.query('select * from students where student_id=$1',[req.params.studentId]);if(!q.rowCount)return res.status(404).json({error:'Student ID not found.'});
 const s=q.rows[0];res.json({student:publicStudent(s),result:await resultFor(s)});
});
app.get('/api/admin/results/:studentId',auth(['admin','teacher']),async(req,res)=>{const q=await pool.query('select * from students where student_id=$1',[req.params.studentId]);if(!q.rowCount)return res.status(404).json({error:'Student not found'});res.json({student:q.rows[0],result:await resultFor(q.rows[0])});});
app.post('/api/marks',auth(['admin','teacher']),async(req,res)=>{
 const b=req.body;
 const s=(await pool.query('select * from students where student_id=$1',[b.studentId])).rows[0];
 if(!s)return res.status(404).json({error:'Student not found'});
 const sub=(await pool.query('select * from subjects where id=$1',[b.subjectId])).rows[0];if(!sub)return res.status(404).json({error:'Subject not found'});
 const mark=b.mark===''||b.mark===null?null:Number(b.mark);if(mark!==null&&(!Number.isFinite(mark)||mark<0||mark>Number(sub.maximum_mark)))return res.status(400).json({error:'Mark must be between 0 and the maximum mark.'});
 await pool.query(`insert into marks(student_id,subject_id,academic_year,mark,maximum_mark) values($1,$2,$3,$4,$5)
 on conflict(student_id,subject_id,academic_year) do update set mark=excluded.mark,maximum_mark=excluded.maximum_mark,updated_at=now()`,[s.id,sub.id,s.academic_year,mark,sub.maximum_mark]);
 res.json({ok:true});
});

app.get('/api/announcements',async(req,res)=>res.json((await pool.query('select * from announcements where published=true order by created_at desc')).rows));
app.post('/api/announcements',auth(['admin','teacher']),async(req,res)=>{const b=req.body;const q=await pool.query('insert into announcements(title,title_om,title_am,body,body_om,body_am,image_url,published) values($1,$2,$3,$4,$5,$6,$7,$8) returning *',[b.title,b.titleOm,b.titleAm,b.body,b.bodyOm,b.bodyAm,b.imageUrl||null,b.published!==false]);res.status(201).json(q.rows[0]);});
app.put('/api/announcements/:id',auth(['admin','teacher']),async(req,res)=>{const b=req.body;const q=await pool.query('update announcements set title=$1,body=$2,published=$3 where id=$4 returning *',[b.title,b.body,b.published!==false,req.params.id]);res.json(q.rows[0]);});
app.delete('/api/announcements/:id',auth(['admin']),async(req,res)=>{await pool.query('delete from announcements where id=$1',[req.params.id]);res.json({ok:true});});

app.get('/api/gallery',async(req,res)=>res.json((await pool.query('select * from gallery order by created_at desc')).rows));
app.post('/api/gallery',auth(['admin','teacher']),async(req,res)=>{const q=await pool.query('insert into gallery(title,image_url) values($1,$2) returning *',[req.body.title||null,req.body.imageUrl]);res.status(201).json(q.rows[0]);});
app.delete('/api/gallery/:id',auth(['admin']),async(req,res)=>{await pool.query('delete from gallery where id=$1',[req.params.id]);res.json({ok:true});});

app.get('/api/hero',async(req,res)=>res.json((await pool.query('select hero_image_url from school_settings where id=1')).rows[0]||{}));
app.patch('/api/hero',auth(['admin']),async(req,res)=>{await pool.query('update school_settings set hero_image_url=$1,updated_at=now() where id=1',[req.body.imageUrl||null]);res.json({ok:true});});

app.post('/api/messages',async(req,res)=>{if(!req.body.message)return res.status(400).json({error:'Message required'});await pool.query('insert into messages(name,phone,email,message) values($1,$2,$3,$4)',[req.body.name,req.body.phone,req.body.email,req.body.message]);res.status(201).json({ok:true});});
app.get('/api/messages',auth(['admin']),async(req,res)=>res.json((await pool.query('select * from messages order by created_at desc')).rows));

app.get('/api/settings',async(req,res)=>res.json((await pool.query('select * from school_settings where id=1')).rows[0]));
app.patch('/api/settings',auth(['admin']),async(req,res)=>{const b=req.body;const q=await pool.query('update school_settings set school_name=coalesce($1,school_name),phone=coalesce($2,phone),email=coalesce($3,email),address=coalesce($4,address),pass_threshold=coalesce($5,pass_threshold),academic_year=coalesce($6,academic_year),updated_at=now() where id=1 returning *',[b.schoolName,b.phone,b.email,b.address,b.passThreshold,b.academicYear]);res.json(q.rows[0]);});

app.get('/api/export/students.csv',auth(['admin','teacher']),async(req,res)=>{
 const rows=(await pool.query('select student_id,full_name,gender,dob,fayda_id,phone,country,region,city,woreda,sub_city_or_zone,kebele,specific_address,academic_year,grade,section,study_option,guardian_full_name,guardian_phone,guardian_fayda_id,status from students order by student_id')).rows;
 const cols=Object.keys(rows[0]||{student_id:''});const esc=v=>'"'+String(v??'').replaceAll('"','""')+'"';
 const csv=[cols.join(','),...rows.map(r=>cols.map(c=>esc(r[c])).join(','))].join('\n');
 res.setHeader('Content-Type','text/csv');res.setHeader('Content-Disposition','attachment; filename="bashasha-students.csv"');res.send(csv);
});

app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'Internal server error'});});
app.use(express.static(path.join(__dirname,'..')));
app.get('*',(req,res,next)=>{ if(req.path.startsWith('/api/')) return next(); res.sendFile(path.join(__dirname,'..','index.html')); });
init().then(()=>app.listen(PORT,'0.0.0.0',()=>console.log('Bashasha school online on '+PORT))).catch(e=>{console.error(e);process.exit(1)});

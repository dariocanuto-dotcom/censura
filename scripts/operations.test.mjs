import test from 'node:test';
import assert from 'node:assert/strict';
import {reportWindow,completedWindow} from '../artifacts/api-server/src/lib/report-period.ts';
import {mkdir,mkdtemp,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import ExcelJS from '../artifacts/api-server/node_modules/exceljs/excel.js';

test('dia usa meia-noite de Brasília e 24 horas',()=>{
 const window=reportWindow('day','2026-10-13');assert.equal(window.start,'2026-10-13T03:00:00.000Z');assert.equal(Date.parse(window.end)-Date.parse(window.start),86400000);
});
test('semana de domingo pertence à segunda anterior',()=>{
 const window=reportWindow('week','2026-10-18');assert.equal(window.start,'2026-10-12T03:00:00.000Z');assert.equal(window.end,'2026-10-19T03:00:00.000Z');
});
test('mês respeita fevereiro bissexto e virada anual',()=>{
 const leap=reportWindow('month','2024-02-20');assert.equal(Date.parse(leap.end)-Date.parse(leap.start),29*86400000);
 assert.equal(reportWindow('month','2026-12-20').end,'2027-01-01T03:00:00.000Z');
});
test('agendamento seleciona o período anterior completo',()=>{
 const now=new Date('2026-11-01T03:00:01Z');assert.equal(completedWindow('day',now).start,'2026-10-31T03:00:00.000Z');assert.equal(completedWindow('month',now).start,'2026-10-01T03:00:00.000Z');
 assert.equal(completedWindow('week',new Date('2026-10-19T03:00:00Z')).end,'2026-10-19T03:00:00.000Z');
});
test('rejeita datas impossíveis e períodos inválidos',()=>{
 assert.throws(()=>reportWindow('day','2026-02-30'));assert.throws(()=>reportWindow('year','2026-10-13'));
});
test('serviço persiste credenciais, evita alertas duplicados e gera Excel com BTS/EPG',async()=>{
 const original=process.cwd(),savedDate=Date,url=pathToFileURL(resolve('artifacts/api-server/src/lib/operations.ts')).href,recUrl=pathToFileURL(resolve('artifacts/api-server/src/lib/recordings.ts')).href;
 await mkdir(resolve('.runtime'),{recursive:true});const temporary=await mkdtemp(resolve('.runtime/operations-test-'));process.chdir(temporary);
 let service,recordings;const savedFetch=globalThis.fetch,requests=[];
 let failDocument=false;
 globalThis.fetch=async(url,init)=>{requests.push({url,init});const ok=!(failDocument&&url.endsWith('sendDocument'));return new Response(JSON.stringify({ok,description:ok?undefined:'Simulated failure'}),{status:ok?200:500,headers:{'Content-Type':'application/json'}});};
 try{
  const channel={id:'1',name:'TV Feliz HD',url:'udp://127.0.0.1:19000',directory:resolve('gravacoes'),enabled:false,codec:'h264',format:'mp4',videoKbps:384,audioKbps:64,retentionDays:30,width:640,height:360,blockMinutes:10};
  await mkdir('.runtime/recording-service',{recursive:true});await writeFile('.runtime/recording-service/state.json',JSON.stringify({channels:[channel],files:[],audit:[]}));
  service=await import(url);recordings=await import(recUrl);await service.initOperations();
  await service.configureOperations({token:'123456789:abcdefghijklmnopqrstuvwxyz_123456',chatId:'-100123456789',daily:false,weekly:false,monthly:false});
  await service.observeRecordings(recordings.status());
  assert(!('token' in service.operationsConfig()));
  const cfg=JSON.parse(await readFile('.runtime/recording-service/operations/config.json','utf8'));assert.equal(cfg.chatId,'-100123456789');
  await assert.rejects(service.configureOperations({inputAlert:false,daily:'invalid'}));assert.equal(service.operationsConfig().inputAlert,true);
  await service.registerInput('test-client',{id:'one',name:'TV Feliz HD'});assert.equal(service.operationsConfig().pendingAlerts,0);
  await service.registerInput('test-client',{id:'two',name:'Reserva'});assert.equal(service.operationsConfig().pendingAlerts,1);
  await service.registerInput('test-client',{id:'two',name:'Reserva'});assert.equal(service.operationsConfig().pendingAlerts,1);
  await service.runOperationsCycle();assert.equal(requests.length,1);assert.equal(service.operationsConfig().pendingAlerts,0);
  const baseline=recordings.status();const failed={...baseline,audit:[...baseline.audit,{channelId:'1',time:new Date().toISOString(),action:'failure',detail:'Input disconnected'}],channels:baseline.channels.map(c=>({...c,enabled:true,running:false,error:'Disconnected'}))};
  await service.observeRecordings(failed);await service.observeRecordings(failed);assert.equal(service.operationsConfig().pendingAlerts,1);
  await service.runOperationsCycle();assert.equal(requests.length,2);
  await service.observeRecordings({...baseline,channels:baseline.channels.map(c=>({...c,enabled:true,running:true,activeBlock:{name:'block.mp4',start:new Date().toISOString(),end:new Date().toISOString(),bytes:256}}))});
  await service.runOperationsCycle();assert.equal(requests.length,3);assert(JSON.parse(requests[2].init.body).text.includes('Gravação retomada'));
  await service.registerSnapshot({source:'TV Feliz HD',program:'23584',checks:[{label:'Áudio',status:'ok',detalhe:'2 canais'}],epg:[{eventId:1,serviceId:23584,title:'Programa',startTime:new Date().toISOString(),durationSec:3600}]});
  await service.configureOperations({videoAlert:false});assert.equal(await service.recordBroadcastAlert('video','Vídeo','Falha','TV Feliz HD'),false);
  await service.configureOperations({videoAlert:true});for(const type of ['video','audio','closed_caption'])assert.equal(await service.recordBroadcastAlert(type,type,'Falha','TV Feliz HD'),true);
  const report=await service.operationalReport('moment');const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(report.buffer);
  assert.deepEqual(workbook.worksheets.map(s=>s.name),['Resumo','Alertas','Gravações','BTS','EPG']);assert.equal(workbook.getWorksheet('BTS').getCell('F2').value,'2 canais');assert.equal(workbook.getWorksheet('EPG').getCell('F2').value,'Programa');assert(workbook.getWorksheet('Alertas').getSheetValues().some(row=>row&&row[2]==='Closed Caption'));
  await service.sendOperationalReport('moment');assert.equal(requests.length,4);assert(requests[3].init.body instanceof FormData);
  await service.configureOperations({daily:true});let future=savedDate.now()+86400000;
  globalThis.Date=class extends savedDate {constructor(...args){if(args.length)super(...args);else super(future);}static now(){return future;}};
  failDocument=true;await service.runOperationsCycle();assert.equal(requests.length,5);assert(service.operationsConfig().lastReportError);
  failDocument=false;future+=61000;await service.runOperationsCycle();assert.equal(requests.length,6);assert.equal(service.operationsConfig().lastReportError,null);
  future+=61000;await service.runOperationsCycle();assert.equal(requests.length,6,'Relatório agendado foi duplicado');
  globalThis.Date=savedDate;
 }finally{globalThis.Date=savedDate;if(service)await service.stopOperations();if(recordings)await recordings.shutdownRecordings();globalThis.fetch=savedFetch;process.chdir(original);}
});

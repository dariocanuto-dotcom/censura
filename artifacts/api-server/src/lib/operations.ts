import {appendFile,mkdir,readFile,writeFile,rename,readdir,unlink} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import ExcelJS from 'exceljs';
import {initRecordings,status} from './recordings.ts';
import {reportWindow,completedWindow,type ReportPeriod} from './report-period.ts';

const root=resolve('.runtime/recording-service/operations');
interface Config {token:string;chatId:string;videoAlert:boolean;audioAlert:boolean;ccAlert:boolean;recordingAlert:boolean;inputAlert:boolean;daily:boolean;weekly:boolean;monthly:boolean;enabledAt:string}
interface Event {id:string;time:string;type:string;channel?:string;detail?:string;data?:any}
interface Notice {event:Event;attempts:number;retryAt:number}
interface State {startedAt:string;seenBlocks:string[];deliveredReports:string[];notices:Notice[];lastReportError?:string}
let config:Config={token:'',chatId:'',videoAlert:true,audioAlert:true,ccAlert:true,recordingAlert:true,inputAlert:true,daily:true,weekly:true,monthly:true,enabledAt:new Date().toISOString()};
let state:State={startedAt:new Date().toISOString(),seenBlocks:[],deliveredReports:[],notices:[]};
let initializing:Promise<void>|undefined,timer:ReturnType<typeof setInterval>|undefined;
let busy=false,saveQueue=Promise.resolve(),stopped=false;
const seenAudit=new Set<string>(),seenBlocks=new Set<string>(),incidents=new Set<string>();
const previousInputs=new Map<string,string>(),clientInputs=new Map<string,{id:string;name:string;fingerprint?:string}>();
let lastSample=0,lastSnapshot=0;
let latestSnapshot:any=null;
const local=(iso:string)=>new Date(iso).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
function save(){saveQueue=saveQueue.catch(()=>{}).then(async()=>{await mkdir(root,{recursive:true});for(const [name,value] of [['config',config],['state',state]] as const){await writeFile(join(root,name+'.json.tmp'),JSON.stringify(value),{mode:0o600});await rename(join(root,name+'.json.tmp'),join(root,name+'.json'));}});return saveQueue;}
async function journal(event:Event){await mkdir(join(root,'history'),{recursive:true});await appendFile(join(root,'history',event.time.slice(0,10)+'.jsonl'),JSON.stringify(event)+'\n',{mode:0o600});}
async function event(type:string,detail:string,channel?:string,data?:any,notify=false){
 const entry:Event={id:randomUUID(),time:new Date().toISOString(),type,detail:detail.replace(/(passphrase|password|token)=([^\s&]+)/gi,'$1=***'),channel,data};await journal(entry);
 if(notify){state.notices.push({event:entry,attempts:0,retryAt:0});await save();}
 return entry;
}
async function telegram(method:string,body:unknown){
 if(!config.token||!config.chatId)throw new Error('Telegram não configurado no servidor.');
 const response=await fetch(`https://api.telegram.org/bot${config.token}/${method}`,{method:'POST',headers:body instanceof FormData?undefined:{'Content-Type':'application/json'},body:body instanceof FormData?body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 const result=await response.json() as {ok:boolean;description?:string};
 if(!response.ok||!result.ok)throw new Error(result.description??`Telegram HTTP ${response.status}`);
}
async function deliverNotices(){
 if(!config.token||!config.chatId)return;
 for(const notice of state.notices.slice(0,3)){
  if(notice.retryAt>Date.now())continue;
  try{await telegram('sendMessage',{chat_id:config.chatId,text:`CENSURA PRO\n${notice.event.type==='input'?'Mudança de entrada':notice.event.type==='recovered'?'Gravação retomada':'Gravação interrompida'}\n${notice.event.channel??''}\n${notice.event.detail??''}\n${local(notice.event.time)}`});state.notices=state.notices.filter(n=>n!==notice);await save();}
  catch{notice.attempts++;notice.retryAt=Date.now()+Math.min(300000,30000*notice.attempts);await save();}
 }
}
export function serverTelegramCredentials(){return config.token&&config.chatId?{token:config.token,chatId:config.chatId}:undefined;}
export function operationsConfig(){const {token,...publicConfig}=config;return {...publicConfig,telegramConfigured:Boolean(token&&config.chatId),startedAt:state.startedAt,pendingAlerts:state.notices.length,lastReportError:state.lastReportError??null};}
export async function configureOperations(input:Partial<Config>){
 await initOperations();
 if(input.token?.trim()&&!/^\d+:[A-Za-z0-9_-]{20,}$/.test(input.token.trim()))throw new Error('Token do Telegram inválido.');
 if(input.chatId!==undefined&&!/^-?\d+$/.test(input.chatId.trim()))throw new Error('Chat ID inválido.');
 for(const key of ['videoAlert','audioAlert','ccAlert','recordingAlert','inputAlert','daily','weekly','monthly'] as const)if(input[key]!==undefined&&typeof input[key]!=='boolean')throw new Error('Opção inválida.');
 for(const key of ['videoAlert','audioAlert','ccAlert','recordingAlert','inputAlert','daily','weekly','monthly'] as const)if(input[key]!==undefined){if(typeof input[key]!=='boolean')throw new Error('Opção inválida.');if(['daily','weekly','monthly'].includes(key)&&!config[key]&&input[key])config.enabledAt=new Date().toISOString();config[key]=input[key]!;}
 if(input.token?.trim()){if(!/^\d+:[A-Za-z0-9_-]{20,}$/.test(input.token.trim()))throw new Error('Token do Telegram inválido.');config.token=input.token.trim();}
 if(input.chatId!==undefined){if(!/^-?\d+$/.test(input.chatId.trim()))throw new Error('Chat ID inválido.');config.chatId=input.chatId.trim();}
 await save();return operationsConfig();
}
const broadcastHistory=new Map<string,number>();
export async function recordBroadcastAlert(type:string,title:string,message:string,source?:string){
 await initOperations();
 const flags:Record<string,'videoAlert'|'audioAlert'|'ccAlert'>={video:'videoAlert',audio:'audioAlert',closed_caption:'ccAlert'};
 const flag=flags[type];
 if(flag&&!config[flag])return false;
 if(flag){const key=JSON.stringify([type,source,title]);if(Date.now()-(broadcastHistory.get(key)??0)>30000){broadcastHistory.set(key,Date.now());await event(type,`${title}: ${message}`,source);}if(broadcastHistory.size>500)broadcastHistory.clear();}
 return true;
}
export async function registerInput(clientId:string,source:{id:string;name:string;fingerprint?:string}){
 await initOperations();if(typeof clientId!=='string'||!clientId||clientId.length>100||typeof source?.id!=='string'||typeof source.name!=='string'||!source.id||!source.name||source.name.length>200||(source.fingerprint!==undefined&&(typeof source.fingerprint!=='string'||source.fingerprint.length>2000)))throw new Error('Entrada inválida.');
 const previous=clientInputs.get(clientId);clientInputs.set(clientId,source);
 if(clientInputs.size>200)clientInputs.delete(clientInputs.keys().next().value!);
 if(previous&&(previous.id!==source.id||previous.fingerprint!==source.fingerprint))await event('input',`${previous.name} → ${source.name}`,source.name,undefined,config.inputAlert);
}
export async function registerSnapshot(snapshot:any){
 await initOperations();if(!snapshot||typeof snapshot.source!=='string'||!Array.isArray(snapshot.checks)||snapshot.checks.length>30||!Array.isArray(snapshot.epg)||snapshot.epg.length>500)throw new Error('Auditoria inválida.');
 latestSnapshot={source:snapshot.source.slice(0,200),program:String(snapshot.program??'').slice(0,200),checks:snapshot.checks.map((c:any)=>({label:String(c.label??'').slice(0,100),status:String(c.status??'').slice(0,20),detail:String(c.detalhe??c.detail??'').slice(0,1000)})),epg:snapshot.epg.map((e:any)=>({serviceId:e.serviceId,eventId:e.eventId,startTime:e.startTime,durationSec:e.durationSec,title:String(e.title??'').slice(0,500),description:String(e.description??'').slice(0,2000)}))};
 if(Date.now()-lastSnapshot>=300000){lastSnapshot=Date.now();await event('snapshot','Auditoria BTS/EPG',latestSnapshot.source,latestSnapshot);}
}
async function readHistory(start:string,end:string){
 const events:Event[]=[];const folder=join(root,'history');
 const names:string[]=await readdir(folder).catch(()=>[] as string[]);
 for(const file of names.filter(f=>/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)&&f.slice(0,10)>=start.slice(0,10)&&f.slice(0,10)<=end.slice(0,10)).sort()){
  const lines=createInterface({input:createReadStream(join(folder,file)),crlfDelay:Infinity});
  for await(const line of lines){try{const item:Event=JSON.parse(line);if(item.time>=start&&item.time<end)events.push(item);}catch{}}
 }
 return events;
}
export async function operationalReport(period:ReportPeriod,date?:string,at=new Date()){
 await initOperations();const window=reportWindow(period,date,at);const events=await readHistory(window.start,window.end);
 const current=status(),blocks=events.filter(e=>e.type==='block');
 const workbook=new ExcelJS.Workbook();workbook.creator='CENSURA PRO';
 const summary=workbook.addWorksheet('Resumo');
 summary.addRows([['CENSURA PRO — Relatório operacional'],['Período',({moment:'No momento',day:'Dia · 24 horas',week:'Semana',month:'Mês'})[period]],['Início',local(window.start)],['Fim',local(window.end)],['Gerado em',local(at.toISOString())],['Histórico de monitoramento desde',local(state.startedAt)],['Blocos finalizados no período',blocks.length],['Tamanho total dos blocos (GB)',blocks.reduce((sum,e)=>sum+(e.data?.bytes??0),0)/1e9],['Paradas de gravação',events.filter(e=>e.type==='stopped').length],['Alertas de vídeo',events.filter(e=>e.type==='video').length],['Alertas de áudio',events.filter(e=>e.type==='audio').length],['Alertas de Closed Caption',events.filter(e=>e.type==='closed_caption').length],['Mudanças de entrada',events.filter(e=>e.type==='input').length],['Observações do gravador',events.filter(e=>e.type==='sample').length],['Observações com gravação ativa',events.filter(e=>e.type==='sample'&&e.data?.running).length],['Estado atual',current.channels[0]?.running?'Gravando':current.channels[0]?.enabled?'Aguardando / falha':'Desabilitada'],['Entrada atual de gravação',current.channels[0]?.name??'Não configurada'],['Bloco em andamento',current.channels[0]?.activeBlock?.name??'Nenhum'],['Tamanho do bloco em andamento (MB)',(current.channels[0]?.activeBlock?.bytes??0)/1e6],['Nota','Ausência de histórico não significa ausência de falhas. Dados BTS/EPG dependem do monitor ativo; gravação e alertas operacionais são monitorados pelo servidor.'],['Critério dos blocos','Blocos já finalizados com início dentro do período. O bloco em andamento não entra no total.']]);
 const alerts=workbook.addWorksheet('Alertas');alerts.addRow(['Horário Brasília','Evento','Canal','Detalhe']);for(const e of events.filter(e=>['stopped','recovered','input','video','audio','closed_caption'].includes(e.type)))alerts.addRow([local(e.time),({stopped:'Gravação interrompida',recovered:'Gravação retomada',input:'Mudança de entrada',video:'Vídeo',audio:'Áudio',closed_caption:'Closed Caption'} as Record<string,string>)[e.type]??e.type,e.channel,e.detail]);
 const recordings=workbook.addWorksheet('Gravações');recordings.addRow(['Canal','Início Brasília','Fim Brasília','Tamanho MB','Codec','Formato']);for(const e of blocks){const b=e.data;recordings.addRow([b.channel,local(b.start),local(b.end),b.bytes/1e6,b.codec,b.format]);}
 const bts=workbook.addWorksheet('BTS');bts.addRow(['Horário Brasília','Fonte','Programa','Verificação','Estado','Detalhe']);
 const epg=workbook.addWorksheet('EPG');epg.addRow(['Fonte','Programa','Evento','Início Brasília','Duração segundos','Título','Descrição']);
 const snapshots=period==='moment'&&latestSnapshot?[{time:at.toISOString(),data:latestSnapshot}]:events.filter(e=>e.type==='snapshot');
 const hours=new Map<string,any>();for(const snapshot of snapshots)hours.set(snapshot.time.slice(0,13)+snapshot.data.source,snapshot);
 const epgKeys=new Set<string>();for(const snapshot of hours.values()){
  for(const check of snapshot.data.checks)bts.addRow([local(snapshot.time),snapshot.data.source,snapshot.data.program,check.label,check.status,check.detail]);
  for(const item of snapshot.data.epg){const key=JSON.stringify([snapshot.data.source,item.serviceId,item.eventId,item.startTime]);if(epgKeys.has(key))continue;epgKeys.add(key);epg.addRow([snapshot.data.source,item.serviceId,item.eventId,item.startTime?local(item.startTime):'',item.durationSec,item.title,item.description]);}
 }
 for(const sheet of workbook.worksheets){sheet.views=[{state:'frozen',ySplit:1}];sheet.columns.forEach((column,index)=>column.width=index===sheet.columnCount-1?70:25);sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0F766E'}};sheet.eachRow(row=>row.eachCell(cell=>{cell.alignment={vertical:'top',wrapText:true};}));}
 return {buffer:Buffer.from(await workbook.xlsx.writeBuffer()),name:`CENSURA_PRO_${window.key}.xlsx`,window};
}
export async function sendOperationalReport(period:ReportPeriod,date?:string){
 const report=await operationalReport(period,date);await mkdir(join(root,'reports'),{recursive:true});await writeFile(join(root,'reports',report.name),report.buffer,{mode:0o600});const form=new FormData();form.set('chat_id',config.chatId);form.set('caption',`CENSURA PRO — ${period==='moment'?'No momento':period}\n${local(report.window.start)} a ${local(report.window.end)}`);form.set('document',new Blob([new Uint8Array(report.buffer)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),report.name);await telegram('sendDocument',form);return report.name;
}
async function schedules(){
 if(!config.token||!config.chatId)return;
 for(const [flag,period] of [['daily','day'],['weekly','week'],['monthly','month']] as const){
  if(!config[flag])continue;const window=completedWindow(period);
  if(Date.parse(window.end)<=Date.parse(config.enabledAt)||Date.now()<Date.parse(window.end)+60000||state.deliveredReports.includes(window.key))continue;
  try{await sendOperationalReport(period,window.start.slice(0,10));state.deliveredReports.push(window.key);state.deliveredReports=state.deliveredReports.slice(-500);delete state.lastReportError;await save();}
  catch{state.lastReportError='Falha ao enviar relatório ao Telegram; uma nova tentativa será feita.';await save();break;}
 }
}
let lastSchedule=0;
export async function observeRecordings(current:ReturnType<typeof status>){
  for(const item of current.audit){const key=JSON.stringify(item);if(seenAudit.has(key))continue;seenAudit.add(key);
   const channel=current.channels.find(c=>c.id===item.channelId);
   if(['stop','failure','reconnect'].includes(item.action)&&!incidents.has(item.channelId)){incidents.add(item.channelId);await event('stopped',item.detail||'O gravador foi interrompido.',channel?.name,undefined,config.recordingAlert);}
  }
  if(seenAudit.size>1000){seenAudit.clear();current.audit.forEach(item=>seenAudit.add(JSON.stringify(item)));}
  for(const channel of current.channels){
   if(channel.enabled&&!channel.running&&!incidents.has(channel.id)&&Date.now()-Date.parse(state.startedAt)>30000){incidents.add(channel.id);await event('stopped',channel.error??'Gravação habilitada, porém sem processo ativo.',channel.name,undefined,config.recordingAlert);}
   if(channel.running&&(channel.activeBlock?.bytes??0)>48&&incidents.delete(channel.id))await event('recovered','O arquivo voltou a receber dados.',channel.name,undefined,config.recordingAlert);
   const input=JSON.stringify([channel.name,channel.url,channel.programId]);const previous=previousInputs.get(channel.id);previousInputs.set(channel.id,input);
   if(previous&&previous!==input)await event('input',`Entrada de gravação alterada: ${JSON.parse(previous)[0]} → ${channel.name}`,channel.name,undefined,config.inputAlert);
   if(Date.now()-lastSample>=60000)await event('sample','Estado do gravador',channel.name,{enabled:channel.enabled,running:channel.running,error:channel.error});
  }
  if(Date.now()-lastSample>=60000)lastSample=Date.now();
  for(const file of current.files){if(seenBlocks.has(file.id))continue;await journal({id:randomUUID(),time:file.start,type:'block',channel:file.channel,data:file});seenBlocks.add(file.id);state.seenBlocks.push(file.id);}
  state.seenBlocks=current.files.map(file=>file.id);seenBlocks.clear();state.seenBlocks.forEach(id=>seenBlocks.add(id));
  await save();
}
export async function runOperationsCycle(){
 if(busy||stopped)return;busy=true;
 try{
  await observeRecordings(status());
  await deliverNotices();

  if(Date.now()-lastSchedule>=60000){lastSchedule=Date.now();await schedules();}
 }finally{busy=false;}
}
export function initOperations(){return initializing??=initialize().catch(error=>{initializing=undefined;throw error;});}
async function initialize(){
 await initRecordings();await mkdir(root,{recursive:true});
 for(const name of ['config','state'])try{const value=JSON.parse(await readFile(join(root,name+'.json'),'utf8'));if(name==='config')config={...config,...value};else state={...state,...value};}catch(error:any){if(error.code!=='ENOENT')throw error;}
 state.seenBlocks.forEach(id=>seenBlocks.add(id));status().audit.forEach(item=>seenAudit.add(JSON.stringify(item)));
 await save();timer=setInterval(()=>void runOperationsCycle().catch(()=>{}),10000);timer.unref();
 // Keep 95 days of operational history; finished recording files follow their own retention.
 const cutoff=new Date(Date.now()-95*86400000).toISOString().slice(0,10);
 for(const file of await readdir(join(root,'history')).catch(()=>[]))if(/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(file)&&file.slice(0,10)<cutoff)await unlink(join(root,'history',file));
}
export async function stopOperations(){stopped=true;if(timer)clearInterval(timer);while(busy)await new Promise(r=>setTimeout(r,10));await saveQueue;}

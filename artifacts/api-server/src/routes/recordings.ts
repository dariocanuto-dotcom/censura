import { Router } from 'express';
import { createReadStream } from 'node:fs';
import { once } from 'node:events';
import { basename } from 'node:path';
import { isAbsolute, resolve, join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { createBtsWorkbook } from '../lib/bts-report';
import { recordingInfo } from '../lib/recording-info';
import {exportFormats,exportProfiles,startConversion,conversionJob} from '../lib/conversions';
import { configureChannel, status, getRecording, initRecordings, protectRecordings, deleteRecordings, updateRecordingCaption } from '../lib/recordings';
const router = Router();
router.use(async (_req, _res, next) => { try { await initRecordings(); next(); } catch(error) { next(error); } });
router.get('/', (_req,res) => res.json(status()));
router.post('/report/excel',async(req,res)=>{
  try{const {report,directory}=req.body;if(!report||!Array.isArray(report.auditoria))throw new Error('Relatório inválido.');
    const buffer=await createBtsWorkbook(report);const name=`dccp-bts-${new Date().toISOString().replace(/[:.]/g,'-')}.xlsx`;
    if(directory){if(typeof directory!=='string'||!isAbsolute(directory))throw new Error('Informe uma pasta absoluta.');await mkdir(resolve(directory),{recursive:true});const path=join(resolve(directory),name);await writeFile(path,buffer,{flag:'wx'});res.json({file:path});}
    else{res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('Content-Disposition',`attachment; filename="${name}"`);res.send(buffer);}
  }catch(error){res.status(400).json({error:error instanceof Error?error.message:String(error)});}
});
router.post('/report',async(req,res)=>{
  try{
    const {directory,json,csv}=req.body;
    if(typeof directory!=='string'||!isAbsolute(directory)||typeof json!=='string'||typeof csv!=='string')throw new Error('Informe uma pasta absoluta e o relatório.');
    JSON.parse(json);
    const destination=resolve(directory);await mkdir(destination,{recursive:true});
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');const prefix=`dccp-bts-${stamp}`;
    const files=[join(destination,`${prefix}.json`),join(destination,`${prefix}.csv`)];
    await writeFile(files[0],json,{encoding:'utf8',flag:'wx'});await writeFile(files[1],csv,{encoding:'utf8',flag:'wx'});
    res.json({directory:destination,files});
  }catch(error){res.status(400).json({error:error instanceof Error?error.message:String(error)});}
});
router.post('/caption',async(req,res)=>{try{await updateRecordingCaption(req.body.text);res.json({ok:true});}catch(error){res.status(400).json({error:String(error)});}});
router.get('/formats',(_req,res)=>res.json({formats:exportFormats,profiles:exportProfiles}));
router.delete('/files',async(req,res)=>{
  try{res.json(await deleteRecordings(req.body.ids));}
  catch(error){res.status(400).json({error:error instanceof Error?error.message:String(error)});}
});
router.post('/files/:id/convert',async(req,res)=>{
  try{res.status(202).json(await startConversion(String(req.params.id),String(req.body.format),String(req.body.profile??'auto'),req.body.programId===undefined?undefined:Number(req.body.programId)));}
  catch(error){res.status(400).json({error:String(error)});}
});
router.get('/conversions/:id', (req,res)=>{
  const job=conversionJob(String(req.params.id));if(!job){res.status(404).json({error:'Exportação não encontrada; a API pode ter sido reiniciada.'});return;}
  const {path,...info}=job;res.json({...info,downloadUrl:job.status==='ready'?`/api/recordings/conversions/${job.id}/download`:null});
});
router.get('/conversions/:id/download',(req,res)=>{
  const job=conversionJob(String(req.params.id));if(!job||job.status!=='ready'){res.status(404).json({error:'Arquivo de exportação ainda não está pronto.'});return;}
  res.download(job.path,{dotfiles:'allow'});
});
router.put('/channels/:id', async (req,res) => { try { res.json(await configureChannel({ ...req.body, id: String(req.params.id) })); } catch(error) { res.status(400).json({ error: error instanceof Error ? error.message : String(error) }); } });
router.get('/files/:id', (req,res) => {
  const file = getRecording(String(req.params.id)); if (!file) { res.status(404).json({error:'Bloco não encontrado ou removido pela retenção.'}); return; }
  const release=protectRecordings([file.id]);
  res.once('close',release);
  res.download(file.path, `${file.channel}_${basename(file.path)}`,{dotfiles:'allow'});
});
router.get('/files/:id/info',async(req,res)=>{
  const file=getRecording(String(req.params.id));if(!file){res.status(404).json({error:'Bloco não encontrado'});return;}
  const release=protectRecordings([file.id]);
  try{const info=await recordingInfo(file.path);res.setHeader('Content-Disposition',`attachment; filename="${basename(file.path)}.info.json"`);res.json({...info,channel:file.channel,start:file.start,end:file.end});}
  catch(error){res.status(500).json({error:String(error)});}finally{release();}
});
const crcTable = Array.from({length:256},(_,n) => { let c=n; for(let k=0;k<8;k++) c=c&1 ? 0xedb88320^(c>>>1):c>>>1; return c>>>0; });
router.post('/export', async (req,res) => {
  const ids = typeof req.body.ids === "string" ? [req.body.ids] : req.body.ids;
  if (!Array.isArray(ids) || !ids.length || ids.length > 500) { res.status(400).json({error:'Selecione de 1 a 500 blocos.'}); return; }
  const files = [...new Set<string>(ids)].map(getRecording);
  if(files.some(file => !file)) { res.status(404).json({error:'Um dos blocos foi removido. Atualize a busca.'}); return; }
  if(files.reduce((sum,file) => sum+file!.bytes,0) > 3500000000) { res.status(400).json({error:'Exportação ZIP limitada a 3,5 GB. Divida a seleção.'}); return; }
  res.setHeader('Content-Type','application/zip'); res.setHeader('Content-Disposition','attachment; filename="censura-multicanal.zip"');
  const release=protectRecordings(files.map(file=>file!.id));
  let offset=0; const directory: Buffer[]=[];
  const write = async (buffer:Buffer) => { if(res.destroyed) throw new Error('Exportação cancelada'); offset+=buffer.length; if(!res.write(buffer)) await once(res,'drain'); };
  try {
    for(const file of files) {
      const name=Buffer.from(`${file!.channelId}/${basename(file!.path)}`); const start=offset;
      const local=Buffer.alloc(30); local.writeUInt32LE(0x04034b50,0); local.writeUInt16LE(20,4); local.writeUInt16LE(0x808,6); local.writeUInt16LE(name.length,26);
      await write(local); await write(name); let crc=0xffffffff; let size=0;
      for await(const chunk of createReadStream(file!.path)) { const buffer=chunk as Buffer; size+=buffer.length; for(const byte of buffer) crc=crcTable[(crc^byte)&255]^(crc>>>8); await write(buffer); }
      crc=(crc^0xffffffff)>>>0;
      const descriptor=Buffer.alloc(16); descriptor.writeUInt32LE(0x08074b50,0); descriptor.writeUInt32LE(crc,4); descriptor.writeUInt32LE(size,8); descriptor.writeUInt32LE(size,12); await write(descriptor);
      const central=Buffer.alloc(46); central.writeUInt32LE(0x02014b50,0); central.writeUInt16LE(20,4); central.writeUInt16LE(20,6); central.writeUInt16LE(0x808,8); central.writeUInt32LE(crc,16); central.writeUInt32LE(size,20); central.writeUInt32LE(size,24); central.writeUInt16LE(name.length,28); central.writeUInt32LE(start,42); directory.push(Buffer.concat([central,name]));
    }
    const directoryOffset=offset; for(const item of directory) await write(item);
    const directorySize=offset-directoryOffset; const end=Buffer.alloc(22); end.writeUInt32LE(0x06054b50,0); end.writeUInt16LE(files.length,8); end.writeUInt16LE(files.length,10); end.writeUInt32LE(directorySize,12); end.writeUInt32LE(directoryOffset,16); await write(end); res.end();
  } catch { res.destroy(); } finally { release(); }
});
export default router;


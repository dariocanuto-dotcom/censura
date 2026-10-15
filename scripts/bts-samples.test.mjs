import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {mkdtemp,mkdir,readFile,readdir} from 'node:fs/promises';
import {resolve,join,basename} from 'node:path';
import {captureBtsWindows,btsSamplePath} from '../artifacts/api-server/src/lib/bts-window.ts';
import {separateSampleFolder} from '../artifacts/api-server/src/lib/bts-samples.ts';
const base=Date.parse('2026-10-15T11:24:30-03:00');
function packets(size,value){const data=Buffer.alloc(size*8,value);for(let i=0;i<8;i++)data[i*size+(size===192?4:0)]=0x47;return data;}
function normalized(chunks,size){return Buffer.concat(chunks.flatMap(data=>Array.from({length:data.length/size},(_,i)=>data.subarray(i*size+(size===192?4:0),i*size+(size===192?4:0)+188))));}
async function temporary(){await mkdir('.runtime',{recursive:true});return mkdtemp(resolve('.runtime/bts-test-'));}
for(const size of [188,192,204])test(`salva 5 segundos a cada 30 convertendo em MPEG-TS de 188 bytes os pacotes ${size}`,async()=>{
 const root=await temporary(),completed=[];let clock=base;const chunks=Array.from({length:9},(_,i)=>packets(size,i+1));
 let index=0;const times=[0,1000,4900,5000,29900,30000,31000,34900,35000];
 const stream=Readable.from((async function*(){for(let i=0;i<times.length;i++){yield chunks[i];}})());
 await captureBtsWindows(stream,root,async file=>{completed.push(file);},()=>{clock=base+times[index++];},()=>{},()=>clock);
 assert.equal(completed.length,2);assert.equal(completed[0].packetSize,188);assert.equal(Date.parse(completed[0].end)-Date.parse(completed[0].start),5000);
 assert.equal(basename(completed[0].path),'freme15102026-11h24s30.ts');assert.equal(basename(completed[1].path),'freme15102026-11h25s00.ts');
 assert.deepEqual(await readFile(completed[0].path),normalized(chunks.slice(0,3),size));assert.deepEqual(await readFile(completed[1].path),normalized(chunks.slice(5,8),size));
});
test('organização segue ano mês e dia de Brasília na virada UTC e anual',()=>{
 assert.equal(btsSamplePath('/bts',new Date('2027-01-01T02:59:30Z')),join('/bts','2026','12','31122026','freme31122026-23h59s30.ts'));
 assert.equal(btsSamplePath('/bts',new Date('2027-01-01T03:00:00Z')),join('/bts','2027','01','01012027','freme01012027-00h00s00.ts'));
});
test('entrada iniciada entre janelas aguarda o próximo segundo 00 ou 30',async()=>{
 const root=await temporary(),completed=[];let clock=base+1000,index=0;const times=[1000,30000,34000,34900,35000];const data=packets(188,12);
 const stream=Readable.from((async function*(){for(const offset of times){yield data;}})());
 await captureBtsWindows(stream,root,async file=>{completed.push(file);},()=>{clock=base+times[index++];},()=>{},()=>clock);
 assert.equal(completed.length,1);assert.equal(basename(completed[0].path),'freme15102026-11h25s00.ts');
});
test('amostra interrompida não recebe extensão final BTS',async()=>{
 const root=await temporary(),completed=[];let clock=base,index=0;
 const stream=Readable.from((async function*(){yield packets(188,10);yield packets(188,11);})());
 await captureBtsWindows(stream,root,async file=>{completed.push(file);},()=>{clock=base+1000*index++;},()=>{},()=>clock);
 assert.equal(completed.length,0);const files=await readdir(join(root,'2026','10','15102026'));assert.equal(files.length,1);assert(files[0].endsWith('.partial'));
});
test('rejeita pastas dentro da gravação contínua e aceita pasta irmã',()=>{
 const root=resolve('gravacoes');assert.throws(()=>separateSampleFolder(root,root));assert.throws(()=>separateSampleFolder(join(root,'bts'),root));assert.throws(()=>separateSampleFolder(resolve('.'),root));assert.equal(separateSampleFolder(resolve('amostras_bts'),root),resolve('amostras_bts'));assert.throws(()=>separateSampleFolder('relativa',root));
});

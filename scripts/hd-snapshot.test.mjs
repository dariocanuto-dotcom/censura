import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {snapshotPath,jpegWithinLimit} from '../artifacts/api-server/src/lib/hd-snapshot.ts';
test('foto usa nome do frame e data de Brasília na virada de ano',()=>{
 assert.equal(snapshotPath('/hd/dados_transmissao',new Date('2027-01-01T02:59:30Z')),join('/hd/dados_transmissao','2026','12','31122026','freme31122026-23h59s30.jpg'));
});
test('escolhe a melhor qualidade que cabe em 200 KB sem preencher artificialmente o arquivo',async()=>{
 const attempts=[];const output=await jpegWithinLimit(async quality=>{attempts.push(quality);return Buffer.alloc(Math.floor(1000000/quality));});assert.equal(output.length,200000);assert(attempts.includes(5));assert(attempts.length<=5);
 const small=await jpegWithinLimit(async()=>Buffer.alloc(30000));assert.equal(small.length,30000);
});
test('avisa quando nenhuma qualidade consegue respeitar o limite',async()=>{
 await assert.rejects(()=>jpegWithinLimit(async()=>Buffer.alloc(200001)),/200 KB/);
});

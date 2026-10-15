import test from 'node:test';
import assert from 'node:assert/strict';
import {udpInputUrl} from '../artifacts/classind/src/lib/udp-input.ts';
test('multicast usa endereço local da placa receptora e parâmetros compartilháveis',()=>{
 const u=new URL(udpInputUrl({address:'224.1.1.122',port:5004,interface:'192.168.35.22',protocol:'udp',bufferSize:1500000}));
 assert.equal(u.hostname,'224.1.1.122');assert.equal(u.port,'5004');assert.equal(u.searchParams.get('localaddr'),'192.168.35.22');assert.equal(u.searchParams.get('reuse'),'1');assert.equal(u.searchParams.get('overrun_nonfatal'),'1');
});
test('interface automática não fixa IP e RTP preserva protocolo',()=>{
 const u=new URL(udpInputUrl({address:'224.1.1.122',port:5004,interface:'0.0.0.0',protocol:'rtp'}));assert.equal(u.protocol,'rtp:');assert(!u.searchParams.has('localaddr'));
});

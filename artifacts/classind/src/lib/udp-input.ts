export function udpInputUrl(input:{address:string;port:number;interface?:string;bufferSize?:number;protocol?:'udp'|'rtp'}){
 const params=new URLSearchParams({reuse:'1',overrun_nonfatal:'1',buffer_size:String(input.bufferSize||1500000),fifo_size:String(Math.ceil((input.bufferSize||1500000)/188))});
 const local=input.interface?.trim();if(local&&local!=='0.0.0.0')params.set('localaddr',local);
 return `${input.protocol??'udp'}://${input.address.trim()}:${input.port}?${params}`;
}

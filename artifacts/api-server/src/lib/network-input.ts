import {networkInterfaces} from 'node:os';
export function networkInputUrl(value:string,localAddresses=Object.values(networkInterfaces()).flatMap(items=>(items??[]).map(item=>item.address))){
 const url=new URL(value);if(!['udp:','rtp:'].includes(url.protocol))return value;
 const local=url.searchParams.get('localaddr');
 // A stored address can disappear when the receiver changes NIC or network.
 // Let the OS multicast route select the interface rather than failing forever.
 if(local&&(local==='0.0.0.0'||!localAddresses.includes(local)))url.searchParams.delete('localaddr');
 return url.toString();
}

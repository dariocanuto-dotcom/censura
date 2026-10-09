import { useEffect, useRef, useState } from 'react';

/** Receives a remote source through HTTP WHEP; never captures a local camera. */
export function WebRtcInput({ url, active, onAudio }: { url: string; active: boolean; onAudio: (levels: number[], rms: number, peak: number) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setError('');
    if (!active || !url) return;
    const controller = new AbortController();
    const peer = new RTCPeerConnection();
    let session: string | undefined;
    let closed = false;
    const audioTimer = setInterval(() => {
      void peer.getStats().then(stats => {
        if (closed) return;
        stats.forEach(report => {
          if (report.type === 'inbound-rtp' && report.kind === 'audio' && typeof report.audioLevel === 'number') {
            const db = report.audioLevel > 0 ? Math.max(-60, 20 * Math.log10(report.audioLevel)) : -60;
            onAudio([db], db, db);
          }
        });
      }).catch(() => {});
    }, 80);
    const timeout = setTimeout(() => controller.abort(), 20000);
    const removeSession = () => { if (session) void fetch(session, { method: 'DELETE', keepalive: true }).catch(() => {}); };
    peer.addTransceiver('video', { direction: 'recvonly' });
    peer.addTransceiver('audio', { direction: 'recvonly' });
    const media = new MediaStream();
    peer.ontrack = event => {
      media.addTrack(event.track);
      if (video.current) { video.current.srcObject = media; void video.current.play().catch(() => {}); }
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'failed') setError('Falha na conexão WebRTC. Verifique ICE/TURN e o endereço WHEP.');
    };
    void (async () => {
      try {
        const endpoint = new URL(url);
        if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error('Informe uma URL HTTP/HTTPS WHEP.');
        await peer.setLocalDescription(await peer.createOffer());
        await new Promise<void>((resolve, reject) => {
          const check = () => { if (peer.iceGatheringState === 'complete') { cleanup(); resolve(); } };
          const abort = () => { cleanup(); reject(new Error('Tempo de conexão WebRTC excedido.')); };
          const cleanup = () => { peer.removeEventListener('icegatheringstatechange', check); controller.signal.removeEventListener('abort', abort); };
          peer.addEventListener('icegatheringstatechange', check);
          controller.signal.addEventListener('abort', abort, { once: true });
          if (controller.signal.aborted) abort(); else check();
        });
        const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: peer.localDescription!.sdp, signal: controller.signal });
        if (!response.ok) throw new Error(`Servidor WHEP respondeu ${response.status}.`);
        const location = response.headers.get('Location');
        if (location) session = new URL(location, endpoint).href;
        if (closed) { removeSession(); return; }
        await peer.setRemoteDescription({ type: 'answer', sdp: await response.text() });
        clearTimeout(timeout);
      } catch (cause) { if (!closed) setError(cause instanceof Error ? cause.message : String(cause)); }
    })();
    return () => { closed = true; clearInterval(audioTimer); clearTimeout(timeout); controller.abort(); peer.close(); media.getTracks().forEach(track => track.stop()); removeSession(); if (video.current) video.current.srcObject = null; };
  }, [url, active, onAudio]);
  return <><video ref={video} autoPlay muted playsInline controls className="absolute inset-0 w-full h-full object-contain bg-black" />{error && <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-xs text-red-300">{error}</div>}{!url && <div className="absolute inset-0 flex items-center justify-center bg-black text-xs text-gray-400">Configure o endereço WHEP em Entradas.</div>}</>;
}

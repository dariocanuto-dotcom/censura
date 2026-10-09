"""Native NDI SDK receiver. SDK binaries are installed separately by the operator.

SDK ABI: NDIlib_find_create_v2 / NDIlib_recv_create_v3 / capture_v2.
Video and planar float audio are copied before freeing their SDK frames.
Only the standard Python library is required. FFmpeg provides the browser bridge.
"""
import argparse
import array
import ctypes as c
import json
import os
import queue
import signal
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path


class Source(c.Structure):
    _fields_ = [('name', c.c_char_p), ('address', c.c_char_p)]


class Finder(c.Structure):
    _fields_ = [('local', c.c_bool), ('groups', c.c_char_p), ('ips', c.c_char_p)]


class Receiver(c.Structure):
    _fields_ = [('source', Source), ('color', c.c_int), ('bandwidth', c.c_int),
                ('fields', c.c_bool), ('name', c.c_char_p)]


class Video(c.Structure):
    _fields_ = [('width', c.c_int), ('height', c.c_int), ('fourcc', c.c_int),
                ('rate_n', c.c_int), ('rate_d', c.c_int), ('aspect', c.c_float),
                ('format', c.c_int), ('timecode', c.c_int64), ('data', c.c_void_p),
                ('stride', c.c_int), ('metadata', c.c_char_p), ('timestamp', c.c_int64)]


class Audio(c.Structure):
    _fields_ = [('rate', c.c_int), ('channels', c.c_int), ('samples', c.c_int),
                ('timecode', c.c_int64), ('data', c.c_void_p), ('stride', c.c_int),
                ('metadata', c.c_char_p), ('timestamp', c.c_int64)]


def load_sdk(library):
    # NDI's C API uses cdecl on Windows as well as Linux.
    dll = c.CDLL(str(Path(library).resolve()))
    signatures = {
        'NDIlib_initialize': (c.c_bool, []), 'NDIlib_destroy': (None, []),
        'NDIlib_find_create_v2': (c.c_void_p, [c.POINTER(Finder)]),
        'NDIlib_find_destroy': (None, [c.c_void_p]),
        'NDIlib_find_wait_for_sources': (c.c_bool, [c.c_void_p, c.c_uint32]),
        'NDIlib_find_get_current_sources': (c.POINTER(Source), [c.c_void_p, c.POINTER(c.c_uint32)]),
        'NDIlib_recv_create_v3': (c.c_void_p, [c.POINTER(Receiver)]),
        'NDIlib_recv_destroy': (None, [c.c_void_p]),
        'NDIlib_recv_capture_v2': (c.c_int, [c.c_void_p, c.POINTER(Video), c.POINTER(Audio), c.c_void_p, c.c_uint32]),
        'NDIlib_recv_free_video_v2': (None, [c.c_void_p, c.POINTER(Video)]),
        'NDIlib_recv_free_audio_v2': (None, [c.c_void_p, c.POINTER(Audio)]),
    }
    for name, (result, args) in signatures.items():
        fn = getattr(dll, name)
        fn.restype, fn.argtypes = result, args
    if not dll.NDIlib_initialize():
        raise RuntimeError('O SDK NDI não conseguiu inicializar neste computador.')
    return dll


def discover(dll):
    finder = dll.NDIlib_find_create_v2(c.byref(Finder(True, None, None)))
    if not finder:
        raise RuntimeError('Não foi possível criar o localizador NDI.')
    try:
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            dll.NDIlib_find_wait_for_sources(finder, 300)
        count = c.c_uint32()
        sources = dll.NDIlib_find_get_current_sources(finder, c.byref(count))
        return [{'name': sources[i].name.decode('utf-8', errors='replace')} for i in range(count.value)]
    finally:
        dll.NDIlib_find_destroy(finder)


def copy_video(frame):
    if not frame.data or not (0 < frame.width <= 7680 and 0 < frame.height <= 4320):
        raise RuntimeError('Quadro NDI inválido.')
    if frame.fourcc not in (int.from_bytes(b'BGRA', 'little'), int.from_bytes(b'BGRX', 'little')):
        raise RuntimeError('O SDK não entregou vídeo BGRA/BGRX.')
    row = frame.width * 4
    stride = frame.stride or row
    if stride < row:
        raise RuntimeError('Stride NDI inválido.')
    return b''.join(c.string_at(frame.data + y * stride, row) for y in range(frame.height))


def copy_audio(frame):
    if not frame.data or not (0 < frame.channels <= 16 and 0 < frame.samples <= 192000 and 8000 <= frame.rate <= 192000):
        raise RuntimeError('Quadro de áudio NDI inválido.')
    out = array.array('f', [0]) * (frame.channels * frame.samples)
    stride = frame.stride or frame.samples * 4
    if stride < frame.samples * 4:
        raise RuntimeError('Stride de áudio NDI inválido.')
    for channel in range(frame.channels):
        planar = array.array('f')
        planar.frombytes(c.string_at(frame.data + channel * stride, frame.samples * 4))
        out[channel::frame.channels] = planar
    return out.tobytes()


def receive(dll, name):
    settings = Receiver(Source(name.encode('utf-8'), None), 0, 100, False, b'CENSURA PRO')
    receiver = dll.NDIlib_recv_create_v3(c.byref(settings))
    if not receiver:
        raise RuntimeError('Não foi possível criar o receptor NDI.')
    stop = threading.Event()
    errors = []
    streams = [queue.Queue(maxsize=8), queue.Queue(maxsize=120)]
    info = [None, None]
    listeners = []
    workers = []
    ffmpeg = None

    def capture():
        last_frame = time.monotonic()
        try:
            while not stop.is_set():
                video, audio = Video(), Audio()
                kind = dll.NDIlib_recv_capture_v2(receiver, c.byref(video), c.byref(audio), None, 200)
                if kind == 1:
                    try:
                        description = (video.width, video.height, video.rate_n, video.rate_d)
                        if info[0] is not None and info[0] != description:
                            raise RuntimeError('O formato NDI mudou. Reconecte a entrada.')
                        info[0] = description
                        data, index = copy_video(video), 0
                    finally:
                        dll.NDIlib_recv_free_video_v2(receiver, c.byref(video))
                elif kind == 2:
                    try:
                        description = (audio.rate, audio.channels)
                        if info[1] is not None and info[1] != description:
                            raise RuntimeError('O formato do áudio NDI mudou. Reconecte a entrada.')
                        info[1] = description
                        data, index = copy_audio(audio), 1
                    finally:
                        dll.NDIlib_recv_free_audio_v2(receiver, c.byref(audio))
                elif kind == 4:
                    raise RuntimeError('A conexão NDI foi perdida.')
                else:
                    if time.monotonic() - last_frame > 15:
                        raise RuntimeError('Fonte NDI sem quadros há 15 segundos.')
                    continue
                last_frame = time.monotonic()
                # A full queue means the encoder cannot keep up; never reorder frames.
                streams[index].put(data, timeout=3)
        except Exception as error:
            errors.append(str(error))
            stop.set()

    def write_stream(listener, frames):
        connection = None
        try:
            listener.settimeout(15)
            connection, _ = listener.accept()
            connection.settimeout(5)
            while not stop.is_set():
                try:
                    connection.sendall(frames.get(timeout=.2))
                except queue.Empty:
                    continue
        except Exception as error:
            if not stop.is_set():
                errors.append(str(error))
                stop.set()
        finally:
            if connection:
                connection.close()

    def read_stop():
        sys.stdin.buffer.readline()
        stop.set()

    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    threading.Thread(target=read_stop, daemon=True).start()
    capture_thread = threading.Thread(target=capture, daemon=True)
    capture_thread.start()
    try:
        deadline = time.monotonic() + 12
        while not all(info) and not stop.is_set() and time.monotonic() < deadline:
            time.sleep(.05)
        if stop.is_set() or not all(info):
            raise RuntimeError(errors[0] if errors else 'A fonte NDI precisa entregar vídeo e áudio. Nenhum sinal completo chegou em 12 segundos.')
        for frames in streams:
            listener = socket.socket()
            listener.bind(('127.0.0.1', 0))
            listener.listen(1)
            listeners.append(listener)
            worker = threading.Thread(target=write_stream, args=(listener, frames), daemon=True)
            workers.append(worker)
            worker.start()
        width, height, n, d = info[0]
        rate, channels = info[1]
        if not n or not d:
            raise RuntimeError('Taxa de quadros NDI inválida.')
        command = ['ffmpeg', '-hide_banner', '-loglevel', 'warning', '-nostdin',
                   '-thread_queue_size', '8', '-probesize', '32', '-analyzeduration', '0', '-f', 'rawvideo', '-pixel_format', 'bgra',
                   '-video_size', f'{width}x{height}', '-framerate', f'{n}/{d}',
                   '-i', f'tcp://127.0.0.1:{listeners[0].getsockname()[1]}',
                   '-thread_queue_size', '128', '-probesize', '32', '-analyzeduration', '0', '-f', 'f32le', '-ar', str(rate), '-ac', str(channels),
                   '-i', f'tcp://127.0.0.1:{listeners[1].getsockname()[1]}',
                   '-map', '0:v:0', '-map', '1:a:0', '-vf', "scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
                   '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-pix_fmt', 'yuv420p',
                   '-c:a', 'aac', '-ac', str(min(channels, 8)), '-b:a', '192k',
                   '-f', 'mpegts', '-flush_packets', '1', 'pipe:1']
        ffmpeg = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=sys.stdout.buffer, stderr=sys.stderr.buffer)
        while not stop.wait(.2) and ffmpeg.poll() is None:
            pass
        if ffmpeg.poll() not in (None, 0) and not stop.is_set():
            raise RuntimeError('O encoder da entrada NDI foi interrompido.')
        if errors:
            raise RuntimeError(errors[0])
    finally:
        stop.set()
        if ffmpeg and ffmpeg.poll() is None:
            ffmpeg.terminate()
            try:
                ffmpeg.wait(timeout=3)
            except subprocess.TimeoutExpired:
                ffmpeg.kill()
                ffmpeg.wait()
        for listener in listeners:
            listener.close()
        capture_thread.join(timeout=4)
        if not capture_thread.is_alive():
            dll.NDIlib_recv_destroy(receiver)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--library', required=True)
    parser.add_argument('--list', action='store_true')
    parser.add_argument('--source')
    args = parser.parse_args()
    dll = load_sdk(args.library)
    try:
        if args.list:
            print(json.dumps({'ok': True, 'sources': discover(dll)}, ensure_ascii=False))
        elif args.source:
            receive(dll, args.source)
        else:
            raise RuntimeError('Informe a fonte NDI.')
    finally:
        dll.NDIlib_destroy()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)

import ctypes as c
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('ndi_receiver', Path(__file__).with_name('ndi-receiver.py'))
ndi = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ndi)


class Frames(unittest.TestCase):
    def test_sdk_frame_layout_x64(self):
        self.assertEqual(c.sizeof(ndi.Video), 72)
        self.assertEqual(ndi.Video.data.offset, 40)
        self.assertEqual(c.sizeof(ndi.Audio), 56)
        self.assertEqual(ndi.Audio.data.offset, 24)

    def test_video_padding_does_not_enter_output(self):
        data = c.create_string_buffer(b'12345678PAD!abcdefghPAD!')
        frame = ndi.Video(width=2, height=2, fourcc=int.from_bytes(b'BGRA', 'little'), data=c.addressof(data), stride=12)
        self.assertEqual(ndi.copy_video(frame), b'12345678abcdefgh')

    def test_audio_planar_channels_are_interleaved_without_padding(self):
        data = (c.c_float * 8)(.1, .2, .3, 99, .4, .5, .6, 99)
        frame = ndi.Audio(rate=48000, channels=2, samples=3, data=c.addressof(data), stride=16)
        output = ndi.array.array('f')
        output.frombytes(ndi.copy_audio(frame))
        for actual, expected in zip(output, [.1, .4, .2, .5, .3, .6]):
            self.assertAlmostEqual(actual, expected, places=6)

    def test_bad_frame_is_rejected_before_reading_memory(self):
        with self.assertRaises(RuntimeError):
            ndi.copy_video(ndi.Video(width=1920, height=1080, data=None))
        with self.assertRaises(RuntimeError):
            ndi.copy_audio(ndi.Audio(rate=48000, channels=17, samples=10, data=None))


if __name__ == '__main__':
    unittest.main()

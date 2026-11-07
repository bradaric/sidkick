import io
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from civ7.svg_preview import PREVIEW_NAME
from sidkick.map_preview import PreviewHandler, serve_preview


class PreviewServerTests(unittest.TestCase):
    def request(self, directory, path='/' + PREVIEW_NAME, method='GET', headers=''):
        # Exercise the real HTTP handler over in-memory streams, without opening a port.
        response = bytearray()
        connection = Mock()
        connection.makefile.return_value = io.BytesIO(f'{method} {path} HTTP/1.0\r\n{headers}\r\n'.encode())
        connection.sendall.side_effect = response.extend
        with patch('sidkick.map_preview.PREVIEW_DIR', Path(directory)):
            PreviewHandler(connection, ('127.0.0.1', 12345), SimpleNamespace())
        return bytes(response)

    def test_only_fixed_svg_is_served_no_directory_listing_or_other_files(self):
        with tempfile.TemporaryDirectory(dir='/tmp/opencode') as directory:
            root = Path(directory)
            (root / PREVIEW_NAME).write_text('<svg/>')
            (root / 'secret.txt').write_text('DO NOT SERVE')
            result = self.request(directory, '/sidkick-map.svg')
            self.assertIn(b'200 OK', result)
            self.assertIn(b'image/svg+xml', result)
            self.assertTrue(result.endswith(b'<svg/>'))
            for path in ['/', '/secret.txt', '/../secret.txt', '/%2e%2e/secret.txt', '/control', '/refresh-game', '/sidkick-svg-demo.svg']:
                result = self.request(directory, path)
                self.assertIn(b'404', result)
                self.assertNotIn(b'DO NOT SERVE', result)

    def test_refresh_returns_fresh_bytes_even_with_conditional_cache_headers(self):
        with tempfile.TemporaryDirectory(dir='/tmp/opencode') as directory:
            (Path(directory) / PREVIEW_NAME).write_text('<svg>new</svg>')
            result = self.request(directory, headers='If-Modified-Since: Wed, 01 Jan 2099 00:00:00 GMT\r\n')
            self.assertIn(b'200 OK', result)
            self.assertIn(b'Cache-Control: no-store', result)
            self.assertTrue(result.endswith(b'<svg>new</svg>'))
            result = self.request(directory, method='HEAD')
            self.assertIn(b'200 OK', result)
            self.assertTrue(result.endswith(b'\r\n\r\n'))

    def test_server_binds_only_loopback_without_any_game_adapter(self):
        with patch('sidkick.map_preview.ThreadingHTTPServer') as server, patch('builtins.print'):
            serve_preview(8765)
        self.assertEqual(server.call_args.args[0], ('127.0.0.1', 8765))
        server.return_value.__enter__.return_value.serve_forever.assert_called_once()
        with self.assertRaises(ValueError):
            serve_preview(0)

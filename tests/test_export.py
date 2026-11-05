from contextlib import redirect_stdout
from io import StringIO
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import AsyncMock, patch

from civ7 import player


DATA = {"civilization": "Russian Empire", "leader": "Catherine the Great", "age": "Modern", "turn": 57,
        "snapshotStatus": {"status": "complete", "complete": True, "consistent": True}}


class ExplicitExportTests(unittest.TestCase):
    def test_explicit_output_supports_any_complete_save_and_preserves_unicode(self):
        self.assertTrue(callable(getattr(player, "write_export", None)))
        with TemporaryDirectory(prefix="sidkick-output-") as directory:
            path = Path(directory) / "modern.json"
            data = {**DATA, "civilization": "Other civilization", "leader": "Other leader", "name": "Bàakʼ"}
            self.assertEqual(player.write_export(data, path), path)
            self.assertEqual(json.loads(path.read_text(encoding="utf-8")), data)
            self.assertEqual(list(Path(directory).iterdir()), [path])

    def test_existing_files_and_symlinks_are_never_overwritten(self):
        self.assertTrue(callable(getattr(player, "write_export", None)))
        with TemporaryDirectory(prefix="sidkick-output-") as directory:
            target = Path(directory) / "existing.json"
            target.write_text("preserve", encoding="utf-8")
            link = Path(directory) / "link.json"
            link.symlink_to(target)
            for path in (target, link):
                with self.subTest(path=path), self.assertRaisesRegex(SystemExit, "exists"):
                    player.write_export(DATA, path)
                self.assertEqual(target.read_text(encoding="utf-8"), "preserve")
            self.assertTrue(link.is_symlink())
            self.assertEqual(set(Path(directory).iterdir()), {target, link})

    def test_destination_created_during_export_is_preserved(self):
        self.assertTrue(callable(getattr(player, "write_export", None)))
        real_link = os.link
        with TemporaryDirectory(prefix="sidkick-output-") as directory:
            destination = Path(directory) / "raced.json"

            def concurrent_create(source, target):
                Path(target).write_text("other writer", encoding="utf-8")
                return real_link(source, target)

            with patch("civ7.player.os.link", side_effect=concurrent_create):
                with self.assertRaisesRegex(SystemExit, "exists"):
                    player.write_export(DATA, destination)
            self.assertEqual(destination.read_text(encoding="utf-8"), "other writer")
            self.assertEqual(list(Path(directory).iterdir()), [destination])

    def test_incomplete_snapshots_never_create_files_or_temporary_files(self):
        self.assertTrue(callable(getattr(player, "write_export", None)))
        with TemporaryDirectory(prefix="sidkick-output-") as directory:
            for status in (None, {"status": "partial", "complete": False, "consistent": True},
                           {"status": "inconsistent", "complete": True, "consistent": False},
                           {"status": "unverified", "complete": True, "consistent": None}):
                with self.subTest(status=status), self.assertRaisesRegex(SystemExit, "No export written"):
                    player.write_export({**DATA, "snapshotStatus": status}, Path(directory) / "no.json")
                self.assertEqual(list(Path(directory).iterdir()), [])

    def test_serialization_failure_leaves_no_destination_or_temporary_file(self):
        self.assertTrue(callable(getattr(player, "write_export", None)))
        with TemporaryDirectory(prefix="sidkick-output-") as directory:
            with self.assertRaises(TypeError):
                player.write_export({**DATA, "invalid": object()}, Path(directory) / "no.json")
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_missing_parent_is_not_created_and_legacy_recognition_is_unchanged(self):
        self.assertTrue(callable(getattr(player, "write_export", None)))
        with TemporaryDirectory(prefix="sidkick-output-") as directory:
            with self.assertRaises(FileNotFoundError):
                player.write_export(DATA, Path(directory) / "missing" / "no.json")
            self.assertEqual(list(Path(directory).iterdir()), [])
            with patch.object(player, "ROOT", Path(directory)):
                with self.assertRaisesRegex(SystemExit, "Unrecognized"):
                    player.write_export(DATA)
                legacy = Path(directory) / "save-2-chola.json"
                legacy.write_text("old export", encoding="utf-8")
                data = {**DATA, "age": "Exploration", "civilization": "Chola Empire"}
                self.assertEqual(player.write_export(data), legacy)
                self.assertEqual(json.loads(legacy.read_text(encoding="utf-8")), data)

    def test_cli_passes_explicit_output_without_a_live_game(self):
        self.assertTrue(callable(getattr(player, "main", None)))
        with TemporaryDirectory(prefix="sidkick-output-") as directory:
            destination = Path(directory) / "cli.json"
            with patch.object(player, "full_snapshot", new_callable=AsyncMock, return_value=DATA) as snapshot:
                with redirect_stdout(StringIO()) as output:
                    player.main(["--output", str(destination)])
            snapshot.assert_awaited_once_with()
            self.assertEqual(json.loads(destination.read_text(encoding="utf-8")), DATA)
            self.assertIn(str(destination), output.getvalue())

    def test_legacy_publication_does_not_delete_a_reused_temporary_name(self):
        real_replace = Path.replace
        with TemporaryDirectory(prefix="sidkick-output-") as directory, patch.object(player, "ROOT", Path(directory)):
            reused = []

            def replace_and_reuse(source, target):
                result = real_replace(source, target)
                source.write_text("new writer at old temporary name", encoding="utf-8")
                reused.append(source)
                return result

            with patch.object(Path, "replace", replace_and_reuse):
                player.write_export({**DATA, "age": "Exploration", "civilization": "Maya Empire"})
            self.assertTrue(reused[0].exists(), "cleanup must not delete a name no longer owned by the exporter")

    def test_failed_publication_cleans_up_without_falling_back_to_replacement(self):
        with TemporaryDirectory(prefix="sidkick-output-") as directory:
            destination = Path(directory) / "no.json"
            with patch("civ7.player.os.link", side_effect=OSError("Hard links unsupported")):
                with self.assertRaisesRegex(OSError, "unsupported"):
                    player.write_export(DATA, destination)
            self.assertEqual(list(Path(directory).iterdir()), [])

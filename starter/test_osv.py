import csv
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest


STARTER = Path(__file__).resolve().parent
CLI = STARTER / "osv.py"
WORK = STARTER / "work"
INPUT_FIELDS = [
    "actor_id", "year", "is_government_actor", "version",
    "low_fatality_estimate", "best_fatality_estimate", "high_fatality_estimate",
]


def run_cli(cwd, *args):
    return subprocess.run(
        [sys.executable, str(CLI), *map(str, args)],
        cwd=cwd, capture_output=True, text=True, check=False,
    )


def write_input(path, rows):
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(INPUT_FIELDS)
        writer.writerows(rows)


def isolated_directory():
    WORK.mkdir(exist_ok=True)
    return TemporaryDirectory(dir=WORK)


class OsvCliTests(unittest.TestCase):
    def test_bundled_data_matches_published_table_and_sql(self):
        with isolated_directory() as directory:
            result = run_cli(directory, "--check")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("1408", result.stdout)
        self.assertIn("111", result.stdout)

    def test_missing_estimate_and_unknown_flag_are_visible_in_output(self):
        with isolated_directory() as directory:
            source = Path(directory) / "input.csv"
            output = Path(directory) / "output.csv"
            write_input(source, [["14", 1989, "?", "26.1", 0, "n/a", 50]])
            result = run_cli(directory, "--input", source, "--output", output)
            self.assertEqual(result.returncode, 0, result.stderr)
            with output.open(encoding="utf-8-sig", newline="") as stream:
                rows = list(csv.DictReader(stream))
            check = run_cli(directory, "--input", source, "--check")
            self.assertEqual(check.returncode, 0, check.stderr)

        self.assertEqual(len(rows), 111)
        self.assertEqual(rows[0]["actor_year_rows"], "0")
        unknown = rows[2]
        self.assertEqual(unknown["actor_type"], "unknown_native_flag")
        self.assertEqual(unknown["unknown_native_actor_type_rows"], "1")
        self.assertEqual(unknown["low_sum"], "0")
        self.assertEqual(unknown["missing_low_rows"], "0")
        self.assertEqual(unknown["missing_best_rows"], "1")
        self.assertEqual(unknown["high_sum"], "50")
        self.assertEqual(unknown["sum_status"], "partial_observed_sum_missing_values_not_imputed")

    def test_duplicate_actor_year_is_rejected_before_output(self):
        with isolated_directory() as directory:
            source = Path(directory) / "input.csv"
            output = Path(directory) / "output.csv"
            row = ["14", 1989, "1", "26.1", 25, 25, 50]
            write_input(source, [row, row])
            result = run_cli(directory, "--input", source, "--output", output)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("duplicate", result.stderr)
            self.assertFalse(output.exists())

    def test_output_cannot_overwrite_input(self):
        with isolated_directory() as directory:
            source = Path(directory) / "input.csv"
            write_input(source, [["14", 1989, "1", "26.1", 25, 25, 50]])
            original = source.read_bytes()
            result = run_cli(directory, "--input", source, "--output", source)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("overwrite", result.stderr)
            self.assertEqual(source.read_bytes(), original)


if __name__ == "__main__":
    unittest.main()

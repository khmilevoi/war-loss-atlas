"""Reproduce the UCDP OSV 26.1 annual totals with the Python standard library."""

import argparse
from collections import defaultdict
from contextlib import closing
import csv
from decimal import Decimal, InvalidOperation
from itertools import zip_longest
from pathlib import Path
import sqlite3
from tempfile import NamedTemporaryFile
from typing import NamedTuple


STARTER = Path(__file__).resolve().parent
BUNDLED_INPUT = STARTER / "data" / "OneSided_v26_1.csv"
EXPECTED = STARTER / "expected" / "ANNUAL_BY_ACTOR_TYPE.csv"
SQL = STARTER / "annual_by_actor_type.sql"
DEFAULT_OUTPUT = STARTER / "work" / "annual_by_actor_type.csv"
YEARS = range(1989, 2026)
ACTOR_TYPES = {"1": "government", "0": "non_government"}
UNKNOWN_TYPE = "unknown_native_flag"
METRICS = ("low", "best", "high")
MISSING = {"", "n/a", "na", "nan", "null"}
SOURCE_COLUMNS = {
    "actor_id", "year", "is_government_actor", "version",
    *(f"{metric}_fatality_estimate" for metric in METRICS),
}


class ActorYear(NamedTuple):
    actor_id: str
    year: int
    government_flag: str
    low: int | None
    best: int | None
    high: int | None


def parse_estimate(value):
    if value.strip().lower() in MISSING:
        return None
    try:
        number = Decimal(value)
    except InvalidOperation as error:
        raise ValueError(f"invalid fatality estimate {value!r}") from error
    if not number.is_finite() or number < 0 or number != number.to_integral_value():
        raise ValueError(f"expected a non-negative whole fatality estimate, got {value!r}")
    return int(number)


def read_source(path):
    rows = []
    keys = set()
    with path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream, strict=True)
        columns = reader.fieldnames or []
        if not SOURCE_COLUMNS.issubset(columns) or len(columns) != len(set(columns)):
            raise ValueError(f"{path}: missing or duplicate input columns")
        for row in reader:
            try:
                if None in row or None in row.values():
                    raise ValueError("wrong number of columns")
                actor_id = row["actor_id"]
                if actor_id.strip().lower() in MISSING or row["version"] != "26.1":
                    raise ValueError("expected actor_id and dataset version 26.1")
                year = int(row["year"])
                if year not in YEARS:
                    raise ValueError(f"year outside 1989–2025: {year}")
                key = (actor_id, year)
                if key in keys:
                    raise ValueError(f"duplicate actor-year key {key}")
                low, best, high = (
                    parse_estimate(row[f"{metric}_fatality_estimate"]) for metric in METRICS
                )
                if best is not None and best < 25:
                    raise ValueError("best estimate below the OSV inclusion threshold of 25")
                if None not in (low, best, high) and not low <= best <= high:
                    raise ValueError("fatality estimates out of low/best/high order")
            except ValueError as error:
                raise ValueError(f"{path}:{reader.line_num}: {error}") from error
            keys.add(key)
            rows.append(ActorYear(actor_id, year, row["is_government_actor"], low, best, high))
    return rows


def summarize_group(year, actor_type, group):
    summary = {
        "year": year,
        "actor_type": actor_type,
        "actor_year_rows": len(group),
        "unique_actor_ids": len({row.actor_id for row in group}),
        "unknown_native_actor_type_rows": len(group) if actor_type == UNKNOWN_TYPE else 0,
        "cultural_classification_not_attempted_rows": len(group),
    }
    for metric in METRICS:
        observed = [getattr(row, metric) for row in group if getattr(row, metric) is not None]
        summary[f"{metric}_sum"] = sum(observed)
        summary[f"missing_{metric}_rows"] = len(group) - len(observed)
    has_missing = any(summary[f"missing_{metric}_rows"] for metric in METRICS)
    summary["sum_status"] = (
        "partial_observed_sum_missing_values_not_imputed" if has_missing
        else "complete_for_present_source_rows"
    )
    summary["estimate_semantics"] = "source low/best/high sums;not statistical confidence interval"
    summary["zero_semantics"] = "no source rows or zero observed source sum;not proof world absence"
    return summary


def annual_python(rows):
    groups = defaultdict(list)
    for row in rows:
        actor_type = ACTOR_TYPES.get(row.government_flag, UNKNOWN_TYPE)
        groups[row.year, actor_type].append(row)
    return [
        summarize_group(year, actor_type, groups[year, actor_type])
        for year in YEARS
        for actor_type in (*ACTOR_TYPES.values(), UNKNOWN_TYPE)
    ]


def run_sql(rows, query_path=SQL):
    with closing(sqlite3.connect(":memory:")) as connection:
        connection.row_factory = sqlite3.Row
        connection.execute(
            "CREATE TABLE source (actor_id TEXT, year INTEGER, is_government_actor TEXT, "
            "low INTEGER, best INTEGER, high INTEGER)"
        )
        connection.executemany("INSERT INTO source VALUES (?, ?, ?, ?, ?, ?)", rows)
        return [dict(row) for row in connection.execute(query_path.read_text(encoding="utf-8"))]


def compare(actual, reference, label):
    for number, (left, right) in enumerate(zip_longest(actual, reference), 1):
        if left != right:
            raise ValueError(f"{label} differs from Python at result row {number}: {left!r} != {right!r}")


def write_output(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_file = NamedTemporaryFile(
        mode="w", encoding="utf-8-sig", newline="", dir=path.parent, delete=False,
    )
    temporary_path = Path(temporary_file.name)
    try:
        with temporary_file as stream:
            writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)
        temporary_path.replace(path)
    finally:
        temporary_path.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=BUNDLED_INPUT, help="OSV 26.1 CSV")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="annual totals CSV")
    parser.add_argument(
        "--check", action="store_true",
        help="compare Python with SQL and, for the bundled input, the published table",
    )
    args = parser.parse_args()

    try:
        source = args.input.resolve()
        rows = read_source(source)
        annual = annual_python(rows)
        if args.check:
            compare(annual, run_sql(rows), "SQL")
            reference_label = "Python and SQL"
            if source == BUNDLED_INPUT.resolve():
                with EXPECTED.open(encoding="utf-8-sig", newline="") as stream:
                    expected = list(csv.DictReader(stream))
                text_rows = [{name: str(value) for name, value in row.items()} for row in annual]
                compare(text_rows, expected, "published table")
                reference_label += " and the published table"
            print(f"OK: {reference_label} agree ({len(rows)} input rows, {len(annual)} result rows).")
        else:
            output = args.output.resolve()
            if output in {source, BUNDLED_INPUT.resolve(), EXPECTED.resolve()}:
                raise ValueError(f"cannot overwrite input or published table: {output}")
            write_output(output, annual)
            print(f"Wrote {len(annual)} result rows to {output}")
    except (OSError, csv.Error, ValueError, sqlite3.Error, OverflowError) as error:
        parser.exit(1, f"error: {error}\n")


if __name__ == "__main__":
    main()

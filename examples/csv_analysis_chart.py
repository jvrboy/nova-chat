"""Analyze a CSV dataset and generate a chart for Nova's Code Executor.

Usage inside Code Executor:
    Set CSV_PATH to a mounted/uploaded CSV file, then run this script.

The script is intentionally dependency-light: pandas and matplotlib are
available in the standard data-analysis sandbox image.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd


SCRIPT_DIR = Path(__file__).resolve().parent
CSV_PATH = os.environ.get("CSV_PATH", str(SCRIPT_DIR / "sample_sales.csv"))
OUTPUT_DIR = Path(os.environ.get("OUTPUT_DIR", str(SCRIPT_DIR / "output")))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def choose_columns(frame: pd.DataFrame) -> tuple[str, str]:
    """Choose a date/category column and a numeric measure automatically."""
    numeric = frame.select_dtypes(include="number").columns.tolist()
    if not numeric:
        raise ValueError("The CSV must contain at least one numeric column to chart.")

    date_like = [
        column
        for column in frame.columns
        if "date" in column.lower() or "month" in column.lower() or "time" in column.lower()
    ]
    x_column = date_like[0] if date_like else frame.columns[0]
    return x_column, numeric[0]


def main() -> None:
    source = Path(CSV_PATH)
    if not source.exists():
        raise FileNotFoundError(f"CSV file not found: {source.resolve()}")

    frame = pd.read_csv(source)
    if frame.empty:
        raise ValueError("The CSV file is empty.")

    x_column, y_column = choose_columns(frame)
    frame[y_column] = pd.to_numeric(frame[y_column], errors="coerce")
    frame = frame.dropna(subset=[y_column]).copy()
    if frame.empty:
        raise ValueError(f"Column '{y_column}' has no usable numeric values.")

    # Aggregate duplicate x-axis values so the chart stays readable.
    grouped = frame.groupby(x_column, as_index=False)[y_column].sum()
    grouped = grouped.sort_values(x_column)

    summary = {
        "source": str(source),
        "rows_read": int(len(frame)),
        "x_column": x_column,
        "value_column": y_column,
        "total": float(frame[y_column].sum()),
        "average": float(frame[y_column].mean()),
        "minimum": float(frame[y_column].min()),
        "maximum": float(frame[y_column].max()),
        "top_value": grouped.loc[grouped[y_column].idxmax(), x_column],
    }

    chart_path = OUTPUT_DIR / "csv_analysis_chart.png"
    report_path = OUTPUT_DIR / "csv_analysis_report.json"

    plt.figure(figsize=(10, 5.5))
    plt.plot(grouped[x_column].astype(str), grouped[y_column], marker="o", linewidth=2.5, color="#2563eb")
    plt.fill_between(range(len(grouped)), grouped[y_column], alpha=0.12, color="#2563eb")
    plt.title(f"{y_column} by {x_column}", fontsize=16, weight="bold")
    plt.xlabel(x_column)
    plt.ylabel(y_column)
    plt.xticks(rotation=35, ha="right")
    plt.grid(axis="y", alpha=0.25)
    plt.tight_layout()
    plt.savefig(chart_path, dpi=160, bbox_inches="tight")
    plt.close()

    report_path.write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")
    print(json.dumps({"summary": summary, "chart": str(chart_path), "report": str(report_path)}, indent=2, default=str))


if __name__ == "__main__":
    main()

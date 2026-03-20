"""
Train Gradient Boosting models to predict log10(Enterococcus) from
environmental features.

Trains:
  1. One default (statewide) model
  2. One model per NOAA region (regional models)

Usage:
    python -m scripts.train_model [--input data/training_data.csv] [--models-dir models]

Run from the prediction-api directory.
"""

import argparse
import json
import os
import pickle

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import root_mean_squared_error, r2_score, mean_absolute_error
from sklearn.model_selection import cross_val_score, train_test_split

FEATURES = [
    "antecedent_fib_log10",
    "days_since_last_sample",
    "precipitation_mm",
    "precipitation_48h_mm",
    "precipitation_72h_mm",
    "precipitation_7d_mm",
    "log_precip_mm",
    "log_precip_48h_mm",
    "tide_level_m",
    "tide_range_m",
    "water_temp_c",
    "air_temp_c",
    "wind_speed_ms",
    "wave_height_m",
    "wave_period_s",
    "month",
    "day_of_year",
    "season_sin",
    "season_cos",
]

MIN_ROWS_FOR_REGIONAL = 300


def load_and_prepare(csv_path: str) -> pd.DataFrame:
    df = pd.read_csv(csv_path, on_bad_lines="skip")
    print(f"Loaded {len(df)} rows from {csv_path}")

    df = df.dropna(subset=["enterococcus_mpn"])
    df = df[df["enterococcus_mpn"] > 0]

    # Target: log10(ENT)
    df["log10_ent"] = np.log10(df["enterococcus_mpn"].clip(lower=1))

    # Antecedent FIB in log10 scale
    df["antecedent_fib_log10"] = np.log10(df["antecedent_fib"].clip(lower=1))
    median_log = df["log10_ent"].median()
    mask = df["antecedent_fib"].isna()
    if "geo_mean_30d" in df.columns:
        fallback = np.log10(df.loc[mask, "geo_mean_30d"].clip(lower=1))
        df.loc[mask, "antecedent_fib_log10"] = fallback
    remaining_na = df["antecedent_fib_log10"].isna()
    df.loc[remaining_na, "antecedent_fib_log10"] = median_log

    # Fill missing days_since_last_sample with a high default (30 = stale)
    if "days_since_last_sample" in df.columns:
        df["days_since_last_sample"] = df["days_since_last_sample"].fillna(30)

    # Log-precip: fill from raw precipitation if missing
    if "log_precip_mm" in df.columns and "precipitation_mm" in df.columns:
        needs_fill = df["log_precip_mm"].isna() & df["precipitation_mm"].notna()
        df.loc[needs_fill, "log_precip_mm"] = np.log10(df.loc[needs_fill, "precipitation_mm"] + 1)
    if "log_precip_48h_mm" in df.columns and "precipitation_48h_mm" in df.columns:
        needs_fill = df["log_precip_48h_mm"].isna() & df["precipitation_48h_mm"].notna()
        df.loc[needs_fill, "log_precip_48h_mm"] = np.log10(df.loc[needs_fill, "precipitation_48h_mm"] + 1)

    # Fill remaining NaN features with median
    for col in FEATURES:
        if col in df.columns and df[col].isna().any():
            df[col] = df[col].fillna(df[col].median())

    print(f"After cleaning: {len(df)} rows")
    return df


def train_and_save(
    df: pd.DataFrame,
    output_path: str,
    label: str = "default",
    min_samples_leaf: int = 10,
):
    """Train a single model on the given dataframe and save it."""
    available = [f for f in FEATURES if f in df.columns]
    X = df[available].values
    y = df["log10_ent"].values

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )
    print(f"  Train: {len(X_train)}, Test: {len(X_test)}")

    model = GradientBoostingRegressor(
        n_estimators=400,
        max_depth=5,
        learning_rate=0.06,
        subsample=0.8,
        min_samples_leaf=min_samples_leaf,
        random_state=42,
    )
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    r2 = r2_score(y_test, y_pred)
    rmse = root_mean_squared_error(y_test, y_pred)
    mae = mean_absolute_error(y_test, y_pred)

    print(f"  R²:   {r2:.4f}")
    print(f"  RMSE: {rmse:.4f}  (in log10 units) ≈ {10**rmse:.1f}× factor")
    print(f"  MAE:  {mae:.4f}")

    cv_scores = cross_val_score(model, X, y, cv=5, scoring="r2")
    print(f"  5-fold CV R²: {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")

    # Feature importances
    importances = sorted(zip(available, model.feature_importances_), key=lambda x: -x[1])
    print(f"  Feature importances:")
    for feat, imp in importances[:10]:
        bar = "█" * int(imp * 50)
        print(f"    {feat:30s} {imp:.4f}  {bar}")

    # Exceedance detection
    threshold_log = np.log10(104)
    y_test_exceed = y_test >= threshold_log
    y_pred_exceed = y_pred >= threshold_log
    sensitivity = specificity = None
    if y_test_exceed.sum() > 0:
        sensitivity = float((y_pred_exceed & y_test_exceed).sum() / y_test_exceed.sum())
        specificity = float((~y_pred_exceed & ~y_test_exceed).sum() / (~y_test_exceed).sum())
        print(f"  Exceedance: sensitivity={sensitivity:.3f}, specificity={specificity:.3f}")

    # Save
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "wb") as f:
        pickle.dump(model, f)
    print(f"  → Saved to {output_path}")

    stats = {}
    for feat in available:
        col = df[feat]
        stats[feat] = {"mean": float(col.mean()), "std": float(col.std())}

    meta_path = output_path.replace(".pkl", "_meta.json")
    meta = {
        "features": available,
        "normalization_stats": stats,
        "training_rows": len(df),
        "test_r2": round(r2, 4),
        "test_rmse": round(rmse, 4),
        "cv_r2_mean": round(cv_scores.mean(), 4),
        "sensitivity": round(sensitivity, 4) if sensitivity else None,
        "specificity": round(specificity, 4) if specificity else None,
    }
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)

    return meta


def main(csv_path: str, models_dir: str):
    df = load_and_prepare(csv_path)

    # ---- 1. Train default (statewide) model ----
    print(f"\n{'='*60}")
    print(f"Training DEFAULT (statewide) model  ({len(df)} rows)")
    print(f"{'='*60}")
    default_meta = train_and_save(
        df,
        os.path.join(models_dir, "default_model.pkl"),
        label="default",
    )

    # ---- 2. Train regional models ----
    if "noaa_region" not in df.columns:
        print("\nNo noaa_region column — skipping regional models.")
        return

    regions = df["noaa_region"].dropna().unique()
    summary = [{"region": "default", **default_meta}]

    for region in sorted(regions):
        rdf = df[df["noaa_region"] == region]
        if len(rdf) < MIN_ROWS_FOR_REGIONAL:
            print(f"\n  Skipping region '{region}' — only {len(rdf)} rows (need {MIN_ROWS_FOR_REGIONAL})")
            continue

        print(f"\n{'='*60}")
        print(f"Training REGIONAL model: {region}  ({len(rdf)} rows)")
        print(f"{'='*60}")

        meta = train_and_save(
            rdf,
            os.path.join(models_dir, f"region_{region}.pkl"),
            label=region,
            min_samples_leaf=max(5, len(rdf) // 200),
        )
        summary.append({"region": region, **meta})

    # Save summary
    print(f"\n{'='*60}")
    print("MODEL SUMMARY")
    print(f"{'='*60}")
    print(f"{'Region':<20} {'Rows':>6} {'Test R²':>8} {'CV R²':>8} {'RMSE':>6} {'Sens':>6} {'Spec':>6}")
    print("-" * 70)
    for s in summary:
        print(
            f"{s['region']:<20} "
            f"{s['training_rows']:>6} "
            f"{s.get('test_r2', 0):>8.4f} "
            f"{s.get('cv_r2_mean', 0):>8.4f} "
            f"{s.get('test_rmse', 0):>6.4f} "
            f"{s.get('sensitivity', 0) or 0:>6.3f} "
            f"{s.get('specificity', 0) or 0:>6.3f}"
        )

    with open(os.path.join(models_dir, "training_summary.json"), "w") as f:
        json.dump(summary, f, indent=2)
    print(f"\nSummary saved to {models_dir}/training_summary.json")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train water quality models")
    parser.add_argument("--input", default="data/training_data.csv")
    parser.add_argument("--models-dir", default="models")
    args = parser.parse_args()
    main(args.input, args.models_dir)

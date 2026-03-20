"""
Build a focused training dataset for Hermosa Beach stations only.

Data sources:
  - CKAN: Enterococcus test results (6+ years)
  - NOAA CO-OPS: Tide predictions + water temperature
  - NOAA GHCN: Precipitation, air temperature, wind (from LAX airport)
  - CDIP: Wave height and period (from buoy 092 / San Pedro)

Usage:
    python -m scripts.build_hermosa_data [--years 6] [--output data/hermosa_training.csv]
"""

import argparse
import csv
import functools
import math
import os
import struct
import time
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

import requests

print = functools.partial(print, flush=True)  # type: ignore

CKAN_BASE = "https://data.ca.gov/api/3/action"
RESOURCE_ID = "15a63495-8d9f-4a49-b43a-3092ef3106b9"
HERMOSA_FILTER = "Hermosa Beach"

NOAA_BASE = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter"
NOAA_STATION_ID = "9410230"  # Los Angeles (closest to Hermosa)

GHCN_STATION = "USW00023174"  # LAX airport (~5 miles from Hermosa)
GHCN_URL = f"https://www.ncei.noaa.gov/data/global-historical-climatology-network-daily/access/{GHCN_STATION}.csv"

CDIP_BUOY = "092"  # San Pedro buoy (closest to Hermosa Beach)


# ---------------------------------------------------------------------------
# CKAN
# ---------------------------------------------------------------------------

def fetch_hermosa_samples(years: int = 6) -> List[dict]:
    since = (datetime.now() - timedelta(days=years * 365)).strftime("%Y-%m-%d")
    samples: List[dict] = []
    offset = 0
    batch = 5000

    print(f"Fetching Hermosa Beach Enterococcus samples since {since} …")
    while True:
        sql = (
            f'SELECT "StationName","StationCode","SampleDate","Result",'
            f'"TargetLatitude","TargetLongitude","30DayGeoMean" '
            f'FROM "{RESOURCE_ID}" '
            f"WHERE \"Analyte\" = 'Enterococcus' "
            f"AND \"StationName\" LIKE '%{HERMOSA_FILTER}%' "
            f"AND \"SampleDate\" >= '{since}' "
            f"LIMIT {batch} OFFSET {offset}"
        )
        resp = requests.get(
            f"{CKAN_BASE}/datastore_search_sql",
            params={"sql": sql},
            timeout=120,
        )
        resp.raise_for_status()
        data = resp.json()
        if not data.get("success"):
            print("CKAN query failed:", data)
            break
        records = data["result"]["records"]
        if not records:
            break
        for r in records:
            val = r.get("Result", "")
            if val and val != "NR":
                try:
                    float(val)
                    samples.append(r)
                except (ValueError, TypeError):
                    pass
        offset += len(records)
        print(f"  … {len(samples)} valid samples ({offset} raw rows)")
        if len(records) < batch:
            break
        time.sleep(0.3)

    samples.sort(key=lambda r: (r.get("StationName", ""), r.get("SampleDate", "")))
    print(f"Total valid Hermosa samples: {len(samples)}")
    stations = set(s.get("StationName", "") for s in samples)
    print(f"Stations found: {stations}")
    return samples


# ---------------------------------------------------------------------------
# NOAA CO-OPS (tides + water temp)
# ---------------------------------------------------------------------------

def fetch_noaa_range(station_id: str, product: str, start: str, end: str) -> Dict[str, dict]:
    results: Dict[str, dict] = {}
    params = {
        "product": product,
        "application": "beach_wq_model",
        "begin_date": start.replace("-", ""),
        "end_date": end.replace("-", ""),
        "datum": "MLLW",
        "station": station_id,
        "time_zone": "gmt",
        "units": "metric",
        "interval": "h",
        "format": "json",
    }
    try:
        resp = requests.get(NOAA_BASE, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        key_field = "predictions" if product == "predictions" else "data"
        records = data.get(key_field, [])
        by_date: Dict[str, List[float]] = defaultdict(list)
        for r in records:
            v = r.get("v")
            t = r.get("t", "")
            if v is None or v == "":
                continue
            date_part = t[:10] if len(t) >= 10 else ""
            if date_part:
                date_key = f"{date_part[:4]}-{date_part[5:7]}-{date_part[8:10]}"
                by_date[date_key].append(float(v))
        for dk, vals in by_date.items():
            results[dk] = {
                "mean": sum(vals) / len(vals),
                "min": min(vals),
                "max": max(vals),
                "range": max(vals) - min(vals),
            }
    except Exception as e:
        print(f"  NOAA error ({station_id}/{product}): {e}")
    return results


# ---------------------------------------------------------------------------
# NOAA GHCN (weather from LAX airport)
# ---------------------------------------------------------------------------

def load_ghcn_weather(min_date: str) -> Dict[str, dict]:
    """Download and parse GHCN daily data for LAX airport."""
    print(f"Downloading GHCN weather data from LAX airport …")
    resp = requests.get(GHCN_URL, timeout=120, stream=True)
    resp.raise_for_status()

    csv_path = "data/lax_weather_ghcn.csv"
    os.makedirs("data", exist_ok=True)
    with open(csv_path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=8192):
            f.write(chunk)

    weather: Dict[str, dict] = {}
    with open(csv_path, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            date = row.get("DATE", "")
            if date < min_date:
                continue

            # GHCN values are in tenths of their unit
            prcp_raw = row.get("PRCP", "").strip()
            tmax_raw = row.get("TMAX", "").strip()
            tmin_raw = row.get("TMIN", "").strip()
            awnd_raw = row.get("AWND", "").strip()
            wdf2_raw = row.get("WDF2", "").strip()

            prcp = float(prcp_raw) / 10.0 if prcp_raw else None  # mm
            tmax = float(tmax_raw) / 10.0 if tmax_raw else None  # °C
            tmin = float(tmin_raw) / 10.0 if tmin_raw else None  # °C
            awnd = float(awnd_raw) / 10.0 if awnd_raw else None  # m/s
            wdir = float(wdf2_raw) if wdf2_raw else None          # degrees

            air_temp = ((tmax + tmin) / 2.0) if (tmax is not None and tmin is not None) else None

            weather[date] = {
                "precipitation_mm": prcp,
                "air_temp_c": air_temp,
                "wind_speed_ms": awnd,
                "wind_dir_deg": wdir,
            }

    count = len(weather)
    print(f"  → {count} days of weather data loaded (from {min_date})")
    return weather


# ---------------------------------------------------------------------------
# CDIP wave data
# ---------------------------------------------------------------------------

def load_cdip_waves(min_date: str, max_date: str) -> Dict[str, dict]:
    """Fetch daily wave stats from CDIP buoy via THREDDS OPeNDAP."""
    print(f"Fetching CDIP wave data (buoy {CDIP_BUOY}) …")

    min_ts = int(datetime.strptime(min_date, "%Y-%m-%d").timestamp())
    max_ts = int((datetime.strptime(max_date, "%Y-%m-%d") + timedelta(days=1)).timestamp())

    # First, get the total number of records to find our date range indices
    # Fetch a small sample to understand time spacing
    base_url = f"https://thredds.cdip.ucsd.edu/thredds/dodsC/cdip/archive/{CDIP_BUOY}p1/{CDIP_BUOY}p1_historic.nc"

    # Get last index to know dataset size
    try:
        resp = requests.get(f"{base_url}.ascii?waveTime[0:1:0]", timeout=30)
        resp.raise_for_status()
        first_time = int(resp.text.split("\n")[-2].strip().split(",")[0])

        # CDIP records every ~30 minutes; estimate index range
        secs_per_record = 1800  # 30 min
        start_idx = max(0, (min_ts - first_time) // secs_per_record - 100)
        end_idx = start_idx + (max_ts - min_ts) // secs_per_record + 200

        # Fetch in chunks to avoid huge responses
        chunk_size = 50000
        daily_waves: Dict[str, List[Tuple[float, float]]] = defaultdict(list)

        idx = start_idx
        while idx < end_idx + chunk_size:
            chunk_end = min(idx + chunk_size - 1, end_idx + chunk_size)
            url = f"{base_url}.ascii?waveTime[{idx}:{chunk_end}],waveHs[{idx}:{chunk_end}],waveTp[{idx}:{chunk_end}]"
            try:
                resp = requests.get(url, timeout=60)
                if resp.status_code != 200:
                    break
                lines = resp.text.strip().split("\n")

                # Parse THREDDS ASCII response
                times = []
                hs_vals = []
                tp_vals = []
                section = None
                for line in lines:
                    line = line.strip()
                    if line.startswith("waveTime"):
                        section = "time"
                        continue
                    elif line.startswith("waveHs"):
                        section = "hs"
                        continue
                    elif line.startswith("waveTp"):
                        section = "tp"
                        continue
                    elif line.startswith("Dataset") or line.startswith("---") or line.startswith("}") or line.startswith("{") or "=" in line and "[" in line:
                        continue

                    if section == "time":
                        for val in line.split(","):
                            val = val.strip()
                            if val:
                                try:
                                    times.append(int(val))
                                except ValueError:
                                    pass
                    elif section == "hs":
                        for val in line.split(","):
                            val = val.strip()
                            if val:
                                try:
                                    hs_vals.append(float(val))
                                except ValueError:
                                    pass
                    elif section == "tp":
                        for val in line.split(","):
                            val = val.strip()
                            if val:
                                try:
                                    tp_vals.append(float(val))
                                except ValueError:
                                    pass

                # Match up and group by date
                n = min(len(times), len(hs_vals), len(tp_vals))
                found_past_range = False
                for i in range(n):
                    if times[i] < min_ts:
                        continue
                    if times[i] > max_ts:
                        found_past_range = True
                        break
                    date_str = datetime.utcfromtimestamp(times[i]).strftime("%Y-%m-%d")
                    if hs_vals[i] > 0 and hs_vals[i] < 50:
                        daily_waves[date_str].append((hs_vals[i], tp_vals[i] if tp_vals[i] > 0 else 8.0))

                if found_past_range or n == 0:
                    break
            except Exception as e:
                print(f"  CDIP chunk error at idx {idx}: {e}")
                break

            idx = chunk_end + 1
            time.sleep(0.5)

        # Compute daily max
        waves: Dict[str, dict] = {}
        for date, measurements in daily_waves.items():
            hs_list = [m[0] for m in measurements]
            tp_list = [m[1] for m in measurements]
            waves[date] = {
                "wave_height_m": max(hs_list),
                "wave_period_s": tp_list[hs_list.index(max(hs_list))],
            }

        print(f"  → {len(waves)} days of wave data")
        return waves

    except Exception as e:
        print(f"  CDIP fetch error: {e}")
        return {}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _cumulative_precip(weather: Dict[str, dict], date_str: str, days: int) -> Optional[float]:
    total = 0.0
    has_any = False
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    for d in range(days):
        dk = (dt - timedelta(days=d)).strftime("%Y-%m-%d")
        p = weather.get(dk, {}).get("precipitation_mm")
        if p is not None:
            total += p
            has_any = True
    return total if has_any else None


FIELDNAMES = [
    "station_name", "station_code", "sample_date",
    "enterococcus_mpn", "geo_mean_30d",
    "antecedent_fib", "days_since_last_sample",
    "lat", "lon",
    "tide_level_m", "tide_range_m",
    "water_temp_c",
    "precipitation_mm", "precipitation_48h_mm",
    "precipitation_72h_mm", "precipitation_7d_mm",
    "log_precip_mm", "log_precip_48h_mm",
    "air_temp_c", "wind_speed_ms", "wind_dir_deg",
    "wave_height_m", "wave_period_s",
    "month", "day_of_year", "day_of_week",
    "season_sin", "season_cos",
]


def build_dataset(years: int, output_path: str):
    samples = fetch_hermosa_samples(years)
    if not samples:
        print("No samples — exiting.")
        return

    # Antecedent FIB + days-since-last-sample
    by_station: Dict[str, List[dict]] = defaultdict(list)
    for s in samples:
        by_station[s.get("StationName", "")].append(s)

    antecedent_map: Dict[Tuple[str, str], Optional[float]] = {}
    days_since_map: Dict[Tuple[str, str], Optional[int]] = {}
    for name, recs in by_station.items():
        for i, r in enumerate(recs):
            dk = r.get("SampleDate", "")[:10]
            if i > 0:
                try:
                    antecedent_map[(name, dk)] = float(recs[i - 1]["Result"])
                except (TypeError, ValueError):
                    antecedent_map[(name, dk)] = None
                prev_dk = recs[i - 1].get("SampleDate", "")[:10]
                try:
                    delta = (datetime.strptime(dk, "%Y-%m-%d") - datetime.strptime(prev_dk, "%Y-%m-%d")).days
                    days_since_map[(name, dk)] = delta
                except ValueError:
                    days_since_map[(name, dk)] = None
            else:
                antecedent_map[(name, dk)] = None
                days_since_map[(name, dk)] = None

    # Deduplicate
    seen = set()
    unique: List[dict] = []
    for s in samples:
        k = (s.get("StationName", ""), s.get("SampleDate", "")[:10])
        if k not in seen:
            seen.add(k)
            unique.append(s)
    print(f"Unique (station, date) pairs: {len(unique)}")

    # Date range
    all_dates = [s.get("SampleDate", "")[:10] for s in unique if s.get("SampleDate")]
    all_dates = [d for d in all_dates if len(d) == 10]
    min_date = min(all_dates)
    max_date = max(all_dates)
    min_date_ext = (datetime.strptime(min_date, "%Y-%m-%d") - timedelta(days=7)).strftime("%Y-%m-%d")
    print(f"Date range: {min_date} to {max_date} (extended to {min_date_ext})")

    # ---- 1. NOAA tides + water temp ----
    print("\n--- Fetching NOAA data (station 9410230 / Los Angeles) ---")
    tide_all: Dict[str, dict] = {}
    temp_all: Dict[str, dict] = {}
    d = datetime.strptime(min_date_ext, "%Y-%m-%d")
    end_dt = datetime.strptime(max_date, "%Y-%m-%d")
    while d <= end_dt:
        chunk_end = min(d + timedelta(days=30), end_dt)
        s_str = d.strftime("%Y-%m-%d")
        e_str = chunk_end.strftime("%Y-%m-%d")
        tide_chunk = fetch_noaa_range(NOAA_STATION_ID, "predictions", s_str, e_str)
        tide_all.update(tide_chunk)
        temp_chunk = fetch_noaa_range(NOAA_STATION_ID, "water_temperature", s_str, e_str)
        temp_all.update(temp_chunk)
        d = chunk_end + timedelta(days=1)
        time.sleep(0.15)
    print(f"  → {len(tide_all)} tide days, {len(temp_all)} water temp days")

    # ---- 2. GHCN weather (LAX airport) ----
    print("\n--- Loading GHCN weather data ---")
    weather = load_ghcn_weather(min_date_ext)

    # ---- 3. CDIP waves ----
    print("\n--- Fetching CDIP wave data ---")
    waves = load_cdip_waves(min_date_ext, max_date)

    # ---- Write CSV ----
    print(f"\n--- Writing CSV ---")
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    written = 0
    skipped = 0
    weather_hits = 0
    wave_hits = 0

    with open(output_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()

        for s in unique:
            station = s.get("StationName", "")
            code = s.get("StationCode", "")
            dk = s.get("SampleDate", "")[:10]
            try:
                result = float(s["Result"])
                lat = float(s["TargetLatitude"])
                lon = float(s["TargetLongitude"])
            except (TypeError, ValueError):
                skipped += 1
                continue
            if lat == 0 and lon == 0:
                skipped += 1
                continue

            try:
                geo_mean = float(s.get("30DayGeoMean") or 0)
            except (TypeError, ValueError):
                geo_mean = None

            ant_fib = antecedent_map.get((station, dk))
            days_since = days_since_map.get((station, dk))

            # NOAA
            tide_info = tide_all.get(dk, {})
            tide_mean = tide_info.get("mean")
            tide_range = tide_info.get("range")
            wtemp_info = temp_all.get(dk, {})
            wtemp = wtemp_info.get("mean")

            # GHCN weather (shared across all Hermosa stations — LAX is close)
            w = weather.get(dk, {})
            precip_today = w.get("precipitation_mm")
            precip_48h = _cumulative_precip(weather, dk, 2)
            precip_72h = _cumulative_precip(weather, dk, 3)
            precip_7d = _cumulative_precip(weather, dk, 7)

            log_precip = math.log10(precip_today + 1) if precip_today is not None else None
            log_precip_48h = math.log10(precip_48h + 1) if precip_48h is not None else None

            if precip_today is not None:
                weather_hits += 1

            # CDIP waves
            wv = waves.get(dk, {})
            if wv:
                wave_hits += 1

            # Temporal features
            try:
                dt = datetime.strptime(dk, "%Y-%m-%d")
                month = dt.month
                doy = dt.timetuple().tm_yday
                dow = dt.weekday()
                season_sin = math.sin(2 * math.pi * doy / 365.25)
                season_cos = math.cos(2 * math.pi * doy / 365.25)
            except ValueError:
                month = doy = dow = None
                season_sin = season_cos = None

            row = {
                "station_name": station,
                "station_code": code,
                "sample_date": dk,
                "enterococcus_mpn": result,
                "geo_mean_30d": geo_mean,
                "antecedent_fib": ant_fib,
                "days_since_last_sample": days_since,
                "lat": lat,
                "lon": lon,
                "tide_level_m": tide_mean,
                "tide_range_m": tide_range,
                "water_temp_c": wtemp,
                "precipitation_mm": precip_today,
                "precipitation_48h_mm": precip_48h,
                "precipitation_72h_mm": precip_72h,
                "precipitation_7d_mm": precip_7d,
                "log_precip_mm": log_precip,
                "log_precip_48h_mm": log_precip_48h,
                "air_temp_c": w.get("air_temp_c"),
                "wind_speed_ms": w.get("wind_speed_ms"),
                "wind_dir_deg": w.get("wind_dir_deg"),
                "wave_height_m": wv.get("wave_height_m"),
                "wave_period_s": wv.get("wave_period_s"),
                "month": month,
                "day_of_year": doy,
                "day_of_week": dow,
                "season_sin": season_sin,
                "season_cos": season_cos,
            }
            writer.writerow(row)
            written += 1

    print(f"\n{'='*60}")
    print(f"Done! Wrote {written} rows to {output_path} ({skipped} skipped)")
    print(f"  Weather coverage: {weather_hits}/{written} ({100*weather_hits/max(written,1):.1f}%)")
    print(f"  Wave coverage:    {wave_hits}/{written} ({100*wave_hits/max(written,1):.1f}%)")
    print(f"  Tide coverage:    {sum(1 for d in all_dates if d in tide_all)}/{written}")
    print(f"  Water temp:       {sum(1 for d in all_dates if d in temp_all)}/{written}")
    print(f"{'='*60}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build Hermosa Beach training dataset")
    parser.add_argument("--years", type=int, default=6, help="Years of history (default: 6)")
    parser.add_argument("--output", default="data/hermosa_training.csv")
    args = parser.parse_args()
    build_dataset(args.years, args.output)

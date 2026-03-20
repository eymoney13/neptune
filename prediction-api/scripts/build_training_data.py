"""
Build training dataset by pairing historical Enterococcus results with
environmental conditions from NOAA (tide/water temp) and Open-Meteo
(weather/waves).

Improvements over v1:
  - Extended precipitation lookback (7 days) for cumulative rainfall features
  - Days-since-last-sample feature
  - Tide range (max-min) feature
  - NOAA region label for regional model training
  - Temporal features (month, day_of_year, day_of_week, seasonal sin/cos)
  - Log-precip features
  - Longer delay between Open-Meteo requests to avoid rate limiting
  - Default 3 years of data

Usage:
    python -m scripts.build_training_data [--years 3] [--output data/training_data.csv]

Run from the prediction-api directory.
"""

import argparse
import csv
import functools
import math
import os
import time
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

import requests

print = functools.partial(print, flush=True)  # type: ignore

# ---------------------------------------------------------------------------
# CKAN
# ---------------------------------------------------------------------------
CKAN_BASE = "https://data.ca.gov/api/3/action"
RESOURCE_ID = "15a63495-8d9f-4a49-b43a-3092ef3106b9"


def fetch_enterococcus_samples(years: int = 3) -> List[dict]:
    since = (datetime.now() - timedelta(days=years * 365)).strftime("%Y-%m-%d")
    samples: List[dict] = []
    offset = 0
    batch = 5000

    print(f"Fetching Enterococcus samples since {since} …")
    while True:
        sql = (
            f'SELECT "StationName","StationCode","SampleDate","Result",'
            f'"TargetLatitude","TargetLongitude","30DayGeoMean" '
            f'FROM "{RESOURCE_ID}" '
            f"WHERE \"Analyte\" = 'Enterococcus' "
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
    print(f"Total valid: {len(samples)}")
    return samples


# ---------------------------------------------------------------------------
# NOAA CO-OPS
# ---------------------------------------------------------------------------
NOAA_BASE = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter"

NOAA_STATIONS = {
    "9410170": (32.7142, -117.1733, "san_diego"),
    "9410230": (33.7200, -118.2644, "los_angeles"),
    "9410840": (34.0531, -118.2426, "santa_monica"),
    "9411340": (34.4083, -119.6856, "santa_barbara"),
    "9412110": (36.9519, -122.0269, "monterey"),
    "9413450": (37.7749, -122.4194, "san_francisco"),
    "9414290": (38.2324, -122.6369, "north_bay"),
}


def _haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat, dlon = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def nearest_noaa(lat, lon) -> Tuple[str, str]:
    """Returns (station_id, region_name)."""
    best, best_d, region = "9410170", float("inf"), "san_diego"
    for sid, (slat, slon, rname) in NOAA_STATIONS.items():
        d = _haversine(lat, lon, slat, slon)
        if d < best_d:
            best, best_d, region = sid, d, rname
    return best, region


def fetch_noaa_range_full(station_id: str, product: str, start: str, end: str) -> Dict[str, dict]:
    """Fetch NOAA data for a date range; returns {date_str: {mean, min, max, range}}."""
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
# Open-Meteo — bulk fetch weather + marine for a location + date range
# ---------------------------------------------------------------------------

def _chunked_dates(start: str, end: str, chunk_days: int = 90) -> List[Tuple[str, str]]:
    """Split a date range into chunks of chunk_days."""
    chunks = []
    d = datetime.strptime(start, "%Y-%m-%d")
    end_dt = datetime.strptime(end, "%Y-%m-%d")
    while d <= end_dt:
        chunk_end = min(d + timedelta(days=chunk_days - 1), end_dt)
        chunks.append((d.strftime("%Y-%m-%d"), chunk_end.strftime("%Y-%m-%d")))
        d = chunk_end + timedelta(days=1)
    return chunks


def _fetch_with_retry(url: str, params: dict, retries: int = 3, label: str = "") -> Optional[dict]:
    for attempt in range(retries):
        try:
            resp = requests.get(url, params=params, timeout=30)
            if resp.status_code == 429:
                wait = 15 * (attempt + 1)
                print(f"    429 {label}, waiting {wait}s …")
                time.sleep(wait)
                continue
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            if attempt == retries - 1:
                print(f"  {label} error: {e}")
            else:
                time.sleep(5)
    return None


def fetch_open_meteo_weather_range(lat: float, lon: float, start: str, end: str) -> Dict[str, dict]:
    results: Dict[str, dict] = {}
    for cs, ce in _chunked_dates(start, end, 90):
        params = {
            "latitude": round(lat, 2),
            "longitude": round(lon, 2),
            "start_date": cs,
            "end_date": ce,
            "daily": "precipitation_sum,temperature_2m_mean,wind_speed_10m_max,wind_direction_10m_dominant",
            "timezone": "America/Los_Angeles",
        }
        data = _fetch_with_retry(
            "https://archive-api.open-meteo.com/v1/archive", params,
            label=f"weather({lat:.2f},{lon:.2f})"
        )
        if data:
            daily = data.get("daily", {})
            dates = daily.get("time", [])
            precip = daily.get("precipitation_sum", [])
            temp = daily.get("temperature_2m_mean", [])
            wind = daily.get("wind_speed_10m_max", [])
            wdir = daily.get("wind_direction_10m_dominant", [])
            for i, d in enumerate(dates):
                results[d] = {
                    "precipitation_mm": precip[i] if i < len(precip) else None,
                    "air_temp_c": temp[i] if i < len(temp) else None,
                    "wind_speed_ms": wind[i] if i < len(wind) else None,
                    "wind_dir_deg": wdir[i] if i < len(wdir) else None,
                }
        time.sleep(0.5)
    return results


def fetch_open_meteo_marine_range(lat: float, lon: float, start: str, end: str) -> Dict[str, dict]:
    results: Dict[str, dict] = {}
    for cs, ce in _chunked_dates(start, end, 90):
        params = {
            "latitude": round(lat, 2),
            "longitude": round(lon, 2),
            "start_date": cs,
            "end_date": ce,
            "daily": "wave_height_max,wave_period_max",
            "timezone": "America/Los_Angeles",
        }
        data = _fetch_with_retry(
            "https://marine-api.open-meteo.com/v1/marine", params,
            label=f"marine({lat:.2f},{lon:.2f})"
        )
        if data:
            daily = data.get("daily", {})
            dates = daily.get("time", [])
            wh = daily.get("wave_height_max", [])
            wp = daily.get("wave_period_max", [])
            for i, d in enumerate(dates):
                results[d] = {
                    "wave_height_m": wh[i] if i < len(wh) else None,
                    "wave_period_s": wp[i] if i < len(wp) else None,
                }
        time.sleep(0.5)
    return results


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _cumulative_precip(weather_cache: dict, loc_key: tuple, date_str: str, days: int) -> Optional[float]:
    """Sum precipitation over the past N days ending on date_str."""
    total = 0.0
    has_any = False
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    for d in range(days):
        dk = (dt - timedelta(days=d)).strftime("%Y-%m-%d")
        w = weather_cache.get(loc_key, {}).get(dk, {})
        p = w.get("precipitation_mm")
        if p is not None:
            total += p
            has_any = True
    return total if has_any else None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def build_dataset(years: int, output_path: str):
    samples = fetch_enterococcus_samples(years)
    if not samples:
        print("No samples — exiting.")
        return

    # Build antecedent FIB map + days-since-last-sample map
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

    # Group by rounded location
    loc_groups: Dict[Tuple[float, float], List[dict]] = defaultdict(list)
    for s in unique:
        try:
            lat = round(float(s["TargetLatitude"]), 2)
            lon = round(float(s["TargetLongitude"]), 2)
        except (TypeError, ValueError):
            continue
        loc_groups[(lat, lon)].append(s)

    print(f"Unique grid locations: {len(loc_groups)}")

    # Date range (extend 7 days back for cumulative rainfall)
    all_dates = [s.get("SampleDate", "")[:10] for s in unique if s.get("SampleDate")]
    all_dates = [d for d in all_dates if len(d) == 10]
    min_date = min(all_dates)
    max_date = max(all_dates)
    min_date_ext = (datetime.strptime(min_date, "%Y-%m-%d") - timedelta(days=7)).strftime("%Y-%m-%d")
    print(f"Date range: {min_date} to {max_date} (extended to {min_date_ext})")

    # ---- NOAA (tide + water temp) ----
    print("\n--- Fetching NOAA data ---")
    noaa_tide: Dict[str, Dict[str, dict]] = {}
    noaa_temp: Dict[str, Dict[str, dict]] = {}

    for sid in NOAA_STATIONS:
        print(f"  NOAA station {sid} …")
        tide_all: Dict[str, dict] = {}
        temp_all: Dict[str, dict] = {}
        d = datetime.strptime(min_date_ext, "%Y-%m-%d")
        end_dt = datetime.strptime(max_date, "%Y-%m-%d")
        while d <= end_dt:
            chunk_end = min(d + timedelta(days=30), end_dt)
            s_str = d.strftime("%Y-%m-%d")
            e_str = chunk_end.strftime("%Y-%m-%d")
            tide_chunk = fetch_noaa_range_full(sid, "predictions", s_str, e_str)
            tide_all.update(tide_chunk)
            temp_chunk = fetch_noaa_range_full(sid, "water_temperature", s_str, e_str)
            temp_all.update(temp_chunk)
            d = chunk_end + timedelta(days=1)
            time.sleep(0.2)
        noaa_tide[sid] = tide_all
        noaa_temp[sid] = temp_all
        print(f"    → {len(tide_all)} tide days, {len(temp_all)} temp days")

    # ---- Open-Meteo (weather + marine) ----
    print("\n--- Fetching Open-Meteo data ---")
    weather_cache: Dict[Tuple[float, float], Dict[str, dict]] = {}
    marine_cache: Dict[Tuple[float, float], Dict[str, dict]] = {}

    total_locs = len(loc_groups)
    for idx, ((lat, lon), grp) in enumerate(loc_groups.items()):
        if (idx + 1) % 50 == 0 or idx == 0 or idx + 1 == total_locs:
            print(f"  Location {idx+1}/{total_locs} ({lat},{lon}) — {len(grp)} samples")

        w = fetch_open_meteo_weather_range(lat, lon, min_date_ext, max_date)
        weather_cache[(lat, lon)] = w

        m = fetch_open_meteo_marine_range(lat, lon, min_date_ext, max_date)
        marine_cache[(lat, lon)] = m

        time.sleep(0.3)

    # ---- Write CSV ----
    print(f"\n--- Writing CSV ---")
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    fieldnames = [
        "station_name", "station_code", "sample_date",
        "noaa_region",
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

    written = 0
    skipped = 0

    with open(output_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
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
            lat_r = round(lat, 2)
            lon_r = round(lon, 2)
            noaa_id, noaa_region = nearest_noaa(lat, lon)
            loc_key = (lat_r, lon_r)

            # NOAA tide (mean + range)
            tide_info = noaa_tide.get(noaa_id, {}).get(dk, {})
            tide_mean = tide_info.get("mean")
            tide_range = tide_info.get("range")

            # NOAA water temp
            wtemp_info = noaa_temp.get(noaa_id, {}).get(dk, {})
            wtemp = wtemp_info.get("mean")

            # Weather
            w = weather_cache.get(loc_key, {}).get(dk, {})

            # Cumulative rainfall
            precip_today = w.get("precipitation_mm")
            precip_48h = _cumulative_precip(weather_cache, loc_key, dk, 2)
            precip_72h = _cumulative_precip(weather_cache, loc_key, dk, 3)
            precip_7d = _cumulative_precip(weather_cache, loc_key, dk, 7)

            # Log-transformed precipitation
            log_precip = math.log10(precip_today + 1) if precip_today is not None else None
            log_precip_48h = math.log10(precip_48h + 1) if precip_48h is not None else None

            # Marine
            m = marine_cache.get(loc_key, {}).get(dk, {})

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
                "noaa_region": noaa_region,
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
                "wave_height_m": m.get("wave_height_m"),
                "wave_period_s": m.get("wave_period_s"),
                "month": month,
                "day_of_year": doy,
                "day_of_week": dow,
                "season_sin": season_sin,
                "season_cos": season_cos,
            }
            writer.writerow(row)
            written += 1

    print(f"\nDone! Wrote {written} rows to {output_path} ({skipped} skipped)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build training dataset")
    parser.add_argument("--years", type=int, default=3, help="Years of history")
    parser.add_argument("--output", default="data/training_data.csv")
    args = parser.parse_args()
    build_dataset(args.years, args.output)

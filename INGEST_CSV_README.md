# CSV Ingestion CLI

A Node.js CLI tool for ingesting CSV data into Postgres (Supabase) using streaming COPY operations. Supports both local files and CKAN API sources.

## Features

- **Streaming ingestion**: End-to-end streaming from source to Postgres COPY
- **CKAN API support**: Fetch datasets directly from CKAN portals
- **Automatic gzip decompression**: Handles `.csv.gz` files automatically
- **Staging + merge pattern**: Safe ingestion with staging table and merge to main
- **Retry logic**: Automatic retries with exponential backoff for transient errors

## Installation

```bash
npm install
```

## Prerequisites

1. **Database connection**: Set one of these environment variables:
   - `DATABASE_URL` (Postgres connection string) - **Recommended**
   - `POSTGRES_URL` (alternative)
   - `SUPABASE_DB_URL` (Supabase-specific)

   **For Supabase users:** See `SUPABASE_SETUP.md` for detailed instructions on finding your connection string.
   
   Your connection string should look like:
   ```
   postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
   ```
   
   **Not** the project URL (`https://[PROJECT-REF].supabase.co/`).

2. **Node.js 18+**: Required for native fetch and streaming APIs

## Usage

### Local File Mode

```bash
npm run ingest:csv -- --file ./public/safetoswim_geomeans_2020-present.csv
```

### CKAN Dataset Mode (package_show)

```bash
npm run ingest:csv -- \
  --ckan-base https://data.ca.gov/ \
  --dataset-id beach-water-quality-data \
  --format CSV
```

### CKAN Resource Mode (resource_show)

```bash
npm run ingest:csv -- \
  --ckan-base https://data.ca.gov/ \
  --resource-id 15a63495-8d9f-4a49-b43a-3092ef3106b9
```

### Advanced Options

```bash
npm run ingest:csv -- \
  --ckan-base https://data.ca.gov/ \
  --dataset-id beach-water-quality-data \
  --resource-name "2020-Present Geomeans" \
  --format CSV \
  --staging-table water_quality_staging \
  --main-table water_quality \
  --skip-merge
```

## Command Options

| Option | Description | Required |
|--------|-------------|----------|
| `--file <path>` | Local CSV file path | Yes (if not using CKAN) |
| `--ckan-base <url>` | CKAN base URL | Yes (if not using local file) |
| `--dataset-id <id>` | CKAN dataset/package ID | Yes (if using CKAN, unless `--resource-id` provided) |
| `--resource-id <id>` | CKAN resource ID | Yes (if using CKAN, unless `--dataset-id` provided) |
| `--resource-name <name>` | Resource name filter | No |
| `--format <format>` | Preferred format (default: CSV) | No |
| `--staging-table <name>` | Staging table name (default: `water_quality_staging`) | No |
| `--main-table <name>` | Main table name (default: `water_quality`) | No |
| `--skip-merge` | Skip merging staging to main table | No |

## Examples

### Example 1: Dataset Mode (package_show)

```bash
npm run ingest:csv -- \
  --ckan-base https://data.ca.gov/ \
  --dataset-id beach-water-quality-data \
  --format CSV
```

This will:
1. Call `package_show` to get dataset metadata
2. Select the best CSV resource (prefers CSV format, largest size)
3. Download and stream the CSV
4. Ingest into staging table
5. Merge into main table

### Example 2: Resource Mode (resource_show)

```bash
npm run ingest:csv -- \
  --ckan-base https://data.ca.gov/ \
  --resource-id 15a63495-8d9f-4a49-b43a-3092ef3106b9
```

This will:
1. Call `resource_show` to get resource metadata
2. Extract the download URL
3. Download and stream the CSV
4. Ingest into staging table
5. Merge into main table

## How It Works

### CKAN API Flow

1. **Resource ID provided**: Calls `resource_show` → extracts `url`/`download_url`
2. **Dataset ID provided**: Calls `package_show` → filters resources by:
   - Format preference (CSV)
   - Resource name (if provided)
   - File extension (.csv, .csv.gz)
   - Size (largest preferred)
3. **Download**: Streams the resource URL using Node.js fetch
4. **Decompression**: Automatically detects and decompresses `.gz` files
5. **Ingestion**: Streams directly into Postgres COPY

### Database Flow

1. **Staging table**: Creates/truncates staging table
2. **COPY FROM STDIN**: Streams CSV directly into staging using Postgres COPY
3. **Merge**: Upserts from staging to main table (deduplicates by `station_code`, `sample_date`, `analyte`)

## Error Handling

- **CKAN API errors**: Checks `success` field (not just HTTP status)
- **Retry logic**: Automatic retries for:
  - HTTP 429 (Too Many Requests)
  - HTTP 502 (Bad Gateway)
  - HTTP 503 (Service Unavailable)
  - HTTP 504 (Gateway Timeout)
  - Network errors
- **Exponential backoff**: 1s → 2s → 4s (max 10s)

## Database Schema

The tool creates tables with this schema:

```sql
CREATE TABLE water_quality_staging (
  station_name TEXT,
  station_code TEXT,
  target_latitude TEXT,
  target_longitude TEXT,
  sample_date TEXT,
  result TEXT,
  unit TEXT,
  collection_time TEXT,
  location_code TEXT,
  program TEXT,
  parent_project TEXT,
  project TEXT,
  analyte TEXT,
  "30DayGeoMean" TEXT,
  "30DayCount" TEXT,
  "6WeekGeoMean" TEXT,
  "6WeekCount" TEXT,
  result_qual_code TEXT
);
```

The main table adds:
- `created_at TIMESTAMP`
- `updated_at TIMESTAMP`
- Unique index on `(station_code, sample_date, analyte)`

## Troubleshooting

### Database Connection Error

```
Error: Database connection string not found
```

**Solution**: Set `DATABASE_URL` environment variable:
```bash
export DATABASE_URL="postgresql://user:pass@host:5432/dbname"
```

**For Supabase:** Get your connection string from Supabase Dashboard → Settings → Database. See `SUPABASE_SETUP.md` for detailed instructions.

### CKAN API Error

```
Error: CKAN API error (NotFound): Resource not found
```

**Solution**: Verify the dataset/resource ID exists:
```bash
curl "https://data.ca.gov/api/3/action/package_show?id=beach-water-quality-data"
```

### COPY Error

```
Error: COPY failed: invalid input syntax
```

**Solution**: Check CSV format matches expected schema. The tool expects:
- CSV with header row
- Comma delimiter
- Double-quote escaping

## Performance

- **Streaming**: No memory overhead for large files
- **COPY**: Fast bulk insert (much faster than INSERT)
- **Staging pattern**: Safe, allows rollback if needed

## License

Same as main project.

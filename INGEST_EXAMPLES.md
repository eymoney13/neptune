# CSV Ingestion CLI - Example Commands

## Example 1: Dataset Mode (package_show)

Fetch CSV from a CKAN dataset by package ID:

```bash
npm run ingest:csv -- \
  --ckan-base https://data.ca.gov/ \
  --dataset-id beach-water-quality-data \
  --format CSV
```

**What this does:**
1. Calls `GET https://data.ca.gov/api/3/action/package_show?id=beach-water-quality-data`
2. Filters resources to find CSV format (prefers largest)
3. Downloads and streams the CSV
4. Ingestes into `water_quality_staging` table
5. Merges into `water_quality` table

## Example 2: Resource Mode (resource_show)

Fetch CSV directly from a CKAN resource ID:

```bash
npm run ingest:csv -- \
  --ckan-base https://data.ca.gov/ \
  --resource-id 15a63495-8d9f-4a49-b43a-3092ef3106b9
```

**What this does:**
1. Calls `GET https://data.ca.gov/api/3/action/resource_show?id=15a63495-8d9f-4a49-b43a-3092ef3106b9`
2. Extracts the `download_url` or `url` from the resource
3. Downloads and streams the CSV (handles .gz automatically)
4. Ingestes into `water_quality_staging` table
5. Merges into `water_quality` table

## Additional Examples

### With Resource Name Filter

```bash
npm run ingest:csv -- \
  --ckan-base https://data.ca.gov/ \
  --dataset-id beach-water-quality-data \
  --resource-name "2020-Present Geomeans" \
  --format CSV
```

### Local File Mode

```bash
npm run ingest:csv -- \
  --file ./public/safetoswim_geomeans_2020-present.csv
```

### Skip Merge (Only Stage)

```bash
npm run ingest:csv -- \
  --ckan-base https://data.ca.gov/ \
  --resource-id 15a63495-8d9f-4a49-b43a-3092ef3106b9 \
  --skip-merge
```

## Environment Setup

Before running, set your database connection:

```bash
export DATABASE_URL="postgresql://user:password@host:5432/dbname"
# OR
export SUPABASE_DB_URL="postgresql://..."
```

## Full Command Reference

See `INGEST_CSV_README.md` for complete documentation.

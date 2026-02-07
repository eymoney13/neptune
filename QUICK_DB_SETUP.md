# Quick Database Setup

## Your Connection String

Your Supabase database connection string format:

```
postgresql://postgres:[YOUR-PASSWORD]@db.iuhhjvpsydztongnznvk.supabase.co:5432/postgres
```

## Setup Steps

### 1. Get Your Database Password

1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to **Settings** → **Database**
4. Find your database password (or reset it if needed)

### 2. Create `.env.local` File

Create a file named `.env.local` in your project root with:

```bash
DATABASE_URL="postgresql://postgres:YOUR_ACTUAL_PASSWORD_HERE@db.iuhhjvpsydztongnznvk.supabase.co:5432/postgres"
```

**Replace `YOUR_ACTUAL_PASSWORD_HERE` with your actual password.**

### 3. Test the Connection

Run the ingest command to test:

```bash
npm run ingest:csv -- --file ./public/safetoswim_geomeans_2020-present.csv
```

Or test with CKAN:

```bash
npm run ingest:csv -- \
  --ckan-base https://data.ca.gov/ \
  --resource-id 15a63495-8d9f-4a49-b43a-3092ef3106b9
```

### 4. For Vercel Production

1. Go to Vercel Dashboard → Your Project → **Settings** → **Environment Variables**
2. Add:
   - **Key**: `DATABASE_URL`
   - **Value**: `postgresql://postgres:YOUR_PASSWORD@db.iuhhjvpsydztongnznvk.supabase.co:5432/postgres`
   - **Environments**: Select all (Production, Preview, Development)
3. Click **Save**
4. **Redeploy** your project

## Security Notes

- ✅ `.env.local` is already in `.gitignore` - it won't be committed
- ⚠️ Never commit your password to Git
- ⚠️ Never share your password publicly

## Troubleshooting

If you get connection errors:
- Verify your password is correct
- Check that your IP is allowed in Supabase (Settings → Database → Connection pooling)
- Try the connection pooling URL instead (port 6543)

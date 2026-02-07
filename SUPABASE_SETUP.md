# Supabase Database Connection Setup

## Finding Your Supabase Database Connection String

The URL you provided (`https://iuhhjvpsydztongnznvk.supabase.co/`) is your Supabase **project URL**, not the database connection string.

### Step 1: Get Your Database Connection String

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project (or create one if you haven't)
3. Go to **Settings** → **Database**
4. Scroll down to **Connection string** section
5. Look for **Connection pooling** or **Direct connection**
6. Copy the connection string (it will look like one of these):

**Connection Pooling (Recommended for serverless):**
```
postgresql://postgres.iuhhjvpsydztongnznvk:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

**Direct Connection:**
```
postgresql://postgres:[YOUR-PASSWORD]@db.iuhhjvpsydztongnznvk.supabase.co:5432/postgres
```

### Step 2: Set Environment Variable

#### For Local Development

Create a `.env.local` file in your project root:

```bash
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.iuhhjvpsydztongnznvk.supabase.co:5432/postgres"
```

**Important:** Replace `[YOUR-PASSWORD]` with your actual database password.

#### For Vercel Production

1. Go to Vercel Dashboard → Your Project → **Settings** → **Environment Variables**
2. Add a new variable:
   - **Key**: `DATABASE_URL`
   - **Value**: Your connection string (from Step 1)
   - **Environment**: Production, Preview, Development (select all)
3. Click **Save**
4. **Redeploy** your project

### Step 3: Get Your Database Password

If you don't know your database password:

1. Go to Supabase Dashboard → **Settings** → **Database**
2. Look for **Database password** section
3. If you've forgotten it, click **Reset database password**
4. **Important:** Save the password securely - you won't be able to see it again!

### Step 4: Test the Connection

Run the ingest command to test:

```bash
npm run ingest:csv -- --file ./public/safetoswim_geomeans_2020-present.csv
```

If the connection works, you'll see:
```
Connecting to database...
Ensuring staging table exists...
```

## Connection String Format

Your connection string should follow this pattern:

```
postgresql://[USER]:[PASSWORD]@[HOST]:[PORT]/[DATABASE]
```

For Supabase:
- **USER**: `postgres`
- **PASSWORD**: Your database password
- **HOST**: `db.iuhhjvpsydztongnznvk.supabase.co` (direct) or `aws-0-[region].pooler.supabase.com` (pooling)
- **PORT**: `5432` (direct) or `6543` (pooling)
- **DATABASE**: `postgres`

## Security Notes

⚠️ **Never commit your `.env.local` file to Git!** It's already in `.gitignore`.

⚠️ **Never share your database password publicly!**

⚠️ **Use connection pooling for production** (port 6543) as it's optimized for serverless functions.

## Troubleshooting

### "Connection refused" or "Connection timeout"
- Check that your IP is allowed in Supabase (Settings → Database → Connection pooling → Allowed IPs)
- For local development, you may need to add your IP address
- Try the connection pooling URL instead of direct connection

### "Authentication failed"
- Double-check your password
- Make sure you're using the correct user (`postgres`)
- Try resetting your database password in Supabase

### "SSL required"
- The code automatically enables SSL for Supabase connections
- If you still get SSL errors, check your Supabase project settings

## Quick Reference

Your Supabase project reference: `iuhhjvpsydztongnznvk`

Your database connection string format:
```
postgresql://postgres:[PASSWORD]@db.iuhhjvpsydztongnznvk.supabase.co:5432/postgres
```

Replace `[PASSWORD]` with your actual database password from Supabase Dashboard.

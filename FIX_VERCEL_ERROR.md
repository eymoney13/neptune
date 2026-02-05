# Fix: "CSV file not found" Error on Vercel

## The Problem
You're seeing this error because:
1. ✅ The CSV file was removed from git (to keep repo size small)
2. ❌ The `NEXT_PUBLIC_CSV_URL` environment variable is not set in Vercel
3. ❌ The app is trying to load from a local path that doesn't exist in production

## Quick Fix (5 minutes)

### Step 1: Get Your Cloudflare R2 URL
1. Go to https://dash.cloudflare.com/
2. Navigate to **R2** → Your bucket → Click on the CSV file
3. Copy the **Public URL** (looks like: `https://pub-xxxxx.r2.dev/safetoswim_geomeans_2020-present.csv`)

### Step 2: Add to Vercel
1. Go to https://vercel.com/dashboard
2. Select your project (neptune)
3. Click **Settings** → **Environment Variables**
4. Click **Add New**
5. Enter:
   - **Name**: `NEXT_PUBLIC_CSV_URL`
   - **Value**: `[paste your R2 URL from Step 1]`
   - Select all: ✅ Production, ✅ Preview, ✅ Development
6. Click **Save**

### Step 3: Redeploy
1. Go to **Deployments** tab
2. Click **⋯** (three dots) on latest deployment
3. Click **Redeploy**
4. Wait for deployment to complete

### Step 4: Test
- Visit your Vercel URL
- The app should now load data from Cloudflare R2

## If You Haven't Set Up Cloudflare R2 Yet

Follow the guide in `QUICK_R2_SETUP.md` to:
1. Create R2 bucket
2. Upload CSV file
3. Get public URL
4. Configure CORS
5. Add to Vercel

## Troubleshooting

### Still seeing "Not Found"?
- ✅ Verify the R2 URL works in your browser (should download CSV)
- ✅ Check environment variable is set correctly in Vercel
- ✅ Make sure you redeployed after adding the variable
- ✅ Check Vercel deployment logs for errors

### CORS errors?
- Configure CORS in Cloudflare R2 bucket settings (see `QUICK_R2_SETUP.md`)

### File too large?
- The 325MB file should work fine on Cloudflare R2
- Make sure public access is enabled on the file

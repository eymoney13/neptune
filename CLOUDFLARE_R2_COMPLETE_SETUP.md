# Complete Cloudflare R2 Setup Guide

This guide will walk you through setting up Cloudflare R2 for your CSV file step-by-step.

## Prerequisites

- A Cloudflare account (free tier works)
- The CSV file at: `public/safetoswim_geomeans_2020-present.csv` (✅ Already exists - 325MB)

## Method 1: Using Cloudflare Dashboard (Easiest - Recommended)

### Step 1: Create R2 Bucket

1. **Go to Cloudflare Dashboard**
   - Visit: https://dash.cloudflare.com/
   - Log in to your account

2. **Navigate to R2**
   - In the left sidebar, click **"R2"** (under "Workers & Pages" or "Storage")
   - If you don't see R2, click **"Workers & Pages"** first, then **"R2"**

3. **Enable R2** (if first time)
   - Click **"Get started"** or **"Enable R2"**
   - You may need to add a payment method (won't be charged on free tier)
   - Accept the terms

4. **Create Bucket**
   - Click **"Create bucket"** button (top right)
   - Name: `neptune-data` (or any name you prefer)
   - Location: Choose closest to your users (e.g., `US East`)
   - Click **"Create bucket"**

### Step 2: Upload CSV File

1. **Open Your Bucket**
   - Click on the bucket you just created (`neptune-data`)

2. **Upload File**
   - Click **"Upload"** button
   - Navigate to: `/Users/ethanyoung/ backend PN/public/safetoswim_geomeans_2020-present.csv`
   - Select the file
   - Click **"Upload"**
   - ⏳ Wait for upload to complete (325MB may take 5-10 minutes)

### Step 3: Make File Publicly Accessible

1. **Click on the Uploaded File**
   - In your bucket, click on `safetoswim_geomeans_2020-present.csv`

2. **Get Public URL**
   - Look for **"Public URL"** or **"Settings"** tab
   - If you see "Public URL", copy it (looks like: `https://pub-xxxxx.r2.dev/safetoswim_geomeans_2020-present.csv`)
   - If you don't see a public URL:
     - Go to **"Settings"** tab
     - Enable **"Public Access"**
     - Copy the public URL that appears

3. **Test the URL**
   - Open the URL in your browser
   - You should see the CSV file download or display
   - ✅ If it works, proceed to Step 4
   - ❌ If you get an error, see "Troubleshooting" below

### Step 4: Configure CORS (Important!)

1. **Go to Bucket Settings**
   - In your R2 bucket, click **"Settings"** tab
   - Scroll to **"CORS Policy"**

2. **Add CORS Configuration**
   - Click **"Edit"** or **"Add CORS Policy"**
   - Paste this configuration:
   ```json
   [
     {
       "AllowedOrigins": ["*"],
       "AllowedMethods": ["GET", "HEAD"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
   - Click **"Save"**

### Step 5: Add Environment Variable to Vercel

1. **Go to Vercel Dashboard**
   - Visit: https://vercel.com/dashboard
   - Select your project (should be "neptune" or similar)

2. **Add Environment Variable**
   - Click **"Settings"** tab
   - Click **"Environment Variables"** in left sidebar
   - Click **"Add New"**
   - Enter:
     - **Name**: `NEXT_PUBLIC_CSV_URL`
     - **Value**: `https://your-bucket-url.r2.dev/safetoswim_geomeans_2020-present.csv`
       (Replace with your actual R2 URL from Step 3)
   - Select all environments: ✅ **Production**, ✅ **Preview**, ✅ **Development**
   - Click **"Save"**

3. **Redeploy**
   - Go to **"Deployments"** tab
   - Click **"⋯"** (three dots) on latest deployment
   - Click **"Redeploy"**
   - OR push a new commit to trigger automatic redeploy

### Step 6: Verify It Works

1. **Check Deployed Site**
   - Visit your Vercel URL
   - Open browser DevTools (F12) → **Console** tab
   - You should see: `"Processing row X..."` messages
   - The app should load data from Cloudflare R2

2. **Check Network Tab**
   - In DevTools → **Network** tab
   - Filter by "CSV" or look for the file name
   - You should see a request to your R2 URL
   - Status should be **200** (success)

---

## Method 2: Using Wrangler CLI (Advanced)

If you prefer command-line tools:

### Step 1: Install Wrangler

```bash
npm install -g wrangler
# or
brew install cloudflare/cloudflare/wrangler
```

### Step 2: Login

```bash
wrangler login
```

### Step 3: Run Upload Script

```bash
cd "/Users/ethanyoung/ backend PN"
chmod +x scripts/upload-to-r2.sh
./scripts/upload-to-r2.sh neptune-data
```

### Step 4: Make Public & Configure

Follow Steps 3-6 from Method 1 above.

---

## Troubleshooting

### ❌ "File not found" error
- Verify the file path is correct
- Check that the file exists: `ls -lh public/safetoswim_geomeans_2020-present.csv`

### ❌ CORS errors in browser
- Make sure you configured CORS in Step 4
- Verify the CORS policy allows your domain
- Try using `"*"` for AllowedOrigins (less secure but works for testing)

### ❌ "403 Forbidden" when accessing URL
- Check that public access is enabled on the file
- Verify the URL is correct
- Make sure the bucket allows public access

### ❌ File not loading in app
- Verify environment variable is set in Vercel
- Make sure you redeployed after adding the variable
- Check Vercel deployment logs for errors
- Clear browser cache and hard refresh (Ctrl+Shift+R)

### ❌ Still using local file
- Check that `NEXT_PUBLIC_CSV_URL` is set correctly
- Verify the URL works in browser
- Make sure you redeployed the app

---

## Cost Estimate

For a 325MB file:
- **Storage**: ~$0.005/month (well within free tier of 10GB)
- **Requests**: Free for first 1 million/month
- **Total**: Essentially **FREE** on Cloudflare's free tier

---

## Quick Reference

**Your CSV File:**
- Location: `/Users/ethanyoung/ backend PN/public/safetoswim_geomeans_2020-present.csv`
- Size: 325MB

**Environment Variable:**
- Name: `NEXT_PUBLIC_CSV_URL`
- Value: `https://your-bucket-url.r2.dev/safetoswim_geomeans_2020-present.csv`

**Vercel Project:**
- Should be connected to: `github.com/eymoney13/neptune`

---

## Next Steps After Setup

1. ✅ CSV file uploaded to R2
2. ✅ Public URL obtained
3. ✅ CORS configured
4. ✅ Environment variable added to Vercel
5. ✅ App redeployed
6. ✅ Verified working

Once complete, your app will:
- Load CSV from Cloudflare R2 (fast CDN)
- Work on Vercel without file size limits
- Keep Git repository lightweight
- Allow easy updates to CSV file

---

## Need Help?

If you encounter issues:
1. Check the troubleshooting section above
2. Verify each step was completed
3. Check Cloudflare R2 dashboard for file status
4. Check Vercel deployment logs for errors

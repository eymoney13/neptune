# Quick Setup Guide: Cloudflare R2 for CSV File

Follow these steps to upload your CSV file to Cloudflare R2 and configure your app.

## Step 1: Create Cloudflare Account & R2 Bucket

1. **Sign up/Login to Cloudflare**
   - Go to https://dash.cloudflare.com/
   - Sign up for a free account (if you don't have one)

2. **Enable R2**
   - In the Cloudflare dashboard, click **R2** in the left sidebar
   - If you see "Get started", click it to enable R2 (it's free)
   - You may need to add a payment method (won't be charged on free tier)

3. **Create a Bucket**
   - Click **Create bucket**
   - Name it: `neptune-data` (or any name you prefer)
   - Choose a location (e.g., `US East` or closest to your users)
   - Click **Create bucket**

## Step 2: Upload the CSV File

1. **Open your bucket**
   - Click on the bucket you just created

2. **Upload the file**
   - Click **Upload** button
   - Navigate to: `/Users/ethanyoung/ backend PN/public/safetoswim_geomeans_2020-present.csv`
   - Select the file and click **Upload**
   - Wait for upload to complete (325MB may take a few minutes)

## Step 3: Make File Publicly Accessible

1. **Click on the uploaded file** in your bucket

2. **Get Public URL**
   - Look for **Public URL** or **Settings** tab
   - Cloudflare R2 provides a public URL automatically
   - The URL will look like: `https://pub-xxxxx.r2.dev/safetoswim_geomeans_2020-present.csv`
   - OR you may need to enable public access:
     - Go to **Settings** → **Public Access**
     - Enable **Public Access**
     - Copy the public URL

3. **Test the URL**
   - Open the URL in your browser
   - You should see the CSV file download or display
   - If you see an error, check CORS settings (see troubleshooting below)

## Step 4: Configure Vercel Environment Variable

1. **Go to Vercel Dashboard**
   - Visit https://vercel.com/dashboard
   - Select your project (neptune)

2. **Add Environment Variable**
   - Click **Settings** tab
   - Click **Environment Variables** in the left sidebar
   - Click **Add New**
   - Enter:
     - **Name**: `NEXT_PUBLIC_CSV_URL`
     - **Value**: `https://your-bucket-url.r2.dev/safetoswim_geomeans_2020-present.csv`
       (Replace with your actual R2 URL from Step 3)
   - Select all environments: **Production**, **Preview**, **Development**
   - Click **Save**

3. **Redeploy**
   - Go to **Deployments** tab
   - Click the **⋯** menu on the latest deployment
   - Click **Redeploy**
   - OR push a new commit to trigger automatic redeploy

## Step 5: Verify It Works

1. **Check the deployed site**
   - Visit your Vercel URL
   - Open browser DevTools (F12) → Console tab
   - You should see: "Processing row X..." messages
   - The app should load data from Cloudflare R2

2. **Check Network Tab**
   - In DevTools → Network tab
   - Filter by "CSV" or look for the file name
   - You should see a request to your R2 URL
   - Status should be 200 (success)

## Troubleshooting

### CORS Errors
If you see CORS errors in the browser console:

1. **In Cloudflare R2 Dashboard:**
   - Go to your bucket → **Settings** → **CORS Policy**
   - Add this CORS configuration:
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
   - Click **Save**

### File Not Loading
- Verify the URL is correct (test in browser)
- Check that public access is enabled
- Verify the environment variable is set in Vercel
- Check Vercel deployment logs for errors

### Still Using Local File
- Make sure you redeployed after adding the environment variable
- Check that `NEXT_PUBLIC_CSV_URL` is set correctly
- Clear browser cache and hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

## Cost Estimate

For a 325MB file:
- **Storage**: ~$0.005/month (well within free tier)
- **Requests**: Free for first 1 million/month
- **Total**: Essentially **FREE** on Cloudflare's free tier

## Next Steps

Once set up, your app will:
- ✅ Load the CSV from Cloudflare R2 (fast CDN)
- ✅ Work on Vercel without file size limits
- ✅ Keep your Git repository lightweight
- ✅ Allow easy updates to the CSV file

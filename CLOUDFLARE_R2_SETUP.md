# Cloudflare R2 Setup Guide

This project uses Cloudflare R2 (or another CDN) to host the large CSV data file instead of storing it in the Git repository.

## Why?
The CSV file (`safetoswim_geomeans_2020-present.csv`) is 325MB, which exceeds GitHub's 100MB file size limit. By hosting it on Cloudflare R2, we can:
- Keep the repository lightweight
- Use fast CDN delivery
- Easily update the file without affecting git history

## Setup Instructions

### 1. Create a Cloudflare R2 Bucket

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **R2** in the sidebar
3. Click **Create bucket**
4. Name your bucket (e.g., `neptune-data` or `safetoswim-data`)
5. Choose a location close to your users

### 2. Upload the CSV File

1. In your R2 bucket, click **Upload**
2. Upload `public/safetoswim_geomeans_2020-present.csv`
3. Wait for the upload to complete

### 3. Make the File Publicly Accessible

1. Click on the uploaded file
2. Go to **Settings** or **Public Access**
3. Enable **Public Access** or create a **Public URL**
4. Copy the public URL (it will look like: `https://your-bucket.r2.dev/safetoswim_geomeans_2020-present.csv`)

### 4. Configure Environment Variable

#### For Local Development:
Create a `.env.local` file in the project root:
```bash
NEXT_PUBLIC_CSV_URL=https://your-bucket.r2.dev/safetoswim_geomeans_2020-present.csv
```

#### For Production (Vercel):
1. Go to your Vercel project settings
2. Navigate to **Environment Variables**
3. Add a new variable:
   - **Name**: `NEXT_PUBLIC_CSV_URL`
   - **Value**: `https://your-bucket.r2.dev/safetoswim_geomeans_2020-present.csv`
   - **Environment**: Production, Preview, Development (select all)
4. Redeploy your application

### 5. Fallback for Local Development

If you don't set `NEXT_PUBLIC_CSV_URL`, the app will try to load from `/safetoswim_geomeans_2020-present.csv` (local file). Make sure you have the file in your `public/` directory for local development.

## Alternative: Other CDN Options

If you prefer not to use Cloudflare R2, you can use:
- **AWS S3** with CloudFront
- **Google Cloud Storage**
- **Azure Blob Storage**
- **Vercel Blob Storage** (note: has size limits)

Just set the `NEXT_PUBLIC_CSV_URL` environment variable to your file's public URL.

## Cost

Cloudflare R2 offers:
- **Free tier**: 10GB storage, 1 million Class A operations/month
- **Pricing**: $0.015/GB storage, $4.50 per million Class A operations

For a 325MB file, this is essentially free on the free tier.

## Troubleshooting

### File not loading?
1. Check that the URL is publicly accessible (try opening it in a browser)
2. Verify CORS settings if you see CORS errors
3. Check browser console for errors
4. Ensure the environment variable is set correctly

### CORS Issues?
If you see CORS errors, you may need to configure CORS on your R2 bucket:
1. Go to R2 bucket settings
2. Configure CORS to allow requests from your domain

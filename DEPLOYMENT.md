# Deploying to Vercel

## Method 1: Deploy via Vercel CLI (Easiest)

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy from your project directory**:
   ```bash
   cd "/Users/ethanyoung/ backend PN"
   vercel
   ```

4. **Follow the prompts**:
   - Link to existing project or create new one
   - Confirm settings
   - Vercel will automatically build and deploy

5. **For production deployment**:
   ```bash
   vercel --prod
   ```

## Method 2: Deploy via GitHub/GitLab (Recommended for Production)

1. **Initialize Git repository** (if not already done):
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```

2. **Push to GitHub/GitLab**:
   - Create a new repository on GitHub or GitLab
   - Push your code:
     ```bash
     git remote add origin <your-repo-url>
     git push -u origin main
     ```

3. **Import to Vercel**:
   - Go to [vercel.com](https://vercel.com)
   - Click "Add New Project"
   - Import your GitHub/GitLab repository
   - Vercel will auto-detect Next.js settings
   - Click "Deploy"

## Important: Large CSV File Issue

⚠️ **Warning**: Your CSV file is ~341MB, which exceeds Vercel's static file size limit (typically 100MB).

### Solution Options:

#### Option A: Use External Storage (Recommended)
1. Upload CSV to:
   - **Cloudflare R2** (Free tier available)
   - **AWS S3** 
   - **Google Cloud Storage**
   - **Vercel Blob Storage** (has size limits)

2. Update `lib/data.ts` to load from external URL:
   ```typescript
   Papa.parse('https://your-cdn-url.com/safetoswim_geomeans_2020-present.csv', {
     // ... rest of config
   })
   ```

#### Option B: Pre-process CSV to JSON
1. Create a script to convert CSV to smaller JSON with only needed fields
2. Host the smaller JSON file (will be much smaller, ~50-100MB)

#### Option C: Use Server-Side Processing
1. Create an API route to process CSV server-side
2. Cache processed data in Vercel's edge cache or database

#### Option D: Sample the Data
1. Use a sample of the CSV for the public site
2. Keep full dataset for internal analysis

## Environment Variables (if needed)

If you need environment variables:
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add any required variables
3. Redeploy

## Troubleshooting

- **Build fails**: Check build logs in Vercel dashboard
- **File too large**: Use external storage (Option A above)
- **Slow loading**: Consider server-side rendering or API routes
- **Map not loading**: Ensure Leaflet CSS is properly imported (already done)

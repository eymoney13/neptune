# Deploying Python API to Railway

## Quick Deploy Steps

### Option 1: Using Railway Web Interface (Easiest)

1. **Go to Railway**: https://railway.app
2. **Sign up/Login** with GitHub
3. **Click "New Project"** → **"Deploy from GitHub repo"**
4. **Select your repository**: `neptune` (or your repo name)
5. **Set Root Directory**: `prediction-api`
6. **Railway will auto-detect** it's a Python app
7. **After deployment**, Railway will give you a URL like: `https://your-app-name.up.railway.app`
8. **Copy that URL** and use it as `PYTHON_API_URL` in Vercel

### Option 2: Using Railway CLI

1. **Install Railway CLI**:
   ```bash
   npm install -g @railway/cli
   # OR
   brew install railway
   ```

2. **Login to Railway**:
   ```bash
   railway login
   ```

3. **Navigate to prediction-api directory**:
   ```bash
   cd prediction-api
   ```

4. **Initialize Railway project**:
   ```bash
   railway init
   ```

5. **Deploy**:
   ```bash
   railway up
   ```

6. **Get the URL**:
   ```bash
   railway domain
   ```

## Configuration Files Created

- `Procfile`: Tells Railway how to start the app
- `railway.json`: Railway-specific configuration
- `runtime.txt`: Python version specification

## After Deployment

1. **Copy the Railway URL** (e.g., `https://neptune-api.up.railway.app`)
2. **Go to Vercel Dashboard** → Your Project → Settings → Environment Variables
3. **Add**: `PYTHON_API_URL` = `https://your-railway-url.up.railway.app`
4. **Redeploy** your Vercel project

## Troubleshooting

- If the app doesn't start, check Railway logs
- Make sure the `PORT` environment variable is used (Railway sets this automatically)
- Verify all dependencies are in `requirements.txt`

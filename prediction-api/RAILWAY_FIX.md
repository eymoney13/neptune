# Railway Deployment Fix

## The Problem
Railway's Railpack couldn't detect the start command for the FastAPI application.

## The Solution
I've added multiple configuration files to ensure Railway can start the app:

1. **railway.toml** - Railway-specific configuration
2. **nixpacks.toml** - Explicit build and start commands for Nixpacks
3. **start.sh** - Shell script to start the app
4. **package.json** - Alternative start command detection
5. **Procfile** - Updated with proper PORT handling

## Important: Set Root Directory in Railway

When deploying on Railway:

1. Go to your Railway project settings
2. Find the service you're deploying
3. Go to **Settings** → **Source**
4. Set **Root Directory** to: `prediction-api`
5. Save and redeploy

## Alternative: Deploy from prediction-api directory

If Railway allows, you can also:
1. Create a new service
2. Connect it to your GitHub repo
3. Set the root directory to `prediction-api` during setup

## Verification

After deployment, Railway should:
- Detect Python automatically
- Install dependencies from `requirements.txt`
- Start the app with: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

The app will be available at the Railway-provided URL (e.g., `https://your-app.up.railway.app`)

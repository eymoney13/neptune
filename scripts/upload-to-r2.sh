#!/bin/bash

# Cloudflare R2 Upload Script
# This script helps upload the CSV file to Cloudflare R2
# Prerequisites: Install Wrangler CLI (Cloudflare's CLI tool)

set -e

CSV_FILE="public/safetoswim_geomeans_2020-present.csv"
BUCKET_NAME="${1:-neptune-data}"

echo "🚀 Cloudflare R2 Upload Script"
echo "================================"
echo ""

# Check if file exists
if [ ! -f "$CSV_FILE" ]; then
    echo "❌ Error: CSV file not found at $CSV_FILE"
    exit 1
fi

echo "✅ Found CSV file: $CSV_FILE"
echo "📦 File size: $(du -h "$CSV_FILE" | cut -f1)"
echo ""

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "⚠️  Wrangler CLI not found. Installing..."
    echo ""
    echo "Please run one of these commands to install Wrangler:"
    echo "  npm install -g wrangler"
    echo "  or"
    echo "  brew install cloudflare/cloudflare/wrangler"
    echo ""
    echo "Then run this script again."
    exit 1
fi

echo "✅ Wrangler CLI found"
echo ""

# Check if logged in
if ! wrangler whoami &> /dev/null; then
    echo "⚠️  Not logged in to Cloudflare. Please login:"
    echo "  wrangler login"
    echo ""
    exit 1
fi

echo "✅ Logged in to Cloudflare"
echo ""

# Create bucket if it doesn't exist
echo "📦 Checking bucket: $BUCKET_NAME"
if ! wrangler r2 bucket list | grep -q "$BUCKET_NAME"; then
    echo "Creating bucket: $BUCKET_NAME"
    wrangler r2 bucket create "$BUCKET_NAME"
    echo "✅ Bucket created"
else
    echo "✅ Bucket already exists"
fi
echo ""

# Upload file
echo "📤 Uploading CSV file to R2..."
echo "This may take several minutes for a 325MB file..."
echo ""

wrangler r2 object put "$BUCKET_NAME/safetoswim_geomeans_2020-present.csv" \
    --file="$CSV_FILE" \
    --content-type="text/csv"

echo ""
echo "✅ Upload complete!"
echo ""

# Get public URL
echo "🔗 Getting public URL..."
echo ""
echo "To make the file publicly accessible:"
echo "1. Go to https://dash.cloudflare.com/"
echo "2. Navigate to R2 → $BUCKET_NAME"
echo "3. Click on the uploaded file"
echo "4. Enable 'Public Access' or create a custom domain"
echo "5. Copy the public URL"
echo ""
echo "Then add it to Vercel as environment variable:"
echo "  NEXT_PUBLIC_CSV_URL=https://your-bucket-url.r2.dev/safetoswim_geomeans_2020-present.csv"
echo ""

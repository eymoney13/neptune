# Quick R2 Setup Checklist

Follow these steps in order. Each step should take 2-5 minutes.

## ✅ Step-by-Step Checklist

### 1. Create Cloudflare R2 Bucket (5 min)
- [ ] Go to https://dash.cloudflare.com/
- [ ] Click **R2** in sidebar (under "Workers & Pages")
- [ ] Click **"Create bucket"**
- [ ] Name: `neptune-data`
- [ ] Location: `US East` (or closest to you)
- [ ] Click **"Create bucket"**

### 2. Upload CSV File (10 min)
- [ ] Click on your bucket (`neptune-data`)
- [ ] Click **"Upload"** button
- [ ] Select: `/Users/ethanyoung/ backend PN/public/safetoswim_geomeans_2020-present.csv`
- [ ] Wait for upload to complete (325MB = ~5-10 minutes)

### 3. Get Public URL (2 min)
- [ ] Click on the uploaded file
- [ ] Copy the **Public URL** (or enable public access in Settings)
- [ ] Test URL in browser - should download CSV file
- [ ] ✅ **SAVE THIS URL** - you'll need it for Step 5

### 4. Configure CORS (2 min)
- [ ] In bucket, go to **Settings** tab
- [ ] Scroll to **CORS Policy**
- [ ] Click **Edit** or **Add CORS Policy**
- [ ] Paste this:
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
- [ ] Click **Save**

### 5. Add to Vercel (3 min)
- [ ] Go to https://vercel.com/dashboard
- [ ] Select your project
- [ ] **Settings** → **Environment Variables**
- [ ] Click **Add New**
- [ ] Name: `NEXT_PUBLIC_CSV_URL`
- [ ] Value: `[PASTE YOUR R2 URL FROM STEP 3]`
- [ ] Select: ✅ Production, ✅ Preview, ✅ Development
- [ ] Click **Save**

### 6. Redeploy (2 min)
- [ ] Go to **Deployments** tab
- [ ] Click **⋯** on latest deployment
- [ ] Click **Redeploy**
- [ ] Wait for deployment to complete

### 7. Verify (2 min)
- [ ] Visit your Vercel site
- [ ] Open DevTools (F12) → Console
- [ ] Should see: `"Processing row X..."`
- [ ] App should load data successfully
- [ ] ✅ **DONE!**

---

## 🎯 Your R2 URL Format

Your URL should look like:
```
https://pub-xxxxx.r2.dev/safetoswim_geomeans_2020-present.csv
```

Or if using custom domain:
```
https://your-bucket.your-domain.com/safetoswim_geomeans_2020-present.csv
```

---

## ⚠️ Common Issues

**Can't find R2 in sidebar?**
- Try: Click "Workers & Pages" → then "R2"
- Or use direct URL: https://dash.cloudflare.com/?to=/:account/r2

**File upload fails?**
- Check internet connection
- Try uploading in smaller chunks (not possible with single file)
- Check Cloudflare dashboard for errors

**CORS errors?**
- Make sure Step 4 (CORS) is completed
- Verify CORS policy saved correctly

**App still using local file?**
- Make sure you redeployed (Step 6)
- Check environment variable is set correctly
- Clear browser cache

---

## 📞 Need Help?

See detailed guide: `CLOUDFLARE_R2_COMPLETE_SETUP.md`

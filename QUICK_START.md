# Quick Start Guide

## ✅ All Systems Ready!

The predictive water quality dashboard is fully integrated and ready to use. The null reference error has been fixed.

## Start Both Services

### 1. Start Python API (Terminal 1)

```bash
cd prediction-api
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### 2. Start Next.js Dashboard (Terminal 2)

```bash
# In the project root directory
npm install  # If not already done
npm run dev
```

You should see:
```
- ready started server on 0.0.0.0:3000
```

### 3. Open Dashboard

Navigate to: **http://localhost:3000**

## Using the Dashboard

1. **Wait for data to load** - The CSV parsing may take 2-5 minutes initially
2. **Select a station** - Click on a marker on the map or select from the station list
3. **Toggle predictions** - Use the "Show Predictions" toggle switch
4. **View results**:
   - **Prediction Card**: Shows predicted water quality with risk level
   - **Environmental Data**: Current weather/tide conditions
   - **Forecast Chart**: Historical data with predicted values overlaid

## Features Working

✅ Interactive map with station markers  
✅ Station selection and filtering  
✅ Historical data visualization  
✅ **NEW**: Real-time predictions  
✅ **NEW**: Environmental data display  
✅ **NEW**: Historical vs predicted comparisons  
✅ **NEW**: Risk level indicators  

## Troubleshooting

### "Cannot read properties of null" Error
**Fixed!** ✅ The PredictionCard component now properly handles null predictions.

### Predictions not showing?
- Ensure Python API is running on port 8000
- Check browser console for errors
- Verify the toggle switch is ON

### Python API errors?
- Make sure all dependencies are installed: `pip install -r requirements.txt`
- Check if port 8000 is already in use
- Verify Python 3.8+ is installed

### Slow loading?
- Large CSV file (~341MB) takes time to parse initially
- Subsequent loads are cached and faster
- Consider using the preprocessing script to create smaller JSON

## Next Steps

### For Production:

1. **Train Real Models**:
   ```bash
   # Use scripts from wq-models-high-frequency-data repo
   # Place trained .pkl files in prediction-api/models/
   ```

2. **Set Environment Variables**:
   ```bash
   # Create .env.local
   PYTHON_API_URL=http://localhost:8000  # For development
   # Or your production API URL for deployment
   ```

3. **Deploy**:
   - **Next.js**: Deploy to Vercel (automatically detected)
   - **Python API**: Deploy to Railway/Render/Fly.io
   - Update `PYTHON_API_URL` in production environment

## API Documentation

When Python API is running, visit:
- **API Docs**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/

## Need Help?

- Check `INTEGRATION_COMPLETE.md` for detailed documentation
- Check `PREDICTION_MODEL_INTEGRATION_PLAN.md` for architecture details
- Review `DEPLOYMENT.md` for deployment instructions

---

**Status**: ✅ All components built and integrated  
**Error Fixed**: ✅ Null reference error in PredictionCard resolved  
**Ready for**: Development and testing 🚀

"""Test script for water quality prediction"""
import asyncio
from app.models.predictor import predict_water_quality

async def test_predictions():
    """Test various prediction scenarios"""
    
    print("=" * 60)
    print("WATER QUALITY PREDICTION TESTS")
    print("=" * 60)
    
    # Test 1: Clean conditions
    print("\n1. CLEAN CONDITIONS (no rain, normal waves)")
    predictors1 = {
        "rainfall_24h": 0.0,
        "precipitation_48h": 0.0,
        "wave_height": 1.5,
        "wave_period": 8.0,
        "tide_level": 0.5,
        "temperature": 18.0,
        "wind_speed": 8.0,
    }
    result1 = predict_water_quality("TEST001", predictors1, use_mock=True)
    if result1["success"]:
        pred = result1["prediction"]
        print(f"   CFU: {pred['fecal_coliform_cfu']}")
        print(f"   Risk: {pred['risk_level']}")
        print(f"   Confidence: [{pred['confidence_interval'][0]:.1f}, {pred['confidence_interval'][1]:.1f}]")
    
    # Test 2: Heavy rainfall
    print("\n2. HEAVY RAINFALL (5mm in 24h)")
    predictors2 = {
        "rainfall_24h": 5.0,
        "precipitation_48h": 5.0,
        "wave_height": 1.5,
        "wave_period": 8.0,
        "tide_level": 0.5,
        "temperature": 18.0,
        "wind_speed": 8.0,
    }
    result2 = predict_water_quality("TEST001", predictors2, use_mock=True)
    if result2["success"]:
        pred = result2["prediction"]
        print(f"   CFU: {pred['fecal_coliform_cfu']}")
        print(f"   Risk: {pred['risk_level']}")
        print(f"   Confidence: [{pred['confidence_interval'][0]:.1f}, {pred['confidence_interval'][1]:.1f}]")
    
    # Test 3: Low tide + calm conditions
    print("\n3. LOW TIDE + CALM CONDITIONS")
    predictors3 = {
        "rainfall_24h": 0.0,
        "precipitation_48h": 0.0,
        "wave_height": 0.3,
        "wave_period": 6.0,
        "tide_level": -0.8,
        "temperature": 18.0,
        "wind_speed": 2.0,
    }
    result3 = predict_water_quality("TEST001", predictors3, use_mock=True)
    if result3["success"]:
        pred = result3["prediction"]
        print(f"   CFU: {pred['fecal_coliform_cfu']}")
        print(f"   Risk: {pred['risk_level']}")
        print(f"   Confidence: [{pred['confidence_interval'][0]:.1f}, {pred['confidence_interval'][1]:.1f}]")
    
    # Test 4: High waves + strong wind
    print("\n4. HIGH WAVES + STRONG WIND (good mixing)")
    predictors4 = {
        "rainfall_24h": 0.0,
        "precipitation_48h": 0.0,
        "wave_height": 3.0,
        "wave_period": 12.0,
        "tide_level": 1.2,
        "temperature": 18.0,
        "wind_speed": 15.0,
    }
    result4 = predict_water_quality("TEST001", predictors4, use_mock=True)
    if result4["success"]:
        pred = result4["prediction"]
        print(f"   CFU: {pred['fecal_coliform_cfu']}")
        print(f"   Risk: {pred['risk_level']}")
        print(f"   Confidence: [{pred['confidence_interval'][0]:.1f}, {pred['confidence_interval'][1]:.1f}]")
    
    # Test 5: Warm water
    print("\n5. WARM WATER (25°C)")
    predictors5 = {
        "rainfall_24h": 0.0,
        "precipitation_48h": 0.0,
        "wave_height": 1.5,
        "wave_period": 8.0,
        "tide_level": 0.0,
        "temperature": 25.0,
        "wind_speed": 8.0,
    }
    result5 = predict_water_quality("TEST001", predictors5, use_mock=True)
    if result5["success"]:
        pred = result5["prediction"]
        print(f"   CFU: {pred['fecal_coliform_cfu']}")
        print(f"   Risk: {pred['risk_level']}")
        print(f"   Confidence: [{pred['confidence_interval'][0]:.1f}, {pred['confidence_interval'][1]:.1f}]")
    
    print("\n" + "=" * 60)
    print("Model Type:", result1.get("model_info", {}).get("model_type", "unknown"))
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(test_predictions())

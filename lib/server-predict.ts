/**
 * Server-only: call Python prediction API (shared by /api/predict and cron).
 */
import type { PredictionResult } from '@/lib/types';

export async function callPythonPredict(body: {
  station_code: string;
  latitude: number;
  longitude: number;
  use_env_data?: boolean;
  use_mock_model?: boolean;
  antecedent_fib?: number;
  predictors?: Record<string, unknown>;
}): Promise<PredictionResult | null> {
  const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:8000';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(`${PYTHON_API_URL}/api/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        station_code: body.station_code,
        latitude: body.latitude,
        longitude: body.longitude,
        use_env_data: body.use_env_data ?? true,
        use_mock_model: body.use_mock_model ?? true,
        antecedent_fib: body.antecedent_fib,
        predictors: body.predictors,
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return (await response.json()) as PredictionResult;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

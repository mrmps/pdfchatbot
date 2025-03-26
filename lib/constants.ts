export const APP_BASE_URL = process.env.NODE_ENV === 'development' 
  ? 'http://localhost:3000' 
  : 'https://chatpdfkdbai.vercel.app';

// Base URL for API endpoints
export const API_BASE_URL = `${APP_BASE_URL}`;

// Base URL for FastAPI endpoints
export const FASTAPI_BASE_URL = process.env.NODE_ENV === 'development'
  ? 'http://127.0.0.1:8000'
  : `${APP_BASE_URL}`;

/**
 * Creates a full API URL for a given endpoint
 * @param endpoint The API endpoint path (e.g., "api/py/upload_pdf")
 * @returns The complete API URL
 */
export function getApiUrl(endpoint: string): string {
  // Remove any leading slash from the endpoint
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
  
  // Use FastAPI direct URL for Python endpoints in development
  if (process.env.NODE_ENV === 'development' && cleanEndpoint.startsWith('api/py/')) {
    return `${FASTAPI_BASE_URL}/${cleanEndpoint}`;
  }
  
  return `${API_BASE_URL}/${cleanEndpoint}`;
} 
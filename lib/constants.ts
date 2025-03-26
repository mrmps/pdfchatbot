export const APP_BASE_URL = process.env.NODE_ENV === 'development' 
  ? 'http://localhost:3000' 
  : 'https://chatpdfkdbai.vercel.app';

// Base URL for API endpoints
export const API_BASE_URL = `${APP_BASE_URL}`;

/**
 * Creates a full API URL for a given endpoint
 * @param endpoint The API endpoint path (e.g., "api/py/upload_pdf")
 * @returns The complete API URL
 */
export function getApiUrl(endpoint: string): string {
  // Remove any leading slash from the endpoint
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
  return `${API_BASE_URL}/${cleanEndpoint}`;
} 
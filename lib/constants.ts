// Define constants independently in TypeScript
// Make sure to keep these values in sync with constants.js
export const APP_BASE_URL: string = process.env.NODE_ENV === 'development' 
  ? 'http://localhost:3000' 
  : 'https://chatpdfkdbai.vercel.app';

// Base URL for FastAPI endpoints (now the external Replit backend)
export const FASTAPI_BASE_URL: string = 'https://pdfchat.replit.app';

// Base URL for API endpoints
export const API_BASE_URL = `${APP_BASE_URL}`;

/**
 * Creates a full API URL for a given endpoint
 * @param endpoint The API endpoint path (e.g., "upload_pdf") 
 * @returns The complete API URL pointing to the external API or local API as appropriate
 */
export function getApiUrl(endpoint: string): string {
  // Remove any leading slash from the endpoint
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
  
  // Use the FastAPI process-pdfs endpoint instead of the local parse-pdf endpoint
  if (cleanEndpoint === 'parse-pdf') {
    return `${FASTAPI_BASE_URL}/process-pdfs`;
  }
  
  // Use FASTAPI_BASE_URL for all other endpoints
  return `${FASTAPI_BASE_URL}/${cleanEndpoint}`;
} 
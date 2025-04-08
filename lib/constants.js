// This is a CommonJS version of constants that can be imported by next.config.js
const APP_BASE_URL = process.env.NODE_ENV === 'development' 
  ? 'http://localhost:3000' 
  : 'https://chatpdfkdbai.vercel.app';

// Base URL for FastAPI endpoints (now the external Replit backend)
const FASTAPI_BASE_URL = 'https://pdfchat.replit.app';

// Helper function to create API URLs
function getApiUrl(endpoint) {
  // Remove any leading slash from the endpoint
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
  
  // Use the FastAPI process-pdfs endpoint instead of the local parse-pdf endpoint
  if (cleanEndpoint === 'parse-pdf') {
    return `${FASTAPI_BASE_URL}/process-pdfs`;
  }
  
  // Use FASTAPI_BASE_URL for all other endpoints
  return `${FASTAPI_BASE_URL}/${cleanEndpoint}`;
}

module.exports = {
  APP_BASE_URL,
  FASTAPI_BASE_URL,
  getApiUrl
}; 
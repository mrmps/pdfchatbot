// Import constant values from the CommonJS file for consistency
// We need to use require here since we're importing from a CommonJS module
// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsConstants = require('./constants.js');

// Export all constants with TypeScript typing
export const APP_BASE_URL: string = jsConstants.APP_BASE_URL;
export const FASTAPI_BASE_URL: string = jsConstants.FASTAPI_BASE_URL;

// Base URL for API endpoints
export const API_BASE_URL = `${APP_BASE_URL}`;

/**
 * Creates a full API URL for a given endpoint
 * @param endpoint The API endpoint path (e.g., "upload_pdf")
 * @returns The complete API URL pointing to the external API
 */
export function getApiUrl(endpoint: string): string {
  return jsConstants.getApiUrl(endpoint);
} 
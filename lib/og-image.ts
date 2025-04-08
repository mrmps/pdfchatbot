/**
 * Helper functions to generate Open Graph image URLs using TailGraph
 */

/**
 * Get the base URL for the application
 * @returns The base URL (without trailing slash)
 */
export function getBaseUrl(): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  return 'https://pdfgpt.dev';
}

/**
 * Generate an OG image URL for a specific PDF
 * 
 * @param pdfName The name of the PDF document
 * @param truncateAt Maximum length for title before truncating (optional)
 * @returns Full URL to the generated OG image
 */
export function getPdfOgImageUrl(pdfName: string, truncateAt = 60): string {
  const baseUrl = getBaseUrl();
  const title = truncateTitle(pdfName, truncateAt);
  
  const url = new URL(`${baseUrl}/api/og/pdf`);
  url.searchParams.set('title', title);
  
  return url.toString();
}

/**
 * Generate an OG image URL for an article or blog post
 * 
 * @param title The article title
 * @param description Short description of the article
 * @returns Full URL to the generated OG image
 */
export function getArticleOgImageUrl(title: string, description?: string): string {
  const baseUrl = getBaseUrl();
  const url = new URL(`${baseUrl}/api/og/article`);
  
  url.searchParams.set('title', truncateTitle(title));
  if (description) {
    url.searchParams.set('text', truncateTitle(description, 100));
  }
  
  return url.toString();
}

/**
 * Generate the default OG image URL
 * 
 * @returns Full URL to the default OG image
 */
export function getDefaultOgImageUrl(): string {
  return `${getBaseUrl()}/api/og`;
}

/**
 * Truncate a title to a specific length and add ellipsis if needed
 * 
 * @param title The title to truncate
 * @param maxLength Maximum length before truncating
 * @returns Truncated title with ellipsis if needed
 */
function truncateTitle(title: string, maxLength = 60): string {
  if (!title) return '';
  if (title.length <= maxLength) return title;
  return `${title.substring(0, maxLength)}...`;
} 
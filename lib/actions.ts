"use server"

import { revalidatePath } from "next/cache"
import { getApiUrl } from "./constants"

/**
 * Helper function to create a URL object for API calls
 * @param endpoint The API endpoint path
 * @returns A URL object
 */
function createApiUrl(endpoint: string): URL {
  const apiUrlString = getApiUrl(endpoint);
  return new URL(apiUrlString);
}

interface PdfItem {
  pdf_id: string;
  pdf_name: string;
}

// Define interfaces for response types to ensure type safety
interface UploadResult {
  success: boolean;
  chunks_inserted?: number;
  total_chunks?: number;
  documents_processed?: number;
  total_chunks_processed?: number;
  total_chunks_inserted?: number;
  error?: string;
  errorType?: string;
  results?: any[];
  processing_time?: {
    embedding_seconds: number;
    insertion_seconds: number;
  };
}

export async function uploadPdf(formData: FormData, userId: string): Promise<UploadResult> {
  try {
    // Make sure we're using consistent parameter names
    // The FastAPI endpoint looks for 'userId' or 'user_id'
    if (!formData.has('userId') && !formData.has('user_id')) {
      formData.append('userId', userId);
    }

    // Check if we have parsedData and estimate its size
    const parsedData = formData.get('parsedData');
    if (parsedData && typeof parsedData === 'string') {
      const payloadSizeInMB = parsedData.length / (1024 * 1024);
      console.log(`Estimated payload size: ${payloadSizeInMB.toFixed(2)} MB`);
      
      // Warn if payload is approaching the limit
      if (payloadSizeInMB > 20) { 
        console.warn(`Large payload detected (${payloadSizeInMB.toFixed(2)} MB). This may approach the server limit.`);
      }
      
      // For extremely large payloads, implement chunking by document
      if (payloadSizeInMB > 20) {
        console.log("Payload is too large for a single request, chunking by document");
        try {
          // Parse the payload to access documents
          const parsedJson = JSON.parse(parsedData);
          const documents = parsedJson.documents || [];
          
          if (documents.length > 1) {
            console.log(`Splitting ${documents.length} documents into separate requests`);
            
            // Process one document at a time
            const results: UploadResult[] = [];
            let successCount = 0;
            let totalChunksInserted = 0;
            
            for (let i = 0; i < documents.length; i++) {
              const singleDocPayload = {
                userId: parsedJson.userId,
                documents: [documents[i]]
              };
              
              // Create FormData for this document
              const docFormData = new FormData();
              docFormData.append('userId', userId);
              docFormData.append('parsedData', JSON.stringify(singleDocPayload));
              
              const singleDocSize = JSON.stringify(singleDocPayload).length / (1024 * 1024);
              console.log(`Sending document ${i+1}/${documents.length} with size: ${singleDocSize.toFixed(2)} MB`);
              
              try {
                // Use the same function recursively, but for a single document
                const result = await uploadPdf(docFormData, userId);
                if (result.success) {
                  successCount++;
                  totalChunksInserted += (result.chunks_inserted || 0);
                  console.log(`Document ${i+1}/${documents.length} uploaded successfully`);
                }
                results.push(result);
              } catch (error) {
                console.error(`Error uploading document ${i+1}:`, error);
                results.push({ 
                  success: false, 
                  error: error instanceof Error ? error.message : 'Unknown error' 
                });
              }
            }
            
            // Combine results
            return {
              success: successCount > 0,
              chunks_inserted: totalChunksInserted,
              total_chunks: results.reduce((total, r) => total + (r.total_chunks || 0), 0),
              documents_processed: successCount,
              results: results
            };
          }
        } catch (err) {
          console.error("Error parsing or chunking large payload:", err);
          // Continue with regular upload if chunking fails
        }
      }
    }

    const apiUrl = getApiUrl('api/py/upload_pdf');
    
    console.log("Upload URL:", apiUrl);
    
    // Increased timeout for large files (10 minutes)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 600000);
    
    console.log("Sending data to API:", {
      userId: formData.get('userId') || formData.get('user_id'),
      hasData: formData.has('parsedData')
    });
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId); // Clear the timeout if the request completes
    
    if (!response.ok) {
      let errorMessage = 'Failed to upload PDF';
      let errorDetails = '';
      let errorType = '';
      
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.detail || errorMessage;
        errorDetails = errorData.detail || '';
        errorType = errorData.type || '';
      } catch (e) {
        // If we can't parse JSON, use the status text
        errorMessage = `${response.status}: ${response.statusText}`;
      }
      
      // Return structured errors with proper types
      if (response.status === 413) {
        return { 
          success: false, 
          error: 'The PDF data is too large to process. Try splitting into smaller documents or reducing file size.',
          errorType: 'size_limit'
        };
      } else if (errorMessage.includes('size') || errorMessage.includes('limit') || errorMessage.includes('large')) {
        return { 
          success: false, 
          error: `File size limit exceeded: ${errorMessage}`,
          errorType: 'size_limit'
        };
      } else if (errorMessage.includes('timeout') || response.status === 408) {
        return { 
          success: false, 
          error: 'The server took too long to process the PDF. Try with a smaller document.',
          errorType: 'timeout'
        };
      } else if (response.status === 400 && errorDetails && (errorDetails.includes('size') || errorDetails.includes('limit'))) {
        return { 
          success: false, 
          error: `Size limit issue: ${errorDetails}`,
          errorType: 'size_limit'
        };
      } else {
        return { 
          success: false, 
          error: errorMessage,
          errorType: errorType || 'unknown'
        };
      }
    }
    
    const data = await response.json();

    // Revalidate the path to update the UI
    revalidatePath("/")

    return { 
      success: true, 
      ...data,
      // Ensure processing_time is properly passed along
      processing_time: data.processing_time || data.time_seconds || null
    };
  } catch (error) {
    console.error('Error uploading PDF:', error);
    // Detect and format specific error types
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { 
        success: false, 
        error: 'Request timed out. The server took too long to respond.',
        errorType: 'timeout'
      };
    } else if (error instanceof Error) {
      // Check for specific error messages
      const errorMsg = error.message;
      if (errorMsg.includes('Body exceeded') || errorMsg.includes('size limit') || errorMsg.includes('payload')) {
        return { 
          success: false, 
          error: 'The PDF data exceeds the size limit. Try with smaller documents or fewer pages.',
          errorType: 'size_limit'
        };
      } else if (errorMsg.includes('too large') || errorMsg.includes('exceeded')) {
        return { 
          success: false, 
          error: 'The file size is too large. Please use smaller PDF files.',
          errorType: 'file_size'
        };
      }
      return { success: false, error: errorMsg };
    }
    return { success: false, error: String(error) };
  }
}

export async function listPdfNames(userId: string) {
  try {
    // Create URL using the helper function
    const url = createApiUrl('api/py/list_pdf_names');
    
    url.searchParams.append('user_id', userId);
    
    console.log("List PDFs URL:", url.toString());
    
    const response = await fetch(url.toString());
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to list PDFs: ${response.status} ${response.statusText}`, errorText);
      const errorData = { error: `${response.status} ${response.statusText}: ${errorText}` };
      throw new Error(errorData.error || 'Failed to list PDFs');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error listing PDFs:', error);
    throw error;
  }
}

export async function getChunksByPdfIds(pdfIds: string[]) {
  try {
    // If no PDF IDs are provided, return empty result
    if (!pdfIds || pdfIds.length === 0) {
      return { chunks: [] };
    }

    // Create URL using the helper function
    const url = createApiUrl('api/py/get_chunks_by_pdf_ids');
    
    // Add each PDF ID as a separate query parameter with the same name
    pdfIds.forEach(id => {
      url.searchParams.append('pdf_ids', id);
    });
    
    console.log("Fetching chunks with URL:", url.toString());
    
    const response = await fetch(url.toString());
    
    if (!response.ok) {
      // Log the full response for debugging
      const errorText = await response.text();
      console.error("Error response from API:", errorText);
      
      try {
        const errorData = JSON.parse(errorText);
        throw new Error(errorData.detail || 'Failed to get chunks');
      } catch (parseError) {
        throw new Error(`Failed to get chunks: ${response.status} ${response.statusText}`);
      }
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error getting chunks:', error);
    // Return empty chunks instead of throwing to prevent UI errors
    return { chunks: [] };
  }
}

export async function getAllUserChunks(userId: string) {
  try {
    // First get all PDF IDs for the user
    const pdfListResponse = await listPdfNames(userId);
    const pdfList = pdfListResponse.pdfs || [];
    
    if (pdfList.length === 0) {
      return { chunks: [] };
    }
    
    // Extract PDF IDs
    const pdfIds = pdfList.map((pdf: PdfItem) => pdf.pdf_id);
    
    // Get chunks for all PDFs
    return await getChunksByPdfIds(pdfIds);
  } catch (error) {
    console.error('Error getting all user chunks:', error);
    return { chunks: [] };
  }
}

// Function to search for relevant chunks
export async function searchChunks(query: string, userId: string, pdfIds?: string[]) {
  try {
    // Create URL using the helper function
    const url = createApiUrl('api/py/search');
    
    url.searchParams.append('user_id', userId);
    url.searchParams.append('query', query);
    
    if (pdfIds && pdfIds.length > 0) {
      pdfIds.forEach(id => url.searchParams.append('pdf_id', id));
    }
    
    console.log("Search URL:", url.toString());
    
    const response = await fetch(url.toString());
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Search failed: ${response.status} ${response.statusText}`, errorText);
      const errorData = { error: `${response.status} ${response.statusText}: ${errorText}` };
      throw new Error(errorData.error || 'Failed to search chunks');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error searching chunks:', error);
    throw error;
  }
}


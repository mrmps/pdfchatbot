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

export async function uploadPdf(formData: FormData, userId: string) {
  try {
    formData.append('user_id', userId);

    const apiUrl = getApiUrl('api/py/upload_pdf');
    
    console.log("Upload URL:", apiUrl);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to upload PDF');
    }
    
    const data = await response.json();

    // Revalidate the path to update the UI
    revalidatePath("/")

    return { success: true, ...data };
  } catch (error) {
    console.error('Error uploading PDF:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
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


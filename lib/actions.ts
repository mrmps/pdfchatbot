"use server"

import { revalidatePath } from "next/cache"
import { getUserId } from './user-id'

// Define interfaces for our data structures
interface Chunk {
  id: number;
  pdf_id: string;
  pdf_name: string;
  chunk_text: string;
}

interface PdfItem {
  pdf_id: string;
  pdf_name: string;
}

export async function uploadPdf(formData: FormData) {
  try {
    const userId = await getUserId();
    formData.append('user_id', userId);
    
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'}/upload_pdf`, {
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

export async function listPdfNames() {
  try {
    const userId = await getUserId();
    
    const url = new URL(`${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'}/list_pdf_names`);
    url.searchParams.append('user_id', userId);
    
    const response = await fetch(url.toString());
    
    if (!response.ok) {
      const errorData = await response.json();
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
    
    // Build the URL with only the PDF IDs as parameters
    const url = new URL(`${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'}/get_chunks_by_pdf_ids`);
    
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

export async function getAllUserChunks() {
  try {
    // First get all PDF IDs for the user
    const pdfListResponse = await listPdfNames();
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
export async function searchChunks(query: string, pdfIds?: string[]) {
  try {
    const userId = await getUserId();
    
    const url = new URL(`${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'}/search`);
    url.searchParams.append('user_id', userId);
    url.searchParams.append('query', query);
    
    if (pdfIds && pdfIds.length > 0) {
      pdfIds.forEach(id => url.searchParams.append('pdf_id', id));
    }
    
    const response = await fetch(url.toString());
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to search chunks');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error searching chunks:', error);
    throw error;
  }
}


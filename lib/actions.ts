"use server"

import { revalidatePath } from "next/cache"
import { getUserId } from './user-id'

// Define an interface for the chunk structure
interface Chunk {
  id: number;
  pdf_name: string;
  chunk_text: string;
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

export async function getPdfContent() {
  try {
    // Get the user ID from fingerprinting
    const userId = await getUserId();
    
    // Get all chunks for the user
    const url = new URL(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/list_all_chunks`);
    url.searchParams.append("user_id", userId);
    url.searchParams.append("limit", "100");
    
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to retrieve chunks: ${response.statusText}`);
    }

    const data = await response.json();
    
    // If no chunks are available, return empty string
    if (!data.chunks || data.chunks.length === 0) {
      return "";
    }

    // Combine all chunks into a single string
    return data.chunks.map((chunk: Chunk) => chunk.chunk_text).join("\n\n");
  } catch (error) {
    console.error("Error retrieving PDF content:", error);
    return "";
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

export async function listPdfs() {
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


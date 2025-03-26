import { NextResponse } from "next/server"
import { getUserId } from "@/lib/user-id"

// Define an interface for the search result
interface SearchResult {
  pdf_id: string;
  pdf_name: string;
  chunk_text: string;
  distance?: number;
  chunk_index?: number;
  page_number?: number;
  // Add any other properties that might be in the result
}

export async function GET(req: Request) {
  try {
    // Get query parameters from the URL
    const url = new URL(req.url)
    const query = url.searchParams.get('query')
    const pdf_id = url.searchParams.get('pdf_id')
    const limit = parseInt(url.searchParams.get('limit') || '5')
    
    // Get the user ID from fingerprinting
    const user_id = await getUserId()
    
    if (!query) {
      return NextResponse.json(
        { error: "Missing required parameter: query" },
        { status: 400 }
      )
    }
    
    // Build the search URL with query parameters
    const searchUrl = new URL(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/search`)
    searchUrl.searchParams.append("user_id", user_id)
    searchUrl.searchParams.append("query", query)
    
    if (pdf_id) {
      searchUrl.searchParams.append("pdf_id", pdf_id)
    }
    
    if (limit) {
      searchUrl.searchParams.append("limit", limit.toString())
    }
    
    // Make the request to the FastAPI backend
    const response = await fetch(searchUrl.toString())
    
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || "Backend search request failed")
    }
    
    const data = await response.json()
    
    // Transform the results to match the expected format
    // Include additional metadata if available
    const chunks = data.results.map((result: SearchResult) => ({
      pdf_id: result.pdf_id,
      pdf_name: result.pdf_name,
      chunk_text: result.chunk_text,
      chunk_index: result.chunk_index || 0,
      page_number: result.page_number || 0,
      distance: result.distance
    }))

    return NextResponse.json({ chunks })
  } catch (error) {
    console.error("Error in search_chunks route:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
} 
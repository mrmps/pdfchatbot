import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { getApiUrl } from '@/lib/constants';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    console.log("Chat API route called");
    const body = await req.json();
    const { messages, pdfIds, userId } = body;
    
    // Require userId from the frontend
    if (!userId) {
      throw new Error("No user ID provided. User authentication is required.");
    }
    
    const userIdToUse = userId;
    console.log("Using user ID from frontend:", userIdToUse);
    
    console.log("Received messages:", JSON.stringify(messages).substring(0, 100) + "...");

    // Get the full API URL for listing PDFs
    const apiUrl = getApiUrl('api/py/list_pdf_names');
    
    // Create URL with the full API URL
    const url = new URL(apiUrl);
    
    url.searchParams.append('user_id', userIdToUse);
    
    console.log("Fetching PDFs from:", url.toString());

    // Fetch available PDFs using list_pdf_names endpoint
    const pdfResponse = await fetch(url.toString());
    if (!pdfResponse.ok) {
      const errorText = await pdfResponse.text();
      console.error(`Failed to fetch PDF list: ${pdfResponse.status} ${pdfResponse.statusText}`, errorText);
      throw new Error(`Failed to fetch PDF list: ${pdfResponse.statusText}`);
    }
    const pdfData = await pdfResponse.json();
    const availablePdfs = pdfData.pdfs || [];

    // Create a mapping of PDF names to IDs for the AI to reference
    const pdfMapping = availablePdfs.reduce((acc: Record<string, string>, pdf: any) => {
      if (pdf && typeof pdf === 'object' && pdf.pdf_name && pdf.pdf_id) {
        acc[pdf.pdf_name] = pdf.pdf_id;
      }
      return acc;
    }, {});

    // Create a reverse mapping of PDF IDs to names
    const pdfIdToName = availablePdfs.reduce((acc: Record<string, string>, pdf: any) => {
      if (pdf && typeof pdf === 'object' && pdf.pdf_name && pdf.pdf_id) {
        acc[pdf.pdf_id] = pdf.pdf_name;
      }
      return acc;
    }, {});

    // Format PDF names for display
    const formattedPdfNames = availablePdfs.map((pdf: any) => 
      typeof pdf === 'object' && pdf.pdf_name ? pdf.pdf_name : String(pdf)
    ).filter(Boolean);

    console.log("Available PDFs:", formattedPdfNames);
    console.log("PDF ID mapping:", pdfMapping);

    const result = streamText({
      model: openai('gpt-4o'),
      messages,
      system: `You are a helpful assistant that answers questions about PDF documents.
      
      Currently available PDFs:
      ${Object.entries(pdfMapping).map(([name, id]) => `- ${name} (ID: ${id})`).join("\n")}
      
      When using the searchPdfs tool, you MUST use the PDF ID, not the name.
      For example, to search in "${formattedPdfNames[0] || 'Example PDF'}", use the ID "${Object.values(pdfMapping)[0] || 'example-id'}".
      You can also search across multiple PDFs by providing an array of PDF IDs.
      
      Choose the appropriate search mode based on the user's question:
      1. For general questions that should search across all documents, use searchMode: "unified" without specifying pdfIds
      2. For questions about specific documents, use searchMode: "unified" with the relevant pdfIds
      3. For comparative questions or when you need separate results from each document, use searchMode: "individual" with the relevant pdfIds
      
      Use the searchPdfs tool to find relevant information before answering.
      Only respond based on information from the PDFs.
      If no relevant information is found, respond, "I don't have that information in the uploaded PDFs."
      
      When you receive search results, pay careful attention to which PDF each chunk comes from.
      Each chunk will be clearly labeled with its source PDF name.

      You should almost always use the searchPdfs tool.
      
      Format your responses using Markdown for better readability.`,
      tools: {
        searchPdfs: tool({
          description: "Search through PDF documents for relevant information",
          parameters: z.object({
            query: z.string().describe("The search query to find information in PDFs"),
            pdfIds: z.union([
              z.string().describe("A single PDF ID to search within"),
              z.array(z.string()).describe("Multiple PDF IDs to search within")
            ]).optional().describe("Optional specific PDF ID(s) to search within"),
            searchMode: z.enum(["unified", "individual"]).optional()
              .describe("How to search: 'unified' (one search across all docs) or 'individual' (separate searches for each doc)")
          }),
          execute: async ({ query, pdfIds, searchMode = "unified" }) => {
            console.log(`Searching PDFs with query: "${query}"${pdfIds ? ` in PDF IDs: ${JSON.stringify(pdfIds)}` : ''}, mode: ${searchMode}`);
            
            try {
              // Get the full API URL for searching
              const apiUrl = getApiUrl('api/py/search');
              
              // Create URL with the full API URL
              const url = new URL(apiUrl);
              
              url.searchParams.append("user_id", userIdToUse);
              url.searchParams.append("query", query);
              url.searchParams.append("search_mode", searchMode);
              
              // Handle both single PDF ID and array of PDF IDs
              if (pdfIds) {
                if (Array.isArray(pdfIds)) {
                  // Add each PDF ID as a separate parameter
                  pdfIds.forEach(id => {
                    url.searchParams.append("pdf_id", id);
                  });
                } else {
                  // Single PDF ID
                  url.searchParams.append("pdf_id", pdfIds);
                }
              }
              
              url.searchParams.append("limit", "20");
              
              console.log("Search URL:", url.toString());
              
              // Call the FastAPI search endpoint with GET
              const searchResponse = await fetch(url.toString(), {
                method: "GET",
                headers: {
                  "Accept": "application/json",
                },
                // Add timeout to prevent indefinite hanging
                signal: AbortSignal.timeout(15000) // 15 seconds timeout
              });
              
              if (!searchResponse.ok) {
                const errorText = await searchResponse.text();
                console.error(`Search failed: ${searchResponse.status} ${searchResponse.statusText}`, errorText);
                return `Error searching PDFs: ${searchResponse.statusText}. Please try again with a different query.`;
              }
              
              // Validate that the response is valid JSON
              let searchData;
              let responseText = "";
              try {
                // First get the raw text for debugging
                responseText = await searchResponse.clone().text();
                console.log("Raw search response:", responseText.substring(0, 200) + (responseText.length > 200 ? "..." : ""));
                
                // Then try to parse as JSON
                searchData = await searchResponse.json();
                console.log("Parsed search data:", JSON.stringify(searchData).substring(0, 200) + "...");
              } catch (err) {
                console.error("Failed to parse search response as JSON:", err);
                console.error("Response text was:", responseText);
                return "Error: The search response was not valid JSON. Please try again.";
              }
              
              // Ensure searchData is an object and results exists and is an array
              if (!searchData || typeof searchData !== 'object') {
                console.error("Search response is not a valid object:", searchData);
                return "Error: Received an invalid search response. Please try again.";
              }
              
              const results = Array.isArray(searchData.results) ? searchData.results : [];
              console.log(`Found ${results.length} search results`);
              
              // Debug logging for search results array
              if (results.length > 0) {
                console.log("First search result sample:", JSON.stringify(results[0]).substring(0, 200) + "...");
              } else {
                console.log("Search returned empty results array");
              }
              
              if (results.length === 0) {
                return "No relevant information found in the PDFs. Try rephrasing your question or searching for different terms.";
              }
              
              // Get PDF names for display in the UI
              let pdfNames;
              if (pdfIds) {
                if (Array.isArray(pdfIds)) {
                  pdfNames = pdfIds.map(id => pdfIdToName[id] || id);
                } else {
                  pdfNames = pdfIdToName[pdfIds] || pdfIds;
                }
              }

              // Group results by PDF for better organization
              const resultsByPdf: Record<string, any[]> = {};
              
              // Process results safely
              results.forEach((result: any, index: number) => {
                // Skip invalid results
                if (!result || typeof result !== 'object') {
                  console.log(`Skipping invalid result at index ${index}:`, result);
                  return;
                }
                
                // Debug logging for first few results
                if (index < 3) {
                  console.log(`Result ${index} data:`, JSON.stringify(result).substring(0, 100) + "...");
                }
                
                // Extract PDF name with fallback
                const pdfName = result.pdf_name || "Unknown Document";
                
                if (!resultsByPdf[pdfName]) {
                  resultsByPdf[pdfName] = [];
                }
                
                // Ensure all values are properly extracted with fallbacks
                const safeResult = {
                  ...result,
                  pdf_id: result.pdf_id || "",
                  pdf_name: pdfName,
                  chunk_text: typeof result.chunk_text === 'string' ? result.chunk_text : 
                             (result.chunk_text ? String(result.chunk_text) : "No text available"),
                  distance: result.distance || 0
                };
                
                resultsByPdf[pdfName].push(safeResult);
              });
              
              // Format the results with markdown for better readability
              // Each chunk is clearly separated and labeled with its source
              let formattedResults = "";
              
              if (Object.keys(resultsByPdf).length === 0) {
                console.error("No valid PDF sections found in the search results");
                return "No useful information found in the PDFs. Please try a different question.";
              }
              
              console.log(`Formatting results for ${Object.keys(resultsByPdf).length} PDFs`);
              
              // Sort each PDF's chunks by distance (ascending) for better relevance
              Object.entries(resultsByPdf).forEach(([pdfName, chunks]) => {
                // Sort chunks by distance (most relevant first)
                const sortedChunks = [...chunks].sort((a, b) => a.distance - b.distance);
                
                formattedResults += `## From: ${pdfName}\n\n`;
                
                sortedChunks.forEach((chunk, index) => {
                  const chunkText = chunk.chunk_text || "No text available for this chunk";
                  formattedResults += `### Chunk ${index + 1}\n\n${chunkText}\n\n---\n\n`;
                });
              });
              
              console.log("Successfully created formatted results");
              return formattedResults.trim();
            } catch (error) {
              console.error("Error in searchPdfs tool:", error);
              return `Error searching PDFs: ${error instanceof Error ? error.message : String(error)}. Please try again.`;
            }
          }
        })
      },
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error("Error in chat route:", error);
    
    // Return a more detailed error response
    return new Response(
      JSON.stringify({
        error: "Failed to process your request",
        details: error instanceof Error ? error.message : String(error),
        role: "assistant",
        content: "I'm sorry, I encountered an error while processing your request. Please try again.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
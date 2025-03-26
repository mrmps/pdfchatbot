import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';

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

    // If NEXT_PUBLIC_API_URL is not set, use a relative URL
    const apiUrl = process.env.NEXT_PUBLIC_API_URL 
      ? `${process.env.NEXT_PUBLIC_API_URL}/api/py/list_pdf_names` 
      : '/api/py/list_pdf_names';


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
              // If NEXT_PUBLIC_API_URL is not set, use a relative URL
              const apiUrl = process.env.NEXT_PUBLIC_API_URL 
                ? `${process.env.NEXT_PUBLIC_API_URL}/api/py/search` 
                : '/api/py/search';
              
              // Create URL - for server components, we need a proper absolute URL
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
              
              url.searchParams.append("limit", "5");
              
              console.log("Search URL:", url.toString());
              
              // Call the FastAPI search endpoint with GET
              const searchResponse = await fetch(url.toString(), {
                method: "GET",
                headers: {
                  "Accept": "application/json",
                }
              });
              
              if (!searchResponse.ok) {
                const errorText = await searchResponse.text();
                console.error(`Search failed: ${searchResponse.status} ${searchResponse.statusText}`, errorText);
                return `Error searching PDFs: ${searchResponse.statusText}. Please try again with a different query.`;
              }
              
              const searchData = await searchResponse.json();
              const results = searchData.results || [];
              
              if (results.length === 0) {
                return "No relevant information found in the PDFs.";
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
              
              results.forEach((result: any) => {
                const pdfName = result.pdf_name;
                if (!resultsByPdf[pdfName]) {
                  resultsByPdf[pdfName] = [];
                }
                resultsByPdf[pdfName].push(result);
              });
              
              // Format the results with markdown for better readability
              // Each chunk is clearly separated and labeled with its source
              let formattedResults = "";
              
              Object.entries(resultsByPdf).forEach(([pdfName, chunks]) => {
                formattedResults += `## From: ${pdfName}\n\n`;
                
                chunks.forEach((chunk, index) => {
                  const pageInfo = chunk.page_number ? ` (Page ${chunk.page_number})` : '';
                  formattedResults += `### Chunk ${index + 1}${pageInfo}\n\n${chunk.chunk_text}\n\n---\n\n`;
                });
              });
              
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
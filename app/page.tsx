"use client"

import { useState, useEffect } from "react"
import { FileUpload } from "@/components/file-upload"
import { Chat } from "@/components/chat-interface"
import { Button } from "@/components/ui/button"
import { Upload, FileText, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { getUserId } from "@/lib/user-id"
import { listPdfs } from "@/lib/actions"

// Define a type for PDF items
interface PdfItem {
  pdf_id: string;
  pdf_name: string;
}

export default function Home() {
  const [viewingContent, setViewingContent] = useState(false)
  const [uploadingPdf, setUploadingPdf] = useState(false)
  const [pdfContent, setPdfContent] = useState("")
  const [pdfList, setPdfList] = useState<PdfItem[]>([])
  const [selectedPdf, setSelectedPdf] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [chunksByPdfId, setChunksByPdfId] = useState<Record<string, any[]>>({})

  // Add useEffect to get the user ID when component mounts
  useEffect(() => {
    async function fetchUserId() {
      try {
        const id = await getUserId();
        setUserId(id);
      } catch (error) {
        console.error('Error fetching user ID:', error);
      }
    }
    
    fetchUserId();
  }, []);

  const handleViewContent = async () => {
    // Show modal immediately
    setViewingContent(true)
    setIsLoading(true)
    setPdfContent("Loading PDF content...")
    
    try {
      console.log("Fetching PDF data from API...")
      // Get the user ID from fingerprinting
      const currentUserId = userId || 'user'; // Fallback to 'user' if userId is not available yet
      
      // Create the URL with proper parameters to get all chunks at once
      const apiUrl = `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/list_all_chunks`;
      const url = new URL(apiUrl);
      url.searchParams.append("user_id", currentUserId);
      // Don't specify a pdf_id to get all chunks for all PDFs
      
      console.log("Fetching all chunks from URL:", url.toString());
      
      const response = await fetch(url.toString());
      
      if (!response.ok) {
        throw new Error(`Failed to retrieve PDF chunks: ${response.statusText}`)
      }
      
      const data = await response.json();
      console.log("Raw API response:", data);
      
      // Get the list of PDFs using listPdfs
      const pdfListData = await listPdfs();
      setPdfList(pdfListData.pdfs || []);
      
      // Process chunks and organize by PDF ID
      let chunks = [];
      if (data.chunks && Array.isArray(data.chunks)) {
        chunks = data.chunks;
      } else if (data.results && Array.isArray(data.results)) {
        chunks = data.results;
      } else if (Array.isArray(data)) {
        chunks = data;
      }
      
      console.log(`Processed ${chunks.length} total chunks`);
      
      // Group chunks by PDF ID
      const chunksByPdfId = chunks.reduce((acc: Record<string, any[]>, chunk: {pdf_id?: string; [key: string]: any}) => {
        const pdfId = chunk.pdf_id || '';
        if (!acc[pdfId]) {
          acc[pdfId] = [];
        }
        acc[pdfId].push(chunk);
        return acc;
      }, {} as Record<string, any[]>);
      
      // Store the chunks by PDF ID for later use
      setChunksByPdfId(chunksByPdfId);
      
      if (chunks.length > 0) {
        setPdfContent("Select a PDF from the list to view its content");
      } else {
        setPdfContent("No PDF content available. Upload some PDFs first.");
      }
    } catch (error) {
      console.error("Error retrieving PDF data:", error);
      setPdfContent(`Error loading PDF content: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
      console.log("Loading complete, isLoading set to false");
    }
  }

  const handleSelectPdf = async (pdfId: string, pdfName: string) => {
    setSelectedPdf(pdfId);
    setIsLoading(true);
    
    try {
      console.log(`Loading content for PDF: ${pdfName} (ID: ${pdfId})`);
      
      // Get the chunks for this PDF from our cached data
      const pdfChunks = chunksByPdfId[pdfId] || [];
      console.log(`Found ${pdfChunks.length} chunks for ${pdfName}`);
      
      if (pdfChunks.length > 0) {
        // Format the content with chunk numbers for better readability
        const formattedContent = pdfChunks
          .map((chunk: any, index: number) => {
            // Handle different possible chunk formats
            const chunkText = typeof chunk === 'string' 
              ? chunk 
              : (chunk.chunk_text || chunk.text || chunk.content || JSON.stringify(chunk));
            
            const pageInfo = chunk.page_number ? `Page ${chunk.page_number}` : '';
            const chunkInfo = `Chunk ${index + 1}${pageInfo ? ' - ' + pageInfo : ''}`;
            return `--- ${chunkInfo} ---\n\n${chunkText}\n`;
          })
          .join("\n");
        
        setPdfContent(formattedContent);
      } else {
        // If no chunks are found, provide a more detailed message
        setPdfContent(`No content chunks available for "${pdfName}". The PDF might be empty or processing might not be complete.`);
      }
    } catch (error) {
      console.error(`Error displaying content for ${pdfName}:`, error);
      setPdfContent(`Error displaying content for ${pdfName}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header with buttons */}
      <header className="border-b p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/kdbai.png" alt="KDB AI Logo" width={100} height={100} />
          <Badge variant="secondary" className="px-3 py-1 text-sm font-medium">
            PDF Chat
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex items-center gap-2" onClick={() => setUploadingPdf(true)}>
            <Upload className="h-4 w-4" />
            Upload PDFs
          </Button>

          <Button variant="outline" className="flex items-center gap-2" onClick={handleViewContent}>
            <FileText className="h-4 w-4" />
            View PDF Content
          </Button>
        </div>
      </header>

      {/* Full-screen chat */}
      <div className="flex-1 overflow-hidden">
        <Chat />
      </div>

      {/* Dialog for uploading PDFs */}
      <Dialog open={uploadingPdf} onOpenChange={setUploadingPdf}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Upload PDFs</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              Select PDF files to upload. After selecting files, click &ldquo;Process Selected PDFs&rdquo; to extract their content.
            </p>
            <FileUpload onUploadComplete={() => setUploadingPdf(false)} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog for viewing PDF content */}
      <Dialog open={viewingContent} onOpenChange={setViewingContent}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>PDF Content</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-hidden flex gap-4">
            {isLoading ? (
              <div className="w-full flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-2">Loading PDF content...</span>
              </div>
            ) : (
              <>
                {/* PDF list with select functionality */}
                <div className="w-1/3 border-r pr-4 overflow-y-auto">
                  <h3 className="font-medium mb-2">Uploaded PDFs</h3>
                  {pdfList.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No PDFs uploaded yet</p>
                  ) : (
                    <ul className="space-y-2">
                      {pdfList.map((pdf, index) => (
                        <li 
                          key={index} 
                          className={`p-2 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 ${selectedPdf === pdf.pdf_id ? 'bg-gray-100 dark:bg-gray-800' : ''}`}
                          onClick={() => handleSelectPdf(pdf.pdf_id, pdf.pdf_name)}
                        >
                          <span className="text-sm truncate">{pdf.pdf_name}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* PDF content */}
                <div className="w-2/3 overflow-y-auto">
                  <pre className="text-sm whitespace-pre-wrap">{pdfContent}</pre>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

"use client"

import { useState, useEffect } from "react"
import { Loader2, FileText, Search, ChevronRight, Copy, Check } from "lucide-react"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { getUserId } from "@/lib/user-id"
import { listPdfNames, getChunksByPdfIds } from "@/lib/actions"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

// Define types
interface PdfItem {
  pdf_id: string;
  pdf_name: string;
}

interface Chunk {
  id: number;
  pdf_id: string;
  pdf_name: string;
  chunk_text: string;
}

interface PdfViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PdfViewerDialog({ open, onOpenChange }: PdfViewerDialogProps) {
  const [pdfContent, setPdfContent] = useState("")
  const [pdfList, setPdfList] = useState<PdfItem[]>([])
  const [selectedPdf, setSelectedPdf] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [chunksByPdfId, setChunksByPdfId] = useState<Record<string, Chunk[]>>({})
  const [searchQuery, setSearchQuery] = useState("")
  const [filteredPdfList, setFilteredPdfList] = useState<PdfItem[]>([])
  const [formattedChunks, setFormattedChunks] = useState<{text: string, pageNumber?: number, index: number}[]>([])
  const [copiedChunk, setCopiedChunk] = useState<number | null>(null)
  const [userId, setUserId] = useState<string>("")

  // Fetch user ID on component mount
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

  // Fetch PDF list and content whenever the dialog opens
  useEffect(() => {
    if (open && userId) {
      fetchPdfData();
    }
  }, [open, userId]);

  // Filter PDFs based on search query
  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredPdfList(pdfList);
    } else {
      const filtered = pdfList.filter(pdf => 
        pdf.pdf_name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredPdfList(filtered);
    }
  }, [searchQuery, pdfList]);

  const fetchPdfData = async () => {
    if (!userId) {
      console.error("User ID not available");
      setPdfContent("Error: User ID not available. Please refresh the page.");
      return;
    }

    setIsLoading(true);
    setPdfContent("Loading PDF content...");
    
    try {
      console.log("Fetching PDF data from API...");
      
      // Get the list of PDFs with the userId
      const pdfListData = await listPdfNames(userId);
      const pdfs = pdfListData.pdfs || [];
      setPdfList(pdfs);
      setFilteredPdfList(pdfs);
      
      if (pdfs.length === 0) {
        setPdfContent("No PDFs uploaded yet. Upload some PDFs to see their content here.");
        setIsLoading(false);
        return;
      }
      
      // Clear the selected PDF when refreshing the list
      setSelectedPdf(null);
      setFormattedChunks([]);
      
      // Reset the chunks cache
      setChunksByPdfId({});
      
      // We'll no longer fetch all chunks at once to improve performance
      // Instead, we'll fetch chunks for each PDF when it's selected
      
      setPdfContent("Select a PDF from the list to view its content");
    } catch (error) {
      console.error("Error retrieving PDF data:", error);
      setPdfContent(`Error loading PDF content: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyChunk = (index: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedChunk(index);
    setTimeout(() => setCopiedChunk(null), 2000);
  };

  const handleSelectPdf = async (pdfId: string, pdfName: string) => {
    if (!userId) {
      console.error("User ID not available");
      return;
    }
    
    setSelectedPdf(pdfId);
    setIsLoading(true);
    setPdfContent(`Loading content for "${pdfName}"...`);
    setFormattedChunks([]);
    
    try {
      console.log(`Loading content for PDF: ${pdfName} (ID: ${pdfId})`);
      
      // Always fetch fresh chunks for the selected PDF
      console.log(`Fetching chunks for ${pdfName} from API...`);
      const chunksData = await getChunksByPdfIds([pdfId]);
      const pdfChunks = chunksData.chunks || [];
      
      // Update our cache
      setChunksByPdfId(prev => ({
        ...prev,
        [pdfId]: pdfChunks
      }));
      
      console.log(`Found ${pdfChunks.length} chunks for ${pdfName}`);
      
      if (pdfChunks.length > 0) {
        // Sort chunks by ID to ensure proper order
        const sortedChunks = [...pdfChunks].sort((a, b) => a.id - b.id);
        
        // Process chunks to extract page numbers and format content
        const processedChunks = sortedChunks.map((chunk: Chunk, index: number) => {
          // Extract page number if available in the chunk text
          const pageMatch = chunk.chunk_text.match(/--- Page (\d+) ---/);
          const pageNumber = pageMatch ? parseInt(pageMatch[1]) : undefined;
          
          // Clean up the text by removing the page marker
          let cleanText = chunk.chunk_text;
          if (pageMatch) {
            cleanText = cleanText.replace(/--- Page \d+ ---/, '').trim();
          }
          
          return {
            text: cleanText,
            pageNumber,
            index: index + 1
          };
        });
        
        setFormattedChunks(processedChunks);
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
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[85vh] p-0 gap-0 overflow-hidden bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
          <DialogTitle className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">PDF Library</DialogTitle>
          <DialogDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
            View and explore your uploaded PDF documents
          </DialogDescription>
        </div>

        <div className="flex flex-1 h-[calc(85vh-8rem)] overflow-hidden">
          {isLoading && !selectedPdf ? (
            <div className="w-full flex items-center justify-center">
              <div className="flex flex-col items-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                <span className="text-sm text-zinc-500 dark:text-zinc-400">Loading PDF library...</span>
              </div>
            </div>
          ) : (
            <>
              {/* PDF list with search and select functionality */}
              <div className="w-1/3 border-r border-zinc-200 dark:border-zinc-800 flex flex-col">
                <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500 dark:text-zinc-400" />
                    <Input
                      type="text"
                      placeholder="Search PDFs..."
                      className="pl-9 bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
                
                <ScrollArea className="flex-1">
                  <div className="p-2">
                    {filteredPdfList.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                        <FileText className="h-12 w-12 text-zinc-300 dark:text-zinc-600 mb-3" />
                        {pdfList.length === 0 ? (
                          <p className="text-sm text-zinc-500 dark:text-zinc-400">No PDFs uploaded yet</p>
                        ) : (
                          <p className="text-sm text-zinc-500 dark:text-zinc-400">No PDFs match your search</p>
                        )}
                      </div>
                    ) : (
                      <ul className="space-y-1">
                        {filteredPdfList.map((pdf, index) => (
                          <li 
                            key={index} 
                            className={`
                              px-3 py-2 rounded-md cursor-pointer flex items-center
                              ${selectedPdf === pdf.pdf_id 
                                ? 'bg-primary/10 text-primary border border-primary/20' 
                                : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200'}
                            `}
                            onClick={() => handleSelectPdf(pdf.pdf_id, pdf.pdf_name)}
                          >
                            <FileText className={`h-4 w-4 mr-2 flex-shrink-0 ${selectedPdf === pdf.pdf_id ? 'text-primary' : 'text-zinc-400 dark:text-zinc-500'}`} />
                            <span className="text-sm truncate flex-1">{pdf.pdf_name}</span>
                            {selectedPdf === pdf.pdf_id && (
                              <ChevronRight className="h-4 w-4 text-primary ml-1 flex-shrink-0" />
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </ScrollArea>
              </div>

              {/* PDF content */}
              <div className="w-2/3 flex flex-col">
                {selectedPdf && (
                  <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                    <div className="flex items-center">
                      <Badge variant="outline" className="font-normal text-xs">
                        {pdfList.find(p => p.pdf_id === selectedPdf)?.pdf_name}
                      </Badge>
                      <span className="mx-2 text-zinc-300 dark:text-zinc-600">•</span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {chunksByPdfId[selectedPdf]?.length || 0} chunks
                      </span>
                    </div>
                  </div>
                )}
                
                <ScrollArea className="flex-1">
                  {isLoading && selectedPdf ? (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="flex flex-col items-center">
                        <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                        <span className="text-sm text-zinc-500 dark:text-zinc-400">Loading content...</span>
                      </div>
                    </div>
                  ) : !selectedPdf ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8">
                      <FileText className="h-16 w-16 text-zinc-200 dark:text-zinc-700 mb-4" />
                      <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100 mb-2">Select a PDF</h3>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md">
                        Choose a document from the list to view its content
                      </p>
                    </div>
                  ) : formattedChunks.length === 0 ? (
                    <div className="p-6 text-center">
                      <p className="text-zinc-500 dark:text-zinc-400">{pdfContent}</p>
                    </div>
                  ) : (
                    <div className="p-4 space-y-4">
                      {formattedChunks.map((chunk, idx) => (
                        <Card key={idx} className="overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-sm">
                          <CardHeader className="p-4 bg-zinc-50 dark:bg-zinc-800/50 flex flex-row items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="h-6 px-2 font-medium">
                                Chunk {chunk.index}
                              </Badge>
                              {chunk.pageNumber && (
                                <Badge variant="outline" className="h-6 px-2 text-xs font-normal">
                                  Page {chunk.pageNumber}
                                </Badge>
                              )}
                            </div>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8"
                                    onClick={() => handleCopyChunk(idx, chunk.text)}
                                  >
                                    {copiedChunk === idx ? (
                                      <Check className="h-4 w-4 text-green-500" />
                                    ) : (
                                      <Copy className="h-4 w-4 text-zinc-500" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{copiedChunk === idx ? "Copied!" : "Copy chunk"}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </CardHeader>
                          <CardContent className="p-4 text-sm font-mono whitespace-pre-wrap text-zinc-800 dark:text-zinc-200 leading-relaxed">
                            {chunk.text}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
} 
"use client"

import { useState, useEffect } from "react"
import { Loader2, FileText, Search, ChevronRight, Copy, Check, ChevronLeft, Menu } from "lucide-react"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { getUserId } from "@/lib/user-id"
import { listPdfNames, getChunksByPdfIds } from "@/lib/actions"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

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
  const [showMobileList, setShowMobileList] = useState(true)
  const [selectedPdfName, setSelectedPdfName] = useState<string>("")

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
    // Define the fetch function inside useEffect
    async function fetchPdfData() {
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
        setSelectedPdfName("");
        setFormattedChunks([]);
        setShowMobileList(true);
        
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
    }

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
    setSelectedPdfName(pdfName);
    setIsLoading(true);
    setPdfContent(`Loading content for "${pdfName}"...`);
    setFormattedChunks([]);
    
    // On mobile, switch to content view when a PDF is selected
    if (window.innerWidth < 768) {
      setShowMobileList(false);
    }
    
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
  
  const toggleMobileView = () => {
    setShowMobileList(prev => !prev);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[85vh] sm:h-[85vh] p-0 gap-0 overflow-hidden bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
        <div className="p-3 sm:p-4 md:p-6 border-b border-zinc-200 dark:border-zinc-800">
          <DialogTitle className="text-lg sm:text-xl font-semibold text-zinc-900 dark:text-zinc-50">PDF Library</DialogTitle>
          <DialogDescription className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5 sm:mt-1">
            View and explore your uploaded PDF documents
          </DialogDescription>
        </div>

        <div className="flex flex-1 h-[calc(85vh-6rem)] sm:h-[calc(85vh-7rem)] md:h-[calc(85vh-8rem)] overflow-hidden">
          {isLoading && !selectedPdf ? (
            <div className="w-full flex items-center justify-center">
              <div className="flex flex-col items-center">
                <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-primary mb-2" />
                <span className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">Loading PDF library...</span>
              </div>
            </div>
          ) : (
            <>
              {/* PDF list with search and select functionality */}
              <div 
                className={cn(
                  "md:w-1/3 md:border-r border-zinc-200 dark:border-zinc-800 flex flex-col",
                  "w-full",
                  !showMobileList && "hidden md:flex" // Hide on mobile when viewing content
                )}
              >
                <div className="p-3 sm:p-4 border-b border-zinc-200 dark:border-zinc-800">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 sm:h-4 sm:w-4 text-zinc-500 dark:text-zinc-400" />
                    <Input
                      type="text"
                      placeholder="Search PDFs..."
                      className="pl-8 sm:pl-9 text-sm bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 h-9 sm:h-10"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
                
                <ScrollArea className="flex-1">
                  <div className="p-1.5 sm:p-2">
                    {filteredPdfList.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-6 sm:py-8 px-4 text-center">
                        <FileText className="h-8 w-8 sm:h-12 sm:w-12 text-zinc-300 dark:text-zinc-600 mb-2 sm:mb-3" />
                        {pdfList.length === 0 ? (
                          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">No PDFs uploaded yet</p>
                        ) : (
                          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">No PDFs match your search</p>
                        )}
                      </div>
                    ) : (
                      <ul className="space-y-1">
                        {filteredPdfList.map((pdf, index) => (
                          <li 
                            key={index} 
                            className={`
                              px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-md cursor-pointer flex items-center gap-1.5 sm:gap-2
                              ${selectedPdf === pdf.pdf_id 
                                ? 'bg-primary/10 text-primary border border-primary/20' 
                                : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200'}
                            `}
                            onClick={() => handleSelectPdf(pdf.pdf_id, pdf.pdf_name)}
                          >
                            <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                            <span className="text-xs sm:text-sm font-medium truncate flex-1">{pdf.pdf_name}</span>
                            <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-zinc-400 flex-shrink-0" />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </ScrollArea>
              </div>
              
              {/* PDF content view */}
              <div 
                className={cn(
                  "md:flex-1 flex flex-col w-full",
                  showMobileList && "hidden md:flex" // Hide on mobile when showing list
                )}
              >
                {selectedPdf ? (
                  <>
                    {/* Mobile navigation header */}
                    <div className="md:hidden flex items-center gap-2 p-3 border-b border-zinc-200 dark:border-zinc-800">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 px-2" 
                        onClick={toggleMobileView}
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        <span>Back</span>
                      </Button>
                      <h3 className="text-sm font-medium truncate flex-1">{selectedPdfName}</h3>
                    </div>
                  
                    {/* Chunks view */}
                    <ScrollArea className="flex-1 p-3 sm:p-4">
                      {isLoading ? (
                        <div className="w-full flex items-center justify-center py-8">
                          <div className="flex flex-col items-center">
                            <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-primary mb-2" />
                            <span className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">Loading content...</span>
                          </div>
                        </div>
                      ) : (
                        <>
                          {formattedChunks.length > 0 ? (
                            <div className="space-y-3 sm:space-y-4">
                              {formattedChunks.map((chunk, idx) => (
                                <Card key={idx} className="border border-zinc-200 dark:border-zinc-800 shadow-sm">
                                  <CardHeader className="p-2.5 sm:p-3 flex flex-row items-center justify-between space-y-0 pb-2 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                                    <div className="flex items-center gap-1.5 sm:gap-2">
                                      <Badge variant="outline" className="h-5 text-[10px] sm:text-xs px-1.5 sm:px-2 rounded-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200">
                                        Chunk {chunk.index}
                                      </Badge>
                                      {chunk.pageNumber && (
                                        <Badge variant="outline" className="h-5 text-[10px] sm:text-xs px-1.5 sm:px-2 rounded-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200">
                                          Page {chunk.pageNumber}
                                        </Badge>
                                      )}
                                    </div>
                                    
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="h-7 w-7 p-0"
                                            onClick={() => handleCopyChunk(idx, chunk.text)}
                                          >
                                            {copiedChunk === idx ? (
                                              <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-500" />
                                            ) : (
                                              <Copy className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-zinc-500" />
                                            )}
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          {copiedChunk === idx ? "Copied!" : "Copy text"}
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </CardHeader>
                                  <CardContent className="p-2.5 sm:p-3.5 text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                                    {chunk.text}
                                  </CardContent>
                                </Card>
                              ))}
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center py-8 text-center">
                              <div className="rounded-full bg-zinc-100 dark:bg-zinc-800 p-3 mb-4">
                                <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-zinc-400 dark:text-zinc-500" />
                              </div>
                              <p className="text-zinc-500 dark:text-zinc-400 text-xs sm:text-sm max-w-md">
                                {pdfContent}
                              </p>
                            </div>
                          )}
                        </>
                      )}
                    </ScrollArea>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-4">
                    {/* Show on larger screens when no PDF is selected */}
                    <div className="hidden md:flex flex-col items-center justify-center text-center max-w-md">
                      <div className="rounded-full bg-zinc-100 dark:bg-zinc-800 p-4 mb-4">
                        <FileText className="h-6 w-6 sm:h-8 sm:w-8 text-zinc-400 dark:text-zinc-500" />
                      </div>
                      <p className="text-zinc-500 dark:text-zinc-400 text-sm sm:text-base">
                        Select a PDF from the list to view its content
                      </p>
                    </div>
                    
                    {/* Show on mobile to allow switching to list view */}
                    <div className="md:hidden flex flex-col items-center justify-center text-center">
                      <div className="rounded-full bg-zinc-100 dark:bg-zinc-800 p-3 mb-3">
                        <Menu className="h-5 w-5 text-zinc-400 dark:text-zinc-500" />
                      </div>
                      <p className="text-zinc-500 dark:text-zinc-400 text-xs mb-4">
                        No PDF selected
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={toggleMobileView}
                        className="text-xs h-8"
                      >
                        View PDF List
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
} 
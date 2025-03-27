"use client"

import { useState, useEffect } from "react"
import { Loader2, FileText, Search, ChevronRight, Copy, Check, ChevronLeft, Menu } from "lucide-react"
import { getUserId } from "@/lib/user-id"
import { listPdfNames, getChunksByPdfIds } from "@/lib/actions"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
  Credenza,
  CredenzaContent,
  CredenzaHeader,
  CredenzaTitle,
  CredenzaDescription,
  CredenzaBody,
} from "@/components/ui/credenza"

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
  const [formattedChunks, setFormattedChunks] = useState<{text: string, index: number}[]>([])
  const [copiedChunk, setCopiedChunk] = useState<number | null>(null)
  const [userId, setUserId] = useState<string>("")
  const [showMobileList, setShowMobileList] = useState(true)
  const [selectedPdfName, setSelectedPdfName] = useState<string>("")
  const [lastRefreshTimestamp, setLastRefreshTimestamp] = useState<number>(0)

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
        
        // Get the list of PDFs with the userId - add timestamp to prevent caching
        const timestamp = Date.now();
        const pdfListData = await listPdfNames(userId);  // Remove timestamp parameter for now
        const pdfs = pdfListData.pdfs || [];
        setPdfList(pdfs);
        setFilteredPdfList(pdfs);
        setLastRefreshTimestamp(timestamp); // Still store timestamp for key generation
        
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
      
      // Pass timestamp to avoid caching - but remove for now to fix error
      console.log(`Fetching chunks for ${pdfName} from API...`);
      const chunksData = await getChunksByPdfIds([pdfId]);  // Remove timestamp parameter for now
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
        
        // Process chunks to format content
        const processedChunks = sortedChunks.map((chunk: Chunk, index: number) => {
          // Clean up the text by removing any page marker
          let cleanText = chunk.chunk_text;
          cleanText = cleanText.replace(/--- Page \d+ ---/, '').trim();
          
          return {
            text: cleanText,
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
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent className="p-0 gap-0 overflow-hidden border-border rounded-lg bg-background max-w-full sm:max-w-6xl">
        <CredenzaHeader className="p-4 sm:p-5 border-b border-border/50">
          <CredenzaTitle className="text-lg font-medium text-foreground">Document Library</CredenzaTitle>
          <CredenzaDescription className="text-xs sm:text-sm text-muted-foreground mt-1.5">
            Browse and explore your uploaded PDF documents
          </CredenzaDescription>
        </CredenzaHeader>

        {/* Main content area with fixed height and improved layout */}
        <div className="h-[60vh] sm:h-[65vh] md:h-[70vh] flex flex-col md:flex-row">
          {isLoading && !selectedPdf ? (
            <div className="w-full flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">Loading documents...</span>
              </div>
            </div>
          ) : (
            <>
              {/* PDF list with search - improved styling */}
              <div 
                className={cn(
                  "md:w-1/3 md:max-w-[320px] md:border-r border-border/50 flex flex-col",
                  "w-full h-full",
                  !showMobileList && "hidden md:flex" // Hide on mobile when viewing content
                )}
              >
                <div className="p-3 sm:p-4 border-b border-border/50 flex-shrink-0">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Search documents..."
                      className="pl-8 sm:pl-9 text-sm h-9 bg-background border-input"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
                
                <div className="flex-grow overflow-y-auto">
                  <div className="p-1.5 sm:p-2">
                    {filteredPdfList.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-6 sm:py-8 px-4 text-center">
                        <div className="rounded-full bg-muted p-3.5 mb-3">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                        </div>
                        {pdfList.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No documents uploaded yet</p>
                        ) : (
                          <p className="text-xs text-muted-foreground">No documents match your search</p>
                        )}
                      </div>
                    ) : (
                      <ul className="space-y-1">
                        {filteredPdfList.map((pdf, index) => (
                          <li 
                            key={index} 
                            className={cn(
                              "px-2.5 py-2 rounded-md cursor-pointer flex items-center gap-1.5 transition-colors text-sm",
                              selectedPdf === pdf.pdf_id 
                                ? 'bg-primary/10 text-primary border border-primary/20' 
                                : 'hover:bg-muted/70 text-foreground'
                            )}
                            onClick={() => handleSelectPdf(pdf.pdf_id, pdf.pdf_name)}
                          >
                            <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="font-medium truncate flex-1">{pdf.pdf_name}</span>
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
              
              {/* PDF content view - improved layout */}
              <div 
                className={cn(
                  "md:flex-1 flex flex-col w-full h-full",
                  showMobileList && "hidden md:flex" // Hide on mobile when showing list
                )}
              >
                {selectedPdf ? (
                  <>
                    {/* Mobile navigation header */}
                    <div className="md:hidden flex items-center gap-2 p-3 border-b border-border/50 flex-shrink-0">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 px-2 gap-1.5" 
                        onClick={toggleMobileView}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        <span>Back</span>
                      </Button>
                      <h3 className="text-sm font-medium truncate flex-1">{selectedPdfName}</h3>
                    </div>
                  
                    {/* Chunks view with optimized overflow handling */}
                    <div className="flex-grow overflow-y-auto">
                      <div className="p-4">
                        {isLoading ? (
                          <div className="w-full flex items-center justify-center py-8">
                            <div className="flex flex-col items-center gap-2">
                              <Loader2 className="h-6 w-6 animate-spin text-primary" />
                              <span className="text-xs text-muted-foreground">Loading content...</span>
                            </div>
                          </div>
                        ) : (
                          <>
                            {formattedChunks.length > 0 ? (
                              <div className="space-y-3">
                                {formattedChunks.map((chunk, idx) => (
                                  <Card key={idx} className="border border-border/80 overflow-hidden bg-card shadow-sm">
                                    <CardHeader className="p-3 flex flex-row items-center justify-between border-b border-border/30 bg-muted/30 gap-2 space-y-0 pb-3">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <Badge variant="outline" className="h-5 text-[10px] px-1.5 rounded-full bg-background/80 text-foreground border-border">
                                          Chunk {chunk.index}
                                        </Badge>
                                      </div>
                                      
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button 
                                              variant="ghost" 
                                              size="sm" 
                                              className="h-7 w-7 p-0 rounded-full"
                                              onClick={() => handleCopyChunk(idx, chunk.text)}
                                            >
                                              {copiedChunk === idx ? (
                                                <Check className="h-3.5 w-3.5 text-green-500" />
                                              ) : (
                                                <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                                              )}
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            {copiedChunk === idx ? "Copied!" : "Copy text"}
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    </CardHeader>
                                    <CardContent className="p-3 text-sm text-card-foreground whitespace-pre-wrap">
                                      {chunk.text}
                                    </CardContent>
                                  </Card>
                                ))}
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center py-12 text-center">
                                <div className="rounded-full bg-muted p-4 mb-4">
                                  <FileText className="h-5 w-5 text-muted-foreground" />
                                </div>
                                <p className="text-sm text-muted-foreground max-w-md">
                                  {pdfContent}
                                </p>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-4">
                    {/* Empty state on desktop */}
                    <div className="hidden md:flex flex-col items-center justify-center text-center max-w-md">
                      <div className="rounded-full bg-muted p-4 mb-4">
                        <FileText className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Select a document from the list to view its content
                      </p>
                    </div>
                    
                    {/* Mobile document selection prompt */}
                    <div className="md:hidden flex flex-col items-center justify-center text-center">
                      <div className="rounded-full bg-muted p-3 mb-3">
                        <Menu className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <p className="text-xs text-muted-foreground mb-4">
                        No document selected
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={toggleMobileView}
                        className="text-xs h-8"
                      >
                        Browse Documents
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </CredenzaContent>
    </Credenza>
  );
} 
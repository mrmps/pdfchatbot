import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

interface ParsedChunk {
  text: string;
  metadata: {
    loc?: {
      pageNumber: number;
    };
    [key: string]: any;
  };
}

interface ProcessedPdf {
  fileName: string;
  success: boolean;
  chunks?: ParsedChunk[];
  totalChunks?: number;
  error?: string;
}

interface ProcessPdfResult {
  success: boolean;
  pdfs: ProcessedPdf[];
  totalProcessed: number;
  error?: string;
}

/**
 * Client-side version of ingestPDFs API route
 * Processes PDF files in the browser, extracting text and splitting into chunks
 * Uses a pure browser approach without requiring Node.js modules
 */
export async function clientProcessPdfs(
  files: File[], 
  userId: string
): Promise<ProcessPdfResult> {
  if (!files || files.length === 0) {
    return {
      success: false,
      pdfs: [],
      totalProcessed: 0,
      error: 'At least one file is required'
    };
  }

  const processedPdfs: ProcessedPdf[] = [];

  // Process each PDF file
  for (const file of files) {
    try {
      const fileName = file.name;
      console.log(`Processing file: ${fileName}`);
      
      // Extract text directly using the file object and HTML5 capabilities
      const extractedText = await extractTextFromPdfFile(file);
      
      console.log(`Extracted ${extractedText.length} characters of text`);
      
      if (!extractedText || extractedText.length === 0) {
        throw new Error('No text could be extracted from PDF');
      }

      // Split text into chunks using the same configuration as server-side
      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1500,
        chunkOverlap: 200,
      });
      
      // Prepare document with the extracted text
      const documents = [{
        pageContent: extractedText,
        metadata: { source: fileName }
      }];
      
      const splitDocs = await textSplitter.splitDocuments(documents);
      console.log(`Split into ${splitDocs.length} chunks`);
      
      // Extract text content from the documents
      const textChunks: ParsedChunk[] = splitDocs.map(doc => ({
        text: doc.pageContent,
        metadata: {
          ...doc.metadata,
          loc: { pageNumber: 1 } // Default to page 1 since we're handling the document as a whole
        }
      }));

      processedPdfs.push({
        fileName,
        success: true,
        chunks: textChunks,
        totalChunks: textChunks.length
      });
    } catch (error) {
      console.error(`Error processing PDF ${file.name}:`, error);
      processedPdfs.push({
        fileName: file.name,
        success: false,
        error: 'Failed to process PDF file'
      });
    }
  }

  return {
    success: true,
    pdfs: processedPdfs,
    totalProcessed: processedPdfs.length
  };
}

/**
 * Extracts text from a PDF file using browser capabilities
 * This approach doesn't require any external libraries with Node.js dependencies
 * @param file The PDF file to extract text from
 * @returns The extracted text as a string
 */
async function extractTextFromPdfFile(file: File): Promise<string> {
  // Create a readable stream from the file
  const reader = new FileReader();
  
  // Convert the file to text
  return new Promise((resolve, reject) => {
    reader.onload = async (event) => {
      try {
        if (!event.target || !event.target.result) {
          return reject(new Error('Failed to read the file'));
        }
        
        // Get the file content as an ArrayBuffer
        const fileContent = event.target.result as ArrayBuffer;
        
        // For browser-based PDF parsing, we need to use PDF.js
        if (typeof window !== 'undefined') {
          // Check if PDF.js is already loaded
          if (!(window as any).pdfjsLib) {
            console.log('Loading PDF.js library...');
            // Load PDF.js from CDN
            const pdfjsScript = document.createElement('script');
            pdfjsScript.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
            document.head.appendChild(pdfjsScript);
            
            // Wait for the script to load
            await new Promise<void>((resolve) => {
              pdfjsScript.onload = () => resolve();
            });
            
            // Set worker source
            (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = 
              'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
          }
          
          // Use PDF.js to load and parse the PDF
          const pdfjs = (window as any).pdfjsLib;
          const loadingTask = pdfjs.getDocument({ data: new Uint8Array(fileContent) });
          const pdf = await loadingTask.promise;
          
          console.log(`PDF loaded with ${pdf.numPages} pages`);
          
          // Extract text from all pages
          let fullText = '';
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items
              .map((item: any) => item.str)
              .join(' ');
            
            fullText += `${pageText}\n`;
          }
          
          if (fullText.trim().length < 200) {
            console.warn('PDF.js extracted minimal text. The PDF might be scanned or image-based.');
            fullText += `\n[Note: This PDF (${file.name}) appears to contain mostly images or scanned content. Text extraction was limited.]`;
          }
          
          resolve(fullText);
        } else {
          // If we're not in a browser environment, throw an error
          reject(new Error('PDF parsing is only supported in browser environments'));
        }
        
      } catch (error) {
        console.error('Error extracting text from PDF:', error);
        reject(error);
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Error reading the file'));
    };
    
    // Read the file as an ArrayBuffer
    reader.readAsArrayBuffer(file);
  });
} 
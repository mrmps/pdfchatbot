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
        
        // Get the file content as a string
        const fileContent = event.target.result as ArrayBuffer;
        
        // For PDF files, we can't directly get the text content from the ArrayBuffer
        // Instead, we'll use a more robust approach to extract text 
        
        // Convert ArrayBuffer to a string
        const textDecoder = new TextDecoder('utf-8');
        let text = textDecoder.decode(fileContent);
        
        // Enhanced text cleaning for better extraction quality
        // First pass - extract meaningful text blocks
        text = text
          // Remove binary content indicators
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ')
          // Remove PDF-specific markers
          .replace(/<<\/[^>]+>>/g, ' ')
          // Clean up common PDF artifacts 
          .replace(/(\(cid:\d+\))|(\(FORMFEED\))/g, ' ')
          // Normalize whitespace
          .replace(/\s+/g, ' ');
        
        // Second pass - identify and extract text sections
        // Look for patterns that often indicate text content in PDFs
        const textPatterns = [
          /\(([^)]{2,})\)/g,              // Content in parentheses (common PDF text format)
          /\/Text\s*([^/]+)/g,            // Text blocks
          /TJ\s*\[([^\]]+)\]/g,           // Text positioning blocks
          /(\/\w+\s+\d+\s+Tf\s*)?(\([^)]+\)\s*)+Tj/g, // Text drawing operations
        ];
        
        let extractedText = '';
        
        // Apply each pattern and collect results
        textPatterns.forEach(pattern => {
          const matches = text.match(pattern);
          if (matches) {
            extractedText += ' ' + matches.join(' ');
          }
        });
        
        // If we got meaningful extracted text, use it
        if (extractedText.length > 1000) {
          text = extractedText;
        }
        
        // Final cleanup
        text = text
          // Extract content from PDF notation parentheses
          .replace(/\(([^)]+)\)/g, '$1')
          // Remove common PDF control sequences
          .replace(/\\(\d{3}|n|r|t|f|\\|\(|\))/g, ' ')
          // Remove remaining non-printable characters but keep newlines and tabs
          .replace(/[^\x20-\x7E\x0A\x0D\t]/g, ' ')
          // Normalize unicode space characters 
          .replace(/[\u2000-\u200F\u2028-\u202F\u205F-\u206F]/g, ' ')
          // Clean up PDF specific artifacts like form feed characters
          .replace(/(\(cid:\d+\))|(\(FORMFEED\))/g, ' ')
          // Normalize spaces again to clean up leftovers
          .replace(/\s+/g, ' ')
          // Final trim
          .trim();
        
        // If text extraction failed or returned very little text, send a placeholder
        if (!text || text.length < 200) {
          console.warn('Basic text extraction yielded minimal results. Using fallback message.');
          text = `This PDF document (${file.name}) may contain images, scanned content, or be protected against text extraction. ` +
                 `The document was processed but minimal text could be extracted. ` +
                 `File size: ${Math.round(file.size / 1024)} KB`;
        }
        
        // For very large PDFs, we want to handle them more efficiently
        if (text.length > 10000000) { // 10 MB of text
          console.warn(`Very large text content (${(text.length / 1000000).toFixed(2)} MB) detected, optimizing...`);
          // Trim redundant whitespace more aggressively
          text = text.replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n');
          
          // Optionally truncate extremely large texts
          if (text.length > 30000000) { // 30MB is excessive
            console.warn(`Extremely large text (${(text.length / 1000000).toFixed(2)} MB), truncating to 30MB`);
            text = text.substring(0, 30000000) + 
                   "\n\n[Content truncated due to excessive size. The full document was too large to process completely.]";
          }
        }
        
        resolve(text);
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
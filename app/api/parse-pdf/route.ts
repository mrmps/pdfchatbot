import { NextRequest, NextResponse } from 'next/server';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { createHash } from 'crypto';
import { writeFile, unlink, stat } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { existsSync } from 'fs';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '30mb',
    },
  },
};

export async function POST(request: NextRequest) {
  let tempFilePath = '';
  
  try {
    console.log('PDF parse API route called');
    // Get the form data
    const formData = await request.formData();
    const pdfFile = formData.get('pdfFile') as File | null;
    const userId = formData.get('userId') as string | null;

    // Validate inputs
    if (!pdfFile) {
      console.error('No PDF file provided in the request');
      return NextResponse.json(
        { error: 'No PDF file uploaded' },
        { status: 400 }
      );
    }

    console.log(`Processing PDF: ${pdfFile.name}, size: ${(pdfFile.size / 1024).toFixed(2)} KB, type: ${pdfFile.type}`);
    
    // Validate PDF file type
    if (pdfFile.type !== 'application/pdf' && !pdfFile.name.toLowerCase().endsWith('.pdf')) {
      console.error(`Invalid file type: ${pdfFile.type}`);
      return NextResponse.json(
        { error: 'Invalid file type. Only PDF files are supported.' },
        { status: 400 }
      );
    }

    if (!userId) {
      console.error('No userId provided in the request');
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Create temporary file for processing
    const fileHash = createHash('md5')
      .update(`${userId}-${pdfFile.name}-${Date.now()}`)
      .digest('hex');
    tempFilePath = join(tmpdir(), `${fileHash}.pdf`);
    console.log(`Temporary file path: ${tempFilePath}`);

    try {
      // Write the file to disk
      console.log('Converting file to ArrayBuffer...');
      const arrayBuffer = await pdfFile.arrayBuffer();
      console.log(`ArrayBuffer created, size: ${(arrayBuffer.byteLength / 1024).toFixed(2)} KB`);
      
      if (arrayBuffer.byteLength === 0) {
        throw new Error('PDF file is empty (zero bytes)');
      }
      
      console.log('Writing file to disk...');
      await writeFile(tempFilePath, new Uint8Array(arrayBuffer));
      
      // Verify file was written and check size
      if (!existsSync(tempFilePath)) {
        throw new Error(`Failed to write temporary file to ${tempFilePath}`);
      }
      
      const fileStats = await stat(tempFilePath);
      console.log(`File written to disk: ${tempFilePath}, size: ${(fileStats.size / 1024).toFixed(2)} KB`);
      
      if (fileStats.size === 0) {
        throw new Error('Written PDF file is empty (zero bytes)');
      }
      
      // Initialize PDFLoader with try/catch
      console.log('Initializing PDFLoader...');
      let loader;
      try {
        loader = new PDFLoader(tempFilePath, {
          splitPages: true,
        });
      } catch (loaderError) {
        console.error('Error initializing PDFLoader:', loaderError);
        throw new Error(`Failed to initialize PDF loader: ${loaderError instanceof Error ? loaderError.message : String(loaderError)}`);
      }

      // Load and process the document with detailed error handling
      console.log('Loading PDF document...');
      let docs;
      try {
        docs = await loader.load();
      } catch (loadError) {
        console.error('Error loading PDF with PDFLoader:', loadError);
        throw new Error(`Failed to load PDF: ${loadError instanceof Error ? loadError.message : String(loadError)}`);
      }
      
      if (!docs || docs.length === 0) {
        throw new Error('No pages extracted from PDF - the document may be empty or corrupted');
      }
      
      console.log(`Successfully extracted ${docs.length} pages from PDF: ${pdfFile.name}`);

      // Check if we have any text content
      const hasTextContent = docs.some(doc => doc.pageContent && doc.pageContent.trim().length > 0);
      if (!hasTextContent) {
        console.warn('No text content found in PDF - it may be scanned or image-only');
      }

      // Split text into chunks using the text splitter
      console.log('Splitting document into chunks...');
      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1500,
        chunkOverlap: 200,
      });

      let splitDocs;
      try {
        splitDocs = await textSplitter.splitDocuments(docs);
      } catch (splitError) {
        console.error('Error splitting document:', splitError);
        throw new Error(`Failed to split document: ${splitError instanceof Error ? splitError.message : String(splitError)}`);
      }
      
      console.log(`Successfully split into ${splitDocs.length} chunks`);

      // Format the chunks for the response
      console.log('Formatting chunks for response...');
      const chunks = splitDocs.map((doc) => ({
        text: doc.pageContent,
        metadata: {
          pageNumber: doc.metadata.loc?.pageNumber || doc.metadata.page || 1,
          source: pdfFile.name,
        },
      }));

      // Return the extracted text chunks
      console.log('Returning successful response with parsed chunks...');
      return NextResponse.json({
        success: true,
        fileName: pdfFile.name,
        pageCount: docs.length,
        chunks: chunks,
        chunkCount: chunks.length,
      });
    } finally {
      // Clean up: Remove the temporary file
      if (tempFilePath) {
        try {
          console.log(`Cleaning up temporary file: ${tempFilePath}`);
          if (existsSync(tempFilePath)) {
            await unlink(tempFilePath);
            console.log('Temporary file deleted successfully');
          } else {
            console.log('No temporary file to delete - it may not have been created');
          }
        } catch (unlinkError) {
          console.error(`Failed to delete temporary file ${tempFilePath}:`, unlinkError);
        }
      }
    }
  } catch (error) {
    console.error('Error processing PDF:', error);
    
    // Provide more detailed error information
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : 'No stack trace available';
    const errorName = error instanceof Error ? error.name : 'Unknown Error';
    
    console.error('Error details:', { 
      name: errorName,
      message: errorMessage, 
      stack: errorStack,
      tempFile: tempFilePath || 'No temp file created'
    });
    
    return NextResponse.json(
      {
        error: 'Failed to process PDF file',
        message: errorMessage,
        details: errorStack,
        name: errorName,
      },
      { status: 500 }
    );
  }
} 
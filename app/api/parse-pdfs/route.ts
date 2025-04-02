import { NextRequest, NextResponse } from 'next/server';
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export async function POST(request: NextRequest) {
  // Temporary file paths to clean up
  const tempFilePaths: string[] = [];
  
  try {
    // Get the form data
    const formData = await request.formData();
    const pdfFiles = formData.getAll('pdfFile') as File[];
    const userId = formData.get('userId') as string | null;

    // Validate inputs
    if (!pdfFiles || pdfFiles.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No PDF files uploaded' },
        { status: 400 }
      );
    }
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      );
    }

    const results = [];
    
    // Process each PDF file
    for (const pdfFile of pdfFiles) {
      // Validate PDF file type
      if (pdfFile.type !== 'application/pdf' && !pdfFile.name.toLowerCase().endsWith('.pdf')) {
        results.push({
          success: false,
          fileName: pdfFile.name,
          error: 'Invalid file type. Only PDF files are supported.'
        });
        continue;
      }

      // Create a temporary file path
      const tempFilePath = path.join(os.tmpdir(), `pdf-${Date.now()}-${Math.round(Math.random() * 10000)}.pdf`);
      tempFilePaths.push(tempFilePath);
      
      try {
        // Get file buffer directly
        const arrayBuffer = await pdfFile.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Write to temporary file
        await fs.writeFile(tempFilePath, new Uint8Array(arrayBuffer));
        
        // Process the PDF from the temporary file
        const loader = new PDFLoader(tempFilePath, {
          splitPages: true,
        });

        const docs = await loader.load();
        
        // Split text into chunks
        const textSplitter = new RecursiveCharacterTextSplitter({
          chunkSize: 1500,
          chunkOverlap: 0,
          separators: ["\n\n", "\n", ". ", "! ", "? "],
          keepSeparator: true
        });

        const splitDocs = await textSplitter.splitDocuments(docs);
        
        // Format the chunks for the response
        const chunks = splitDocs.map((doc) => ({
          text: doc.pageContent,
          metadata: {
            pageNumber: doc.metadata.loc?.pageNumber || doc.metadata.page || 1,
            source: pdfFile.name,
          },
        }));

        // Add to results
        results.push({
          success: true,
          fileName: pdfFile.name,
          pageCount: docs.length,
          chunks: chunks,
          chunkCount: chunks.length,
        });
      } catch (fileError) {
        results.push({
          success: false,
          fileName: pdfFile.name,
          error: fileError instanceof Error ? fileError.message : String(fileError)
        });
      }
    }

    return NextResponse.json({
      success: true,
      pdfs: results
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process PDF files',
        message: errorMessage,
      },
      { status: 500 }
    );
  } finally {
    // Clean up all temporary files
    for (const filePath of tempFilePaths) {
      try {
        await fs.unlink(filePath).catch(() => {});
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }
}

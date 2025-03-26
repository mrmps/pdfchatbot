import { NextResponse } from 'next/server';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';

export async function POST(request: Request) {
  try {
    // Get form data with file uploads
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const userId = formData.get('userId') as string;

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'At least one file is required' }, { status: 400 });
    }

    const processedPdfs = [];

    // Process each PDF file
    for (const file of files) {
      try {
        const fileName = file.name;
        // Convert the file to ArrayBuffer and then to Blob
        const arrayBuffer = await file.arrayBuffer();
        const blob = new Blob([arrayBuffer], { type: file.type });
        
        // Use PDFLoader with the blob
        const loader = new PDFLoader(blob);
        const rawDocs = await loader.load();

        /* Split text into chunks */
        const textSplitter = new RecursiveCharacterTextSplitter({
          chunkSize: 1500,
          chunkOverlap: 200,
        });
        const splitDocs = await textSplitter.splitDocuments(rawDocs);
        
        // Extract text content from the documents
        const textChunks = splitDocs.map(doc => ({
          text: doc.pageContent,
          metadata: doc.metadata
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

    return NextResponse.json({
      success: true,
      pdfs: processedPdfs,
      totalProcessed: processedPdfs.length
    });
  } catch (error) {
    console.error('Error processing PDFs:', error);
    return NextResponse.json({ 
      success: false,
      error: 'Failed to process PDF files' 
    }, { status: 500 });
  }
}
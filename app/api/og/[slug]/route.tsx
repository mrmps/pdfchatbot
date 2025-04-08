import { NextRequest } from 'next/server';

export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
  // Get the slug from the URL
  const { slug } = params;
  
  // Base URL for the TailGraph API
  const tailgraphUrl = new URL('https://og.tailgraph.com/og');
  
  // Set common parameters for a Vercel-like design
  tailgraphUrl.searchParams.set('fontFamily', 'Inter');
  tailgraphUrl.searchParams.set('bgTailwind', 'bg-black');
  tailgraphUrl.searchParams.set('footer', 'pdfgpt.dev');
  tailgraphUrl.searchParams.set('footerTailwind', 'text-gray-500');
  tailgraphUrl.searchParams.set('containerTailwind', 'flex flex-col justify-between h-full');

  // Customize based on slug
  switch (slug) {
    case 'pdf':
      // Custom OG for PDF pages
      tailgraphUrl.searchParams.set('title', 'Document Intelligence');
      tailgraphUrl.searchParams.set('titleTailwind', 'text-white font-bold text-6xl tracking-tight');
      tailgraphUrl.searchParams.set('text', 'Extract insights from your PDF documents with AI');
      tailgraphUrl.searchParams.set('textTailwind', 'text-gray-400 text-2xl mt-4');
      tailgraphUrl.searchParams.set('overlayTailwind', 'bg-gradient-to-br from-blue-950 to-black');
      break;
      
    case 'article':
      // Custom OG for blog articles
      tailgraphUrl.searchParams.set('title', 'PDF Chat Blog');
      tailgraphUrl.searchParams.set('titleTailwind', 'text-white font-bold text-6xl tracking-tight');
      tailgraphUrl.searchParams.set('text', 'Insights on document intelligence and AI');
      tailgraphUrl.searchParams.set('textTailwind', 'text-gray-400 text-2xl mt-4');
      tailgraphUrl.searchParams.set('overlayTailwind', 'bg-gradient-to-br from-indigo-950 to-black');
      break;
      
    default:
      // Default OG image
      tailgraphUrl.searchParams.set('title', 'PDF Chat');
      tailgraphUrl.searchParams.set('titleTailwind', 'text-white font-bold text-6xl tracking-tight');
      tailgraphUrl.searchParams.set('text', 'Chat with your PDF documents using AI');
      tailgraphUrl.searchParams.set('textTailwind', 'text-gray-400 text-2xl mt-4');
      tailgraphUrl.searchParams.set('overlayTailwind', 'bg-gradient-to-br from-black to-gray-900');
  }
  
  // Get query parameters, if any
  const { searchParams } = new URL(request.url);
  const title = searchParams.get('title');
  const text = searchParams.get('text');
  
  // Override with query params if provided
  if (title) tailgraphUrl.searchParams.set('title', title);
  if (text) tailgraphUrl.searchParams.set('text', text);
  
  // Redirect to the TailGraph URL
  return Response.redirect(tailgraphUrl.toString(), 302);
} 
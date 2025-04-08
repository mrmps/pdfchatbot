import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  // Base URL for the TailGraph API
  const tailgraphUrl = new URL('https://og.tailgraph.com/og');
  
  // Set parameters for a Vercel-like design
  tailgraphUrl.searchParams.set('fontFamily', 'Inter');
  tailgraphUrl.searchParams.set('title', 'PDF Chat');
  tailgraphUrl.searchParams.set('titleTailwind', 'text-white font-bold text-6xl tracking-tight');
  tailgraphUrl.searchParams.set('text', 'Chat with your PDF documents using AI');
  tailgraphUrl.searchParams.set('textTailwind', 'text-gray-400 text-2xl mt-4');
  tailgraphUrl.searchParams.set('bgTailwind', 'bg-black');
  tailgraphUrl.searchParams.set('overlayTailwind', 'bg-gradient-to-br from-black to-gray-900');
  tailgraphUrl.searchParams.set('footer', 'pdfgpt.dev');
  tailgraphUrl.searchParams.set('footerTailwind', 'text-gray-500');
  tailgraphUrl.searchParams.set('containerTailwind', 'flex flex-col justify-between h-full');
  
  // Redirect to the TailGraph URL
  return Response.redirect(tailgraphUrl.toString(), 302);
} 
# Beyond RAG: Building a Full-Stack, Agentic PDF Assistant That Actually Works 

![Header Image showing the PDF Chat interface with a conversation about a technical document]
Last week, I needed quick access to information from my AI engineering ebooks and technical books while writing a blog post. I was tired of searching through countless PDFs and thousands of pages to find specific concepts.

This frustration led me to create [PDF Chat](https://pdfgpt.dev) – a simple tool that lets you have conversations with your documents. Upload your PDFs, ask questions in plain language, and get immediate answers without tedious searching.

> *Quick context: I'm a developer advocate for [KDB.AI](https://kdb.ai), and I recently ran a [meetup on PDF processing](https://youtu.be/ZIS6ZfxQT9w?si=AzfTXOFHnesyY-mi) with teams from Unstructured and Chunkr. This project emerged from seeing what these technologies could do but wanting something more accessible for everyday users.*

**Quick note:** The app is live at [pdfgpt.dev](https://pdfgpt.dev). You can upload up to three PDFs at once and start chatting immediately.

In this technical deep-dive, I'll walk through the architecture, challenges, and decisions behind building a document intelligence system with:

- Server-side PDF processing using Next.js API routes and LangChain's PDFLoader
- Vector embeddings and semantic search for accurate retrieval
- Tool-calling patterns for reliable AI responses 
- No user accounts or authentication required

The project is open-source, so check out the [GitHub repo](https://github.com/mrmps/pdfchatbot) if you want to contribute.

## Why Build Yet Another PDF Chat App?

Before diving into the technical details, let me explain why I built this when other PDF chat tools already exist.

The existing solutions had three major limitations:

1. **Forced authentication** – Most tools require creating an account before you can even test the functionality
2. **Single document focus** – Few solutions let you chat with multiple PDFs simultaneously
3. **Limited context management** – No tools intelligently chose which documents to include in the context based on the question
4. **Python-only demos** – Most open source tools are just Python demos or notebooks rather than production-ready applications

I wanted something that would let me instantly upload multiple technical documents and ask questions that might span information across all of them – without signing up for yet another service. The agent-based approach could intelligently decide which documents to search based on the question context.

## My PDF Processing Journey: The Unexpected Challenge

What started as a simple project quickly revealed the most challenging aspect of building a document intelligence system: high-quality PDF processing. My journey through different PDF parsing approaches was both enlightening and frustrating:

1. **LlamaParse**: I started with LlamaParse, which was fantastic - easy to use with high-quality parsing results. The problem was that I quickly ran out of credits, and at $3/1000 pages, it wasn't viable for a free demo app.

2. **Client-side processing with PDF.js**: To eliminate server costs, I tried browser-based parsing with PDF.js. This was surprisingly fast with no server processing required! However, the chunk quality was noticeably lower than LlamaParse, and I got frustrated with subpar results.

3. **Chunkr**: Next, I tried Chunkr, which produced excellent quality chunks. The downside was that processing speed was too slow for an interactive demo, even in the fastest mode. Much slower than client-side PDF.js, though the chunks were MUCH better.

4. **Server-side processing with LangChain**: My current approach uses Next.js API routes with LangChain's PDFLoader. The output quality is comparable to the client-side PDF.js solution, which makes me think they work similarly under the hood.

The key insight for me was that JavaScript-based PDF parsing tools (whether client or server-side) produce similar results but can't match specialized Python tools or services like LlamaParse. For production applications, Python-based solutions like PyMuPDF4LLM or Docling, or services like Unstructured or LlamaParse, would be better choices.

Surprisingly, the hardest part of this project wasn't implementing vector databases or building the agentic system - it was extracting good text from PDFs!

## Architecture: From Design Constraints to System Design

I started with three non-negotiable constraints:

1. **Zero authentication required** – users should be able to chat with their documents immediately
2. **Zero maintenance cost** – the system should require minimal ongoing maintenance with predictable costs
3. **Accurate retrieval** – the system must find relevant content even with inexact queries

To meet these constraints, I made these key architectural decisions:

1. **Server-side PDF processing** – process documents through Next.js API routes using LangChain's PDFLoader
2. **Next.js frontend** with a lightweight FastAPI backend
3. **KDB.AI vector database** for efficient similarity search
4. **OpenAI API** for embeddings and LLM capabilities

The flow works like this:

```
┌────────────┐         ┌────────────┐          ┌─────────────┐
│            │         │            │          │             │
│    PDF     │ ───────▶│  Next.js   │ ─────────▶  Text       │
│            │ upload  │  API Route │ extraction│  Chunks     │
└────────────┘         └────────────┘          └──────┬──────┘
                                                      │
                                                      │ API call
                                                      ▼
┌────────────┐         ┌────────────┐          ┌─────────────┐
│            │         │            │          │             │
│    LLM     │◀────────│  Vector    │◀─────────│  FastAPI    │
│  Response  │ context │  Search    │ query    │  Backend    │
└────────────┘         └────────────┘          └─────────────┘
```

The system creates an anonymous identity for each user through browser fingerprinting, eliminating the friction of account creation while maintaining user-specific document storage.

An interesting aspect is that the LLM decides which PDFs to search when a user asks a question, focusing on relevant documents based on the query context.

## Server-Side PDF Processing: The Implementation

Moving from client-side to server-side PDF processing involved creating a dedicated API route using LangChain's PDFLoader. Here's a simplified version:

```typescript
// app/api/parse-pdfs/route.ts
export async function POST(request: NextRequest) {
  try {
    // Get form data with PDF files and user ID
    const formData = await request.formData();
    const pdfFiles = formData.getAll('pdfFile') as File[];
    
    // Process each PDF file
    for (const pdfFile of pdfFiles) {
      // Create a temporary file for processing
      const tempFilePath = path.join(os.tmpdir(), `pdf-${Date.now()}.pdf`);
      
      // Write uploaded file to temp location
      const arrayBuffer = await pdfFile.arrayBuffer();
      await fs.writeFile(tempFilePath, new Uint8Array(arrayBuffer));
      
      // Use LangChain to load and process the PDF
      const loader = new PDFLoader(tempFilePath, { splitPages: true });
      const docs = await loader.load();
      
      // Split into chunks with smart sentence handling
      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1500,
        chunkOverlap: 200,
        separators: ["\n\n", "\n", ". ", "! ", "? "],
        keepSeparator: true
      });
      
      const splitDocs = await textSplitter.splitDocuments(docs);
      
      // Format and return chunks
      // ...
    }
  } catch (error) {
    // Error handling
  }
}
```

While this approach doesn't match specialized PDF parsing services, it's a good middle ground that's affordable to maintain as a free service.

## Vector Search Implementation: Beyond Basic Similarity

With the text chunks extracted, the next challenge was implementing effective retrieval. I chose KDB.AI as the vector database for three reasons:

1. Fast query performance at scale
2. Simple filtering for multi-user segmentation
3. A VERY generous free tier for side projects

The main advantage with KDB.AI here is the cloud offering is free for unlimited requests, and can handle thousands of users. If I quantized the embeddings (used few dimensions) and used hybrid search, I could *improve* search quality while scaling to tens of thousands of users--completly free. However, that might complicate this demo.

If you would like to learn more about how to scale this demo and improve search quality, check out [KDB.AI's hybrid search documentation](https://code.kx.com/kdbai/latest/use/hybrid-search.html) and [Hugging Face's guide on embedding quantization](https://huggingface.co/blog/embedding-quantization) for maximizing retrieval performance with minimal resources.

Here's how the search works on the FastAPI backend:

```python
# Pseudocode for our search endpoint with two modes
@app.get("/search")
async def search(user_id, query, pdf_ids=None, search_mode="unified", limit=20):
    # Convert query text to vector embedding
    query_vector = embed_query(query)
    
    if search_mode == "individual" and pdf_ids:
        # Individual mode: search each PDF separately
        # 1. Distribute the search limit fairly across PDFs
        # 2. Query each PDF independently
        # 3. Combine and rank results by relevance
        results = search_pdfs_individually(user_id, query_vector, pdf_ids, limit)
    else:
        # Unified mode: search across all selected PDFs at once
        # Filter by user_id and optionally by pdf_ids
        results = search_pdfs_unified(user_id, query_vector, pdf_ids, limit)
        
    return format_results(results)
```

What makes this work well isn't just the vector similarity search – it's the additional features:

1. User-specific document filtering
2. Dual search modes for different query scenarios (unified for breadth, individual for depth)
3. Fair result distribution when searching multiple documents by performing a separate search for each document. (if searching x documents because the LLM decided x documents are relevant, it will perform x searches. If all documents are relevant, it will perform one search)

## The LLM Integration: Tool Calling for Reliable Answers

With effective retrieval in place, the final challenge was coordinating between the LLM and the search system. Traditional RAG implementations stuff all relevant context into the prompt – a technique that breaks down with complex or multi-document questions.

Instead, I implemented a tool-calling approach using Vercel's AI SDK:

```typescript
const searchPdfs = tool({
  name: "searchPdfs",
  description: "Search for information in the user's PDF documents",
  parameters: z.object({
    query: z.string().describe('The search query to find information in PDFs'),
    pdfIds: z.array(z.string()).optional()
  }),
  execute: async ({ query, pdfIds }) => await searchDocuments({ userId, query, pdfIds })
});
```

This approach enables the LLM to:
1. Decide whether it needs to search at all
2. Formulate effective search queries
3. Determine when it has sufficient information
4. Choose which document subsets are most relevant

One huge advantage of this agentic approach is that it makes multi-document interaction natural. The LLM has access to all document names, allowing it to dynamically choose which PDFs to search based on the query context. Unlike other tools that treat each PDF as a separate entity, PDF Chat can intelligently reason across multiple documents, comparing information and finding connections between different sources.

## User Experience: The Details That Matter

While the backend architecture is interesting, the user experience determines adoption. Three UX details proved particularly important:

**1. Transparent processing feedback:**

Instead of a generic progress bar, I implemented detailed stage-based feedback:

```tsx
{uploading && (
  <div className="w-full mt-4">
    <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
      <div className="h-full bg-blue-500" style={{ width: `${progress}%` }} />
    </div>
    <p className="text-xs text-center mt-2 text-gray-600">
      {getStageMessage(processingStage, currentPage, totalPages)}
    </p>
  </div>
)}
```
**2. Search result transparency:**

When the AI references information from documents, it clearly indicates which chunks were retrieved and whether it searched across all documents or focused on specific ones. This helps users understand how the system arrived at its answers.

**3. Document context exploration:**

The interface allows users to see which documents were searched and the specific content chunks that informed the AI's response. Users can also perform full text search on document titles, which is particularly valuable when managing dozens of documents. This search capability helps users quickly locate specific documents and verify that PDF parsing worked correctly, allowing them to identify any parsing issues that might affect the quality of responses.

These UX details address core friction points in document interaction systems and have significantly increased user engagement.

## What's Next: The Document Intelligence Roadmap

The current version works well for text-based PDFs, but there's room for improvement in several areas:

**1. Better PDF processing**

The quality of extracted text remains the biggest challenge. Future versions will likely integrate with specialized PDF processing services or build a dedicated microservice using Python-based tools. 

**2. Multi-modal understanding**

Text extraction misses critical information in charts, diagrams, and images. The next iteration will use vision models to process visual elements. Right now we ignore charts and images completely.

**3. Advanced document structure understanding**

Current chunking is content-based without understanding document structure. Future versions will implement structure-aware processing, either by using layout detection (which Chunkr and Unstructured do) or by using more advanced chunking methods. Using LLMs to parse could also get results in markdown, making effective chunking much easier.

**4. Citing sources and letting users pick which documents to include**

The LLM currently chooses which documents to include based on the query, but we should also let users pick for themselves. A good UI for citations would improve trust and verifiability.

## Wrapping Up: Breaking PDFs Out of Their Silos

PDF Chat began as a weekend hack to solve a specific problem: I was tired of manually searching through technical PDFs. What emerged was a practical demonstration of how modern AI tools can transform static documents into queryable knowledge bases.

The real power isn't in any single technology component, but in removing the friction between users and their documents. No authentication hoops, no complex setup - just upload and start asking questions. The technical stack enables a fundamentally different way to interact with document content.

If you want to check it out:

1. Head to [PDF Chat](https://pdfgpt.dev) and upload some PDFs
2. Dig into the [source code](https://github.com/mrmps/pdfchatbot) if you're curious about implementation details
3. Open an issue if you encounter bugs or have feature requests
4. PRs welcome - especially if you're interested in tackling the PDF processing challenges

This project shows how combining relatively simple components (PDF parsing, vector search, and LLMs) can create something genuinely useful - turning static documents into interactive knowledge sources.

---

*If you're working on document processing systems or RAG applications, I'd be interested to hear about your technical challenges. What PDF parsing approaches have worked best for you? Any clever solutions for handling complex layouts or mixed content types? Drop a note in the comments or open an issue on GitHub.*
# Beyond RAG: Building a Full-Stack, Agentic PDF Assistant That Actually Works 

![Header Image showing the PDF Chat interface with a conversation about a technical document]

Last week, I badly needed quick access to information from my AI engineering ebooks and technical PDFs while writing a blog post. I was tired of searching through countless PDFs and thousands of pages to find specific concepts.

Even after searching for an hour, I couldn't find a free chat with PDF app that lets you upload unlimited PDFs--so I decided to built it myself.

What resulted is [PDF Chat](https://pdfgpt.dev) – a simple tool that lets you have conversations with your documents. Upload your PDFs, ask questions in plain language, and get immediate answers without tedious searching.

> *Quick context: I'm a developer advocate for [KDB.AI](https://kdb.ai), and I recently ran a [meetup on PDF processing](https://youtu.be/ZIS6ZfxQT9w?si=AzfTXOFHnesyY-mi) with teams from Unstructured and Chunkr. This project emerged from seeing what these technologies could do but wanting something more accessible for everyday users.*

**Quick note:** The app is live at [pdfgpt.dev](https://pdfgpt.dev). You can upload up to three PDFs at once and start chatting immediately.

In this technical deep-dive, I'll walk through the architecture, challenges, and decisions behind building a document intelligence system with:

- Server-side PDF processing using Next.js API routes and LangChain's PDFLoader
- Vector embeddings and semantic search for accurate retrieval
- Tool-calling patterns for reliable AI responses 
- No user accounts or authentication required

The project is open-source, so check out the [GitHub repo](https://github.com/mrmps/pdfchatbot) if you want to contribute.

## Why Build Yet Another PDF Chat App?

Before diving into the technical details, let me explain why I built this when other PDF chat tools already exist.

The existing solutions had three major limitations:

1. **Forced authentication** – Most tools require creating an account before you can even test the functionality
2. **Single document focus** – Few solutions let you chat with multiple PDFs simultaneously
3. **Limited context management** – No tools intelligently chose which documents to include in the context based on the question
4. **Python-only demos** – Most open source tools are just Python demos or notebooks rather than production-ready applications

I wanted something that would let me instantly upload multiple technical documents and ask questions that might span information across all of them – without signing up for yet another service. The agent-based approach could intelligently decide which documents to search based on the question context.

## My PDF Processing Journey: The Unexpected Challenge

What started as a simple project quickly revealed the most challenging aspect of building a document intelligence system: high-quality PDF processing. By the end of this I had tried most of the more common solutions to this problem, so I hope you can learn from my mistakes!

1. **LlamaParse**: I started with LlamaParse, which was fantastic - easy to use with high-quality parsing results. The problem was that I quickly ran out of credits, and at $3/1000 pages, it wasn't viable for a free demo app.

2. **Client-side processing with PDF.js**: To eliminate server costs, I tried browser-based parsing with PDF.js. This was surprisingly fast with no server processing required! However, the chunk quality was noticeably lower than LlamaParse, and I got frustrated with subpar results.

3. **Chunkr**: Next, I tried Chunkr, which produced excellent quality chunks. The downside was that processing speed was too slow for an interactive demo, even in the fastest mode. Much slower than client-side PDF.js, though the chunks were MUCH better.

4. **Server-side processing with LangChain**: My current approach uses Next.js API routes with LangChain's PDFLoader. The output quality is comparable to the client-side PDF.js solution, which makes me think they work similarly under the hood.

The key insight for me was that JavaScript-based PDF parsing tools (whether client or server-side) produce similar results but can't match specialized Python tools or services like LlamaParse. For production applications, Python-based solutions like PyMuPDF4LLM or Docling, or services like Unstructured or LlamaParse, would be better choices.

Surprisingly (or perhaps unsurprisingly if you have dealt with PDF parsing before), the hardest part of this project wasn't implementing vector databases or building the agentic system - it was extracting good text from PDFs!

## Architecture: From Design Constraints to System Design

I started with three non-negotiable constraints:

1. **Zero authentication required** – users should be able to chat with their documents immediately
2. **Zero maintenance cost** – the system should require minimal ongoing maintenance with predictable costs
3. **Accurate retrieval** – the system must find relevant content even with inexact queries

To meet these constraints, I made these key architectural decisions:

1. **Server-side PDF processing** – process documents through Next.js API routes using LangChain's PDFLoader
2. **Next.js frontend** with a lightweight FastAPI backend
3. **KDB.AI vector database** for efficient similarity search
4. **OpenAI API** for embeddings and LLM capabilities

The flow works like this:

```
┌────────────┐         ┌────────────┐          ┌─────────────┐
│            │         │            │          │             │
│    PDF     │ ───────▶│  Next.js   │ ─────────▶  Text       │
│            │ upload  │  API Route │ extraction│  Chunks     │
└────────────┘         └────────────┘          └──────┬──────┘
                                                      │
                                                      │ API call
                                                      ▼
┌────────────┐         ┌────────────┐          ┌─────────────┐
│            │         │            │          │             │
│    LLM     │◀────────│  Vector    │◀─────────│  FastAPI    │
│  Response  │ context │  Search    │ query    │  Backend    │
└────────────┘         └────────────┘          └─────────────┘
```

The system creates an anonymous identity for each user through browser fingerprinting, eliminating the friction of account creation while maintaining user-specific document storage.

An interesting aspect is that the LLM decides which PDFs to search when a user asks a question, focusing on relevant documents based on the query context.

## Server-Side PDF Processing: The Implementation

Moving from client-side to server-side PDF processing involved creating a dedicated API route using LangChain's PDFLoader. Here's a simplified version:

```typescript
// app/api/parse-pdfs/route.ts
export async function POST(request: NextRequest) {
  try {
    // Get form data with PDF files and user ID
    const formData = await request.formData();
    const pdfFiles = formData.getAll('pdfFile') as File[];
    
    // Process each PDF file
    for (const pdfFile of pdfFiles) {
      // Create a temporary file for processing
      const tempFilePath = path.join(os.tmpdir(), `pdf-${Date.now()}.pdf`);
      
      // Write uploaded file to temp location
      const arrayBuffer = await pdfFile.arrayBuffer();
      await fs.writeFile(tempFilePath, new Uint8Array(arrayBuffer));
      
      // Use LangChain to load and process the PDF
      const loader = new PDFLoader(tempFilePath, { splitPages: true });
      const docs = await loader.load();
      
      // Split into chunks with smart sentence handling
      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1500,
        chunkOverlap: 200,
        separators: ["\n\n", "\n", ". ", "! ", "? "],
        keepSeparator: true
      });
      
      const splitDocs = await textSplitter.splitDocuments(docs);
      
      // Format and return chunks
      // ...
    }
  } catch (error) {
    // Error handling
  }
}
```

While this approach doesn't match specialized PDF parsing services, it's a good middle ground that's affordable to maintain as a free service.

## Vector Search Implementation: Beyond Basic Similarity

With the text chunks extracted, the next challenge was implementing effective retrieval. I chose KDB.AI as the vector database for three reasons:

1. Fast query performance at scale
2. Simple filtering for multi-user segmentation
3. A VERY generous free tier for side projects

Here's how the search works on the FastAPI backend:

```python
# Pseudocode for our search endpoint with two modes
@app.get("/search")
async def search(user_id, query, pdf_ids=None, search_mode="unified", limit=20):
    # Convert query text to vector embedding
    query_vector = embed_query(query)
    
    if search_mode == "individual" and pdf_ids:
        # Individual mode: search each PDF separately
        # 1. Distribute the search limit fairly across PDFs
        # 2. Query each PDF independently
        # 3. Combine and rank results by relevance
        results = search_pdfs_individually(user_id, query_vector, pdf_ids, limit)
    else:
        # Unified mode: search across all selected PDFs at once
        # Filter by user_id and optionally by pdf_ids
        results = search_pdfs_unified(user_id, query_vector, pdf_ids, limit)
        
    return format_results(results)
```

What makes this work well isn't just the vector similarity search – it's the additional features:

1. User-specific document filtering
2. Dual search modes for different query scenarios (unified for breadth, individual for depth)
3. Fair result distribution when searching multiple documents by performing a separate search for each document. (if searching x documents because the LLM decided x documents are relevant, it will perform x searches. If all documents are relevant, it will perform one search)

## The LLM Integration: Tool Calling for Reliable Answers

With effective retrieval in place, the final challenge was coordinating between the LLM and the search system. Traditional RAG implementations stuff all relevant context into the prompt – a technique that breaks down with complex or multi-document questions.

Instead, I implemented a tool-calling approach using Vercel's AI SDK:

```typescript
const searchPdfs = tool({
  name: "searchPdfs",
  description: "Search for information in the user's PDF documents",
  parameters: z.object({
    query: z.string().describe('The search query to find information in PDFs'),
    pdfIds: z.array(z.string()).optional()
  }),
  execute: async ({ query, pdfIds }) => await searchDocuments({ userId, query, pdfIds })
});
```

This approach enables the LLM to:
1. Decide whether it needs to search at all
2. Formulate effective search queries
3. Determine when it has sufficient information
4. Choose which document subsets are most relevant

One huge advantage of this agentic approach is that it makes multi-document interaction natural. The LLM has access to all document names, allowing it to dynamically choose which PDFs to search based on the query context. Unlike other tools that treat each PDF as a separate entity, PDF Chat can intelligently reason across multiple documents, comparing information and finding connections between different sources.

## User Experience: The Details That Matter

While the backend architecture is interesting, the user experience determines adoption. Three UX details proved particularly important:

**1. Transparent processing feedback:**

Instead of a generic progress bar, I implemented detailed stage-based feedback:

```tsx
{uploading && (
  <div className="w-full mt-4">
    <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
      <div className="h-full bg-blue-500" style={{ width: `${progress}%` }} />
    </div>
    <p className="text-xs text-center mt-2 text-gray-600">
      {getStageMessage(processingStage, currentPage, totalPages)}
    </p>
  </div>
)}
```
**2. Search result transparency:**

When the AI references information from documents, it clearly indicates which chunks were retrieved and whether it searched across all documents or focused on specific ones. This helps users understand how the system arrived at its answers.

**3. Agent UI:**

We show what the agent searched and also what documents were fed into the LLM as context. 

Users can also perform full text search on document titles, which is particularly valuable when managing dozens of documents. This search capability helps users quickly locate specific documents and verify that PDF parsing worked correctly, allowing them to identify any parsing issues that might affect the quality of responses.

I haven't really seen this UX before so I'm not completely sure what users would think of it, but it works extremely well for me.

## What's Next: The Document Intelligence Roadmap

The current version works well for text-based PDFs, but there's room for improvement in several areas:

**1. Better PDF processing**

The quality of extracted text remains the biggest challenge. Future versions will likely integrate with specialized PDF processing services or build a dedicated microservice using Python-based tools. 

**2. Multi-modal understanding**

Text extraction misses critical information in charts, diagrams, and images. The next iteration will use vision models to process visual elements. Right now we ignore charts and images completely.

**3. Advanced document structure understanding**

Current chunking is content-based without understanding document structure. Future versions will implement structure-aware processing, either by using layout detection (which Chunkr and Unstructured do) or by using more advanced chunking methods. Using LLMs to parse could also get results in markdown, making effective chunking much easier.

**4. Citing sources and letting users pick which documents to include**

The LLM currently chooses which documents to include based on the query, but we should also let users pick for themselves. A good UI for citations would improve trust and verifiability.

## Wrapping Up: Chatting with PDFs should be Easy

PDF Chat began as a weekend hack to solve a specific problem: I was tired of manually searching through technical PDFs. What emerged was a practical demonstration of how modern AI tools can transform static documents into queryable knowledge bases.

Chatting with PDFs is an extremely common application, and this was built in a relatively short amount of time. I think if people knew how easy it is to make this kind of agentic UI with the AI SDK, we would see a lot of cool applications that don't exist right now. I also need something for myself, so I'll maintain this project for now. It would be cool if people start using this as their everyday chat with pdf app, but if not I hope it serves as an example for other developers!

If you want to check it out:

1. Head to [PDF Chat](https://pdfgpt.dev) and upload some PDFs
2. Dig into the [source code](https://github.com/mrmps/pdfchatbot) if you're curious about implementation details
3. Open an issue if you encounter bugs or have feature requests
4. PRs welcome - especially if you're interested in tackling the PDF processing challenges

---

*If you're working on document processing systems or RAG applications, I'd be interested to hear about your technical challenges. What PDF parsing approaches have worked best for you? Any clever solutions for handling complex layouts or mixed content types? Drop a note in the comments or open an issue on GitHub.*

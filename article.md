# Beyond RAG: Building a Full-Stack, Agentic PDF Assistant That Actually Works 

![Header Image showing the PDF Chat interface with a conversation about a technical document]
Last week, I needed quick access to information from my AI engineering ebooks and my favorite technical books while writing a blog post. I was tired of searching through many different PDFs and thousands of pages to find specific concepts.

This frustration led me to create [PDF Chat](https://pdfgpt.dev) – a simple tool that lets you have conversations with your documents. Upload your PDFs, ask questions in plain language, and get immediate answers without any tedious searching.

> *Quick context: I'm a developer advocate for [KDB.AI](https://kdb.ai), and I recently ran a [meetup on PDF processing](https://youtu.be/ZIS6ZfxQT9w?si=AzfTXOFHnesyY-mi) with teams from Unstructured and Chunkr (both incredible teams doing amazing work in this space). This project emerged from seeing what was possible with these technologies but wanting something more accessible for everyday users.*

**Quick note:** The app is fully functional and deployed at [pdfgpt.dev](https://pdfgpt.dev). You can upload up to three PDFs at once (and as many as you want total) and start chatting immediately. Give it a try with your own documents!

In this technical deep-dive, I'll walk through the architecture, implementation challenges, and engineering decisions that went into building a document intelligence system with:

- Client-side PDF processing for privacy and performance
- Vector embeddings and semantic search for accurate retrieval
- Tool-calling patterns for reliable AI responses that actually address your query
- All without requiring user accounts or authentication

And since this is an open-source project, I'm actively welcoming contributions! If you're interested in document intelligence or RAG systems, check out the [GitHub repo](https://github.com/mrmps/pdfchatbot) and consider contributing.

## Why Build Yet Another PDF Chat App?

Before diving into the technical details, let me explain why I built this when other PDF chat tools already exist.

The existing solutions had three major limitations:

1. **Forced authentication** – Most tools require creating an account before you can even test the functionality
2. **Single document focus** – Few solutions let you chat with multiple PDFs simultaneously
3. **Limited context management** – No tools intelligently chose which documents to include in the context based on the question
4. **Python-only demos** – Most open source tools are just Python demos or notebooks rather than production-ready applications that users can actually interact with

I wanted something that would let me instantly upload multiple technical documents and ask questions that might span information across all of them – without signing up for yet another service. The agent-based approach was perfect for this, as it could intelligently decide which documents to search based on the question context.

## Architecture: From Design Constraints to System Design

When I started building PDF Chat, I had three non-negotiable constraints:

1. **Zero authentication required** – users should be able to chat with their documents immediately
2. **Zero maintenance cost** – the system should require minimal ongoing maintenance and have predictable operating costs
3. **Accurate retrieval** – the system must find relevant content even with inexact queries

To meet these constraints, I made some key architectural decisions:

1. **Client-side PDF processing** – process documents in the browser to eliminate server-side storage and processing costs
2. **Next.js frontend** with a lightweight FastAPI backend
3. **KDB.AI vector database** for efficient similarity search
4. **OpenAI API** for embeddings and LLM capabilities

What makes this approach different from most document QA systems is the flow of information:

```
┌────────────┐         ┌────────────┐          ┌─────────────┐
│            │         │            │          │             │
│    PDF     │ ───────▶│  Browser   │ ─────────▶  Text       │
│            │ upload  │  JS Engine │ extraction│  Chunks     │
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

The system creates an anonymous identity for each user through browser fingerprinting. This approach eliminates the friction of account creation while still maintaining user-specific document storage.

An interesting aspect is that the LLM agentically decides which PDFs to search when a user asks a question. It can choose to search all uploaded documents or focus on specific ones based on the query context – making interactions much more intuitive. This is particularly useful when you've uploaded multiple related but distinct documents, and the AI needs to intelligently pull information from the most relevant sources.

## Client-Side PDF Processing: The Engineering Tradeoff

Let's be upfront about this: client-side PDF processing isn't ideal for production-quality document intelligence. In a production environment, you'd typically use specialized server-side solutions like Docling, PyMuPDF4LLM, Unstructured, Chunkr, or LlamaParse, which offer superior extraction quality and layout understanding.

I actually started this project experimenting with Chunkr and LlamaParse. Chunkr produced extremely high-quality chunks but was too slow for a responsive demo, while LlamaParse offered an excellent developer experience but quickly burned through my credits during development.

So why did I choose client-side processing? It directly addressed my zero maintenance cost constraint. By processing PDFs in the browser:

1. No need for file storage infrastructure
2. No server-side processing queues to manage
3. No scaling concerns for large files or many concurrent users
4. No unpredictable costs from processing large documents

This approach let me create a clean, self-contained system that anyone can deploy with predictable costs.

Here's a simplified version of the PDF text extraction logic:

```typescript
async function extractTextFromPdf(file: File): Promise<string> {
  const reader = new FileReader();
  const pdfData = await new Promise((resolve) => {
    reader.onload = (event) => resolve(event.target?.result);
    reader.readAsArrayBuffer(file);
  });
  const pdf = await pdfjsLib.getDocument({data: new Uint8Array(pdfData)}).promise;
  return extractPagesFromPdf(pdf); // Extract text page by page
}
```

This client-side approach has clear limitations (memory constraints, layout challenges), but for a zero-maintenance demo, these tradeoffs were acceptable. The biggest problem is that the parsed pdfs are simply not good enough for me. I may eventually change this demo to use a server-side solution, but for now, I'm sticking with this.

This client-side approach means the original PDF never leaves the user's browser - only processed pdfs are sent to the backend to chunk, embed, and store, which has been remarkably effective even with PDFs exceeding 500 pages.

## Vector Search Implementation: Beyond Basic Similarity

With the text chunks extracted, the next challenge was implementing effective retrieval. I chose KDB.AI as the vector database for three reasons:

1. Exceptional query performance at scale
2. Simple filtering capabilities for multi-user segmentation
3. A generous free tier for side projects

As a developer advocate for KDB.AI, I was already familiar with its capabilities, but I wanted to build something that shows off the excellent free tier on the cloud offering, which is more than robust enough to handle thousands or tens of thousands of users. With effective quantization, we can easily scale to over 100k users each uploading several long PDFs on the free tier, but I decided against making too many optimizations for the sake of the demo.

Here's how the search process works on the FastAPI backend:

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

What makes this implementation effective isn't just the vector similarity search – it's the additional features that improve result quality:

1. User-specific document filtering (KDB.AI's fast filtering speeds up queries as user count grows)
2. Dual search modes for different query scenarios (unified for breadth, individual for depth)
3. Fair result distribution when searching multiple documents
4. Intelligent processing of search results for optimal LLM consumption

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
2. Formulate optimal search queries
3. Determine when it has sufficient information to answer
4. Choose which document subsets are most relevant

One huge advantage of this agentic approach is that it makes multi-document interaction natural. The LLM has access to all document names, allowing it to dynamically choose which PDFs to search based on the query context. Unlike other tools that treat each PDF as a separate entity, PDF Chat can intelligently reason across multiple documents, comparing information and finding connections between different sources.

## User Experience: The Details That Matter

While the backend architecture is interesting, the user experience ultimately determines adoption. Three UX details proved particularly important:

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

When the AI references information from documents, it clearly indicates which chunks were retrieved and whether a unified search (across all documents) or individual document search was performed. This transparency helps users understand how the system arrived at its answers, as shown in the image where search results display the document title and relevant text excerpt.

**3. Document context exploration:**

The interface allows users to see which documents were searched and the specific content chunks that informed the AI's response. Users can also perform full text search on document titles, which is particularly valuable when managing dozens of documents. This search capability helps users quickly locate specific documents and verify that PDF parsing worked correctly, allowing them to identify any parsing issues that might affect the quality of responses.

These UX details address core friction points in document interaction systems and have significantly increased user engagement.

## Technical Challenges and Solutions

Building PDF Chat revealed several non-obvious technical challenges:

**1. The chunking dilemma**

Finding the optimal chunk size proved surprisingly difficult. Too small, and you lose context; too large, and retrieval accuracy suffers. The solution was adaptive chunking based on content characteristics:

```typescript
function determineChunkParameters(text) {
  let chunkSize = 1500, chunkOverlap = 200;
  if (calculateAverageSentenceLength(text) > 30) {
    chunkSize = 1800; chunkOverlap = 300;  // Technical content
  }
  return { chunkSize, chunkOverlap };
}
```

**2. Browser memory management**

Large PDFs would crash the browser during processing. The solution was progressive batch processing:

```typescript
async function processLargePdf(file) {
  const pageCount = await getPdfPageCount(file);
  let allChunks = [];
  for (let start = 1; start <= pageCount; start += 50) {
    const batchChunks = await processPageBatch(file, start, start + 49);
    allChunks = [...allChunks, ...batchChunks];
  }
  return allChunks;
}
```

**3. Tool-calling loop control**

Early versions of the tool-calling implementation sometimes got stuck in search loops. The solution was implementing loop detection:

```typescript
let searchHistory = [];
// In search function:
if (searchHistory.includes(query)) {
  query = broadenQuery(query);  // Use a different strategy
}
searchHistory.push(query);
```

These solutions emerged through iterative development and real-world testing, highlighting the gap between theoretical RAG systems and production applications.

## What's Next: The Document Intelligence Roadmap

The current version of PDF Chat works well for text-based PDFs, but there's significant room for improvement in three areas:

**1. Multi-modal understanding**

Text extraction misses critical information in charts, diagrams, and images. The next iteration will use vision models to process visual elements.

**2. Advanced document structure understanding**

Current chunking is content-based without understanding document structure. Future versions will implement structure-aware processing:

```typescript
interface DocumentStructure {
  title: string;
  sections: {
    title: string; level: number; content: string;
    subsections: DocumentStructure[];
  }[];
}
```

**3. User-guided learning**

The system will implement feedback-based learning to improve search results based on user interactions.

These improvements will address the limitations of current document intelligence systems and move toward a more comprehensive understanding of document content.

## Conclusion: Documents as Accessible Knowledge

PDF Chat started as a weekend project to solve my own document frustrations, but it's evolved into something more interesting: a case study in how modern AI tools can transform information access.

What makes this approach powerful isn't just the technology – it's the removal of friction in how we interact with documents. By eliminating authentication, implementing client-side processing, and building an intuitive UI, the system makes document knowledge immediately accessible.

If you want to experience this yourself:

1. Try [PDF Chat](https://pdfgpt.dev) with your own documents (you can upload up to three PDFs at once!)
2. Explore the [source code](https://github.com/mrmps/pdfchatbot) for implementation details
3. Share your document challenges – I'm constantly refining the system based on real-world use cases
4. Consider contributing to the project – I'm actively looking for collaborators to help improve this tool

The combination of client-side processing, vector search, and LLM capabilities creates an entirely new paradigm for document interaction – one where information isn't trapped in opaque files but becomes accessible through natural conversation.

---

*If you're building document intelligence tools or working with semantic search, I'd love to hear your approach. What document processing pain points have you solved (or are still struggling with)? Let me know in the comments!*

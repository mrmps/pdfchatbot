# I Tried Every PDF Parser For My Chat App—Only One Worked

![Header Image showing PDF parsing challenges and solutions]

As a developer advocate for [KDB.AI](https://kdb.ai), I'm comfortable with vector databases, embeddings, and even semantic search. So when I decided to build a free, open-source [Chat with PDF app](https://pdfgpt.dev), I thought it would be straightforward. After all, I've explored PDF processing in the past and written about it extensively.

But I was wrong. Very wrong.

Creating a full-stack PDF chat application on a budget turned out to be surprisingly challenging. Here's everything I tried  that DOESN'T work, and the thing that finally did.

## The PDF Processing Odyssey

I tried many different approaches, starting with the most obvious:

### 1. LlamaParse: Great Quality, Expensive at Scale

I started with LlamaParse, which offers exceptional parsing quality. I skipped Unstructured because I found it too expensive from the get-go. Implementation was quick, and the results were actually really good. The problem was that the free tier ran out almost immediately, even before I finished development. At $1 per 1,000 pages, it wasn't viable for an open-source demo app that needed to stay free for users. Remember, users can upload hundreds of pages at once. And this is without a VLM, with a VLM it would be at least 6x more expensive.

### 2. Chunkr: Good Quality, Too Slow

Next, I tried [Chunkr](https://github.com/chroma-core/chunkr), which was cheaper than LlamaParse. The parsing quality was excellent, but even in its fastest mode, processing took too long for an interactive application. Users won't wait 10-20+ seconds for small PDFs to upload. I'm not sure why it was slower than LlamaParse, but it was--it's perfectly possible I didn't configure it correctly.

### 3. Client-Side Parsing with PDF.js: Fast But Low Quality

To eliminate server costs, I experimented with browser-based parsing using PDF.js. This approach was surprisingly fast with zero server processing required! However, the output quality was significantly inferior to server-side solutions.

Some specific issues included:
- Incorrect letter processing
- Poor word boundary detection
- Missing text elements
- Garbled formatting

If I figure out a way to make the quality 50% better, this might be the best solution.

### 4. Server-Side Next.js with LangChain: Limited by Serverless Constraints

I then tried server-side processing via Next.js API routes using LangChain's PDFLoader (which uses pdf-parse under the hood). The quality was better than client-side PDF.js, but I ran into serverless limitations:

Next.js API routes have a 4.5MB limit, and users uploading multiple PDFs would hit this threshold almost immediately. I should have anticipated this constraint from the beginning. This made server-side processing with Next.js impractical. Also, this loader wasn't particularly good--marginally better than PDF.js. It might use PDF.js under the hood though, I'm not sure.

## The Solution: Python Backend for PDF Processing

After exhausting these options, I finally landed on the most obvious solution: a dedicated Python backend for PDF processing. The JavaScript ecosystem simply doesn't have great PDF parsing tools compared to Python's offerings.

I implemented a FastAPI backend that uses LangChain with PyPDF under the hood, and this approach finally provided the balance of quality and performance I needed. It's still a bit slower than I'd prefer, but the parsing quality makes it worthwhile.

```
┌────────────┐       ┌────────────┐       ┌─────────────┐
│            │       │            │       │             │
│    PDF     │ ─────▶│  FastAPI   │ ─────▶│  Processed  │
│   Files    │ upload│  Backend   │ parse │   Chunks    │
└────────────┘       └────────────┘       └─────────────┘
                                                 │
                                                 ▼
┌────────────┐       ┌────────────┐       ┌─────────────┐
│            │       │            │       │             │
│    LLM     │◀──────│   Vector   │◀──────│   KDB.AI    │
│  Response  │context│   Search   │ query │   Database  │
└────────────┘       └────────────┘       └─────────────┘
```

## Lessons Learned

If I could do it all over again, I'd start with the Python backend approach from day one. The JavaScript world simply isn't equipped for high-quality PDF parsing yet. Some key takeaways:

1. **Don't fight the ecosystem**: Use the right tool for the job, even if it means introducing a new language or service to your stack.

2. **Client-side parsing has potential**: Though quality suffers, client-side parsing scales remarkably well for free apps since processing happens on users' machines. With more effort, this approach could be optimized.

3. **Consider your constraints early**: Understanding serverless limits would have saved me significant time and helped narrow my options from the start.

4. **Python reigns supreme for document processing**: The Python ecosystem has far more mature tools for document processing. PyPDF, pdf2image, Docling, Unstructured, and and other Python libraries simply outperform their JavaScript counterparts.

## What's Next?

I'm still maintaining the [PDF Chat](https://pdfgpt.dev) app with the Python backend solution, and it's working well. My ultimate goal is to create an open-source tool that anyone can deploy without API key requirements or significant costs.

I'm also exploring running my own PDF parsing microservice, likely with vanilla Gemini for parsing, but that's a topic for another article.

For those interested in the technical implementation, check out the [GitHub repo](https://github.com/mrmps/pdfchatbot) to see how I addressed these challenges.

---

*Have you faced similar challenges with PDF processing? I'd love to hear about your experiences and solutions in the comments or as GitHub issues. Let's collectively improve the state of PDF processing in web applications!*
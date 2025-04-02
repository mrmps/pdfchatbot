Title: Vector Databases Are the Wrong Abstraction… Right??

URL Source: https://medium.com/@aimichael/vector-databases-are-the-wrong-abstraction-right-c1a0b11bef3c

Published Time: 2025-01-10T00:28:04.425Z

Markdown Content:
[![Image 1: Michael Ryaboy](https://miro.medium.com/v2/resize:fill:88:88/1*iTWSk2J3q-7jAnKaxSgKnQ.jpeg)](https://medium.com/@aimichael?source=post_page---byline--c1a0b11bef3c---------------------------------------)

8 min read

Jan 10, 2025

![Image 2](https://miro.medium.com/v2/resize:fit:700/0*ReUHuu-wYc42SwFU)

The debate over whether “vector databases are the wrong abstraction” has sparked considerable discussion on [Hacker News](https://news.ycombinator.com/item?id=41985176) and [beyond](https://www.reddit.com/r/programming/comments/1geuere/vector_databases_are_the_wrong_abstraction/). The discussion emerged from a viral article advocating for the use of PostgreSQL with vector extensions over dedicated vector databases. While choosing between competing technologies is a common challenge in software development, this particular debate has captured widespread attention and deserves a closer look at the real trade-offs involved.

The oversimplified claim that “vector databases are the wrong abstraction” warrants a deeper examination. The widespread adoption of vector databases for unstructured data search by thousands of enterprises suggests there’s more to the story than a simple either-or choice.

Before we dive in, let’s clarify the scope of our discussion. We’re not comparing PostgreSQL to other vector database solutions — PostgreSQL with vector extensions is itself one of over 100 vector database options available today. Instead, we’re addressing a specific question many developers face: If you’re already using PostgreSQL, should you add vector capabilities through extensions, or would a dedicated vector database better serve your needs?

> _Disclosure: I’m a developer advocate for KDB.AI and a huge fan of Postgres. This analysis aims to provide an objective look at both approaches._

Cost Realities: Breaking Down the Memory Myth
---------------------------------------------

One common misconception is that vector databases are inherently more expensive than Postgres for vector storage. The truth is more nuanced: most massive bills come from fundamental mistakes in system design, not the choice of technology.

The primary cost driver is storing vectors in memory. This is what **pgvector** does by default, making it potentially expensive at scale. However, with proper quantization and on-disk indexing, you can efficiently search millions of chunks practically for free, whether using Postgres (via pgai’s StreamingDiskANN) or a vector database with on-disk indexes like KDB.AI’s qHNSW.

![Image 3](https://miro.medium.com/v2/resize:fit:700/0*Qc_JdtJW874-mXEO.png)

As you scale to hundreds of millions of chunks, cost/performance optimization options include:

*   Sharding on-disk indexes across nodes
*   Implementing effective quantization strategies like Matryoshka Representation Learning/Binary Quantization

Scaling to 100M+ vectors without quantization is currently a major headache and should generally be avoided for unstructured data, as the loss of precision due to quantization can largely be remedied by rerankers. At that scale, I’d try to keep your vectors well under 100 dimensions.

Performance and Scaling: The Real Bottlenecks
---------------------------------------------

The performance comparison between Postgres extensions and dedicated vector databases requires examining four crucial metrics:

Scalability
-----------

Pgvector’s latency notably degrades beyond a few million vectors, and while with clever engineering some performance improvements can be made, vector databases typically sport much better performance out of the box. While pgai’s StreamingDiskANN index offers better scaling characteristics than pgvector, dedicated vector databases are designed from the ground up for distributed architectures, handling billions of vectors through native sharding combined with specialized indexes.

However, regardless of whether you are using a Postgres extension or a vector database, at a certain scale quantization is an absolute must, especially if your index exceeds 10M vectors.

Throughput and Latency
----------------------

A critical limitation of pgvector is its use of post-filtering rather than pre-filtering, which becomes particularly problematic with complex queries. Post-filtering is filtering after getting search results, as opposed to pre-filtering which filters first and searches on a smaller subset of an index’s vectors, often massively improving latency. I won’t give any throughput numbers for Postgres extensions because the numbers are constantly changing and depend heavily on your hyperparameters, but before choosing a solution you should compare the throughput of your chosen Postgres extension to that of a vector database.

However, the bigger issue is not the difference between the throughput of a dedicated vector database and Postgres vector search, but rather that using your main database as your search solution as well makes scaling very challenging. How do you increase the throughput if usage spikes? With a vector database, you can simply replicate or beef up your instance, but with Postgres this is much more complicated. This is one of the reasons why companies moved to ElasticSearch back in the day (along with MUCH faster and more accurate keyword search).  
Separating your search from your main application has all kinds of advantages. Let’s say hypothetically there is a spike in searches during Black Friday. If you aren’t careful, this could shut down the main services of your singular database, which means users suddenly can’t login or see any data..

If you expect your searches to stay constant, this is not a problem, but real world applications need to be able to easily adapt to changes in user behavior.

Accuracy and Search Quality
---------------------------

PostgreSQL’s keyword matching and sparse search capabilities come with notable limitations. Its default trigram-based text search is adequate for basic tasks but struggles to scale with large datasets and lacks support for advanced sparse embedding techniques like SPLADE (Sparse Lexical and Expansion) or even native BM25 support, a well-established and highly effective search algorithm.

In contrast, dedicated vector databases often provide more advanced sparse search functionality, including:

*   Support for modern sparse embedding models
*   Efficient storage and retrieval of sparse vectors
*   Built-in ranking algorithms like BM25 and other proven methods
*   Native handling of high-dimensional sparse vectors

For applications where search quality is critical, PostgreSQL’s limitations may require workarounds, such as loading extensions, to approximate the native capabilities of specialized vector databases. However, these efforts can increase complexity and may still fall short of delivering the same level of performance and flexibility.

The Developer Experience: Comparing the Two
-------------------------------------------

Let’s compare the DX for performing a hybrid (keyword + vector) search between both approaches:

Using a Dedicated Vector Database (KDB.AI):
-------------------------------------------

![Image 4](https://miro.medium.com/v2/0*0q4PWY3Kdq1uG0ju)

Using Postgres with Vector Extensions:
--------------------------------------

![Image 5](https://miro.medium.com/v2/0*u_cqw7xrkoapZCX_)

The contrast is clear: vector databases typically offer more straightforward APIs and easier implementation of advanced features like:

*   Multi-stage search with different embedding models
*   Custom reranking strategies
*   Integration with local embedding models
*   Flexible sparse vector processing

The article also suggested doing chunking in SQL, which I feel like is far from the ideal pattern. By separating our chunking and embedding logic (even into microservices if need be,) we can use specialized libraries like Chonkie to do this task in a more optimized manner with less code.

So instead of doing this:

![Image 6](https://miro.medium.com/v2/0*SxOKnvECIj2-jOL0)

We instead do something like this:

![Image 7](https://miro.medium.com/v2/0*myj9OP0ntdIIk9IJ)

For me, the second option is much easier and 10x more maintainable, even if it likely forces me to deploy a separate microservice.

If you don’t want to do that, you can just as easily use Jina AI’s [segmentation](https://jina.ai/segmenter/) and [embedding](https://jina.ai/embeddings/) microservices.

Separation of Concerns: A Hidden Benefit
----------------------------------------

While data synchronization between primary and vector databases is often cited as a drawback, separation of concerns can be advantageous:

1.  Vector processing operations won’t impact core application performance
2.  Memory spikes from search queries remain isolated
3.  Easier debugging and performance optimization
4.  Independent scaling of search and transactional workloads

Most applications primarily insert rather than update data, making synchronization less problematic than the original article assumes. Event-driven architectures can further streamline this process.

Making the Right Choice: Vector Search with PostgreSQL vs. Dedicated Databases
------------------------------------------------------------------------------

**When to Consider PostgreSQL with Vector Extensions**  
PostgreSQL, particularly with extensions like `pgvector`, can be an excellent choice in specific scenarios:

*   **Small-Scale Applications**: Ideal for projects with fewer than 3–5 million vectors and modest query volumes, where search complexity is minimal.
*   **ACID Compliance**: Crucial for applications requiring strict transactional guarantees.
*   **PostgreSQL-Centric Workflows**: Perfect for teams deeply experienced in PostgreSQL, looking to manage vectors alongside traditional data within a unified environment.
*   **Low Growth Expectations**: Best suited for systems unlikely to experience significant growth in dataset size or search demands.

**When to Opt for a Dedicated Vector Database**  
Dedicated vector databases shine in scenarios requiring performance and scalability:

*   **Large-Scale Applications**: When handling tens or hundreds of millions of vectors, or when horizontal scaling is necessary.
*   **Real-Time Search**: Essential for applications with stringent latency and throughput requirements.
*   **Hybrid Search**: Combining keyword and vector search with advanced reranking capabilities.
*   **Complex Pipelines**: Supporting multi-stage workflows with custom embeddings, sparse-dense fusion, hybrid ranking strategies, Learning to Rank, and other advanced techniques.
*   **Iteration and Experimentation**: Dedicated solutions allow teams to iterate quickly on embedding strategies and search configurations, with less overhead.

The Debate: Wrong Abstraction or Right Tool?
--------------------------------------------

The “wrong abstraction” debate misses the real point: this isn’t about whether vector databases or PostgreSQL extensions are inherently better but about finding the right tool for your specific needs. Each approach has strengths and weaknesses, and the choice depends on your scale, requirements, and team expertise.

PostgreSQL extensions like `pgvector` and `pgai` provide a seamless path for teams already committed to PostgreSQL. However, these solutions often face performance challenges at scale, require additional engineering to approximate the capabilities of dedicated vector search engines, and lack the advanced hybrid search features of purpose-built solutions.

On the other hand, dedicated vector databases offer superior scalability, performance, and hybrid search capabilities. They simplify complex search pipelines and enable faster iteration, but they also require managing a separate system, which might increase complexity for some teams.

Key Takeaways
-------------

**Choose PostgreSQL with Vector Extensions When:**

*   Your use case is small-scale or PostgreSQL-centric.
*   You prioritize ACID compliance and prefer minimal infrastructure changes.
*   Your team has deep PostgreSQL expertise and modest search requirements.

**Choose Dedicated Vector Databases When:**

*   Your application requires large-scale, real-time search.
*   You need advanced search features like hybrid ranking or multi-stage pipelines.
*   Speed, scalability, and iteration matter more than integrating into existing infrastructure.

Ultimately, the best choice depends on your unique requirements. If one option takes significantly less time to implement while meeting your needs, it’s likely the better choice. For those exploring vector databases, try a **free cloud instance of KDB.AI**, which offers unlimited inserts/queries, 4GB of memory, and 30GB of storage, blending simplicity with cutting-edge capabilities.

Title: Multistage RAG with LlamaIndex and Cohere Reranking: A Step-by-Step Guide

URL Source: https://medium.com/kx-systems/multistage-rag-with-llamaindex-and-cohere-reranking-a-step-by-step-guide-51fc7e8d6ef2

Published Time: 2024-04-19T19:04:20.994Z

Markdown Content:
Multistage RAG with LlamaIndex and Cohere Reranking: A Step-by-Step Guide | by Michael Ryaboy | KX Systems | Medium
===============
 

[Open in app](https://rsci.app.link/?%24canonical_url=https%3A%2F%2Fmedium.com%2Fp%2F51fc7e8d6ef2&%7Efeature=LoOpenInAppButton&%7Echannel=ShowPostUnderCollection&source=post_page---top_nav_layout_nav-----------------------------------------)

Sign up

[Sign in](https://medium.com/m/signin?operation=login&redirect=https%3A%2F%2Fmedium.com%2Fkx-systems%2Fmultistage-rag-with-llamaindex-and-cohere-reranking-a-step-by-step-guide-51fc7e8d6ef2&source=post_page---top_nav_layout_nav-----------------------global_nav------------------)

[](https://medium.com/?source=post_page---top_nav_layout_nav-----------------------------------------)

[Write](https://medium.com/m/signin?operation=register&redirect=https%3A%2F%2Fmedium.com%2Fnew-story&source=---top_nav_layout_nav-----------------------new_post_topnav------------------)

[](https://medium.com/search?source=post_page---top_nav_layout_nav-----------------------------------------)

Sign up

[Sign in](https://medium.com/m/signin?operation=login&redirect=https%3A%2F%2Fmedium.com%2Fkx-systems%2Fmultistage-rag-with-llamaindex-and-cohere-reranking-a-step-by-step-guide-51fc7e8d6ef2&source=post_page---top_nav_layout_nav-----------------------global_nav------------------)

![Image 8](https://miro.medium.com/v2/resize:fill:32:32/1*dmbNkD5D-u45r44go_cf0g.png)

[Home](https://medium.com/?source=post_page--------------------------------------------)

Following

Library

[Your lists](https://medium.com/me/lists?source=post_page--------------------------------------------)[Saved lists](https://medium.com/me/lists/saved?source=post_page--------------------------------------------)[Highlights](https://medium.com/me/list/highlights?source=post_page--------------------------------------------)[Reading history](https://medium.com/me/lists/reading-history?source=post_page--------------------------------------------)

[Stories](https://medium.com/me/stories/drafts?source=post_page--------------------------------------------)[Stats](https://medium.com/me/stats?source=post_page--------------------------------------------)

[KX Systems --------------](https://medium.com/kx-systems?source=post_page---publication_nav-b93e4bd87acf-51fc7e8d6ef2---------------------------------------)

[Home](https://medium.com/kx-systems?source=post_page---publication_nav-b93e4bd87acf-51fc7e8d6ef2---------------------------------------)[About](https://medium.com/kx-systems/about?source=post_page---publication_nav-b93e4bd87acf-51fc7e8d6ef2---------------------------------------)

·[Follow publication](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fsubscribe%2Fcollection%2Fkx-systems&operation=register&redirect=https%3A%2F%2Fmedium.com%2Fkx-systems%2Fmultistage-rag-with-llamaindex-and-cohere-reranking-a-step-by-step-guide-51fc7e8d6ef2&collection=KX+Systems&collectionId=b93e4bd87acf&source=post_page---publication_nav-b93e4bd87acf-51fc7e8d6ef2---------------------publication_nav------------------)

[![Image 9: KX Systems](https://miro.medium.com/v2/resize:fill:38:38/1*MBvMafY4QS8NeMgoAiUg6Q.png)](https://medium.com/kx-systems?source=post_page---post_publication_sidebar-b93e4bd87acf-51fc7e8d6ef2---------------------------------------)

Vector native data processing

[Follow publication](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fsubscribe%2Fcollection%2Fkx-systems&operation=register&redirect=https%3A%2F%2Fmedium.com%2Fkx-systems%2Fmultistage-rag-with-llamaindex-and-cohere-reranking-a-step-by-step-guide-51fc7e8d6ef2&collection=KX+Systems&collectionId=b93e4bd87acf&source=post_page---post_publication_sidebar-b93e4bd87acf-51fc7e8d6ef2---------------------post_publication_sidebar------------------)

Multistage RAG with LlamaIndex and Cohere Reranking: A Step-by-Step Guide
=========================================================================

[![Image 10: Michael Ryaboy](https://miro.medium.com/v2/resize:fill:44:44/1*iTWSk2J3q-7jAnKaxSgKnQ.jpeg)](https://medium.com/@aimichael?source=post_page---byline--51fc7e8d6ef2---------------------------------------)

[![Image 11: KX Systems](https://miro.medium.com/v2/resize:fill:24:24/1*MBvMafY4QS8NeMgoAiUg6Q.png)](https://medium.com/kx-systems?source=post_page---byline--51fc7e8d6ef2---------------------------------------)

[Michael Ryaboy](https://medium.com/@aimichael?source=post_page---byline--51fc7e8d6ef2---------------------------------------)

·[Follow](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fsubscribe%2Fuser%2F14223ef349bb&operation=register&redirect=https%3A%2F%2Fmedium.com%2Fkx-systems%2Fmultistage-rag-with-llamaindex-and-cohere-reranking-a-step-by-step-guide-51fc7e8d6ef2&user=Michael+Ryaboy&userId=14223ef349bb&source=post_page-14223ef349bb--byline--51fc7e8d6ef2---------------------post_header------------------)

Published in

[KX Systems](https://medium.com/kx-systems?source=post_page---byline--51fc7e8d6ef2---------------------------------------)

·

6 min read

·

Apr 19, 2024

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fvote%2Fkx-systems%2F51fc7e8d6ef2&operation=register&redirect=https%3A%2F%2Fmedium.com%2Fkx-systems%2Fmultistage-rag-with-llamaindex-and-cohere-reranking-a-step-by-step-guide-51fc7e8d6ef2&user=Michael+Ryaboy&userId=14223ef349bb&source=---header_actions--51fc7e8d6ef2---------------------clap_footer------------------)

108

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fbookmark%2Fp%2F51fc7e8d6ef2&operation=register&redirect=https%3A%2F%2Fmedium.com%2Fkx-systems%2Fmultistage-rag-with-llamaindex-and-cohere-reranking-a-step-by-step-guide-51fc7e8d6ef2&source=---header_actions--51fc7e8d6ef2---------------------bookmark_footer------------------)

[Listen](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2Fplans%3Fdimension%3Dpost_audio_button%26postId%3D51fc7e8d6ef2&operation=register&redirect=https%3A%2F%2Fmedium.com%2Fkx-systems%2Fmultistage-rag-with-llamaindex-and-cohere-reranking-a-step-by-step-guide-51fc7e8d6ef2&source=---header_actions--51fc7e8d6ef2---------------------post_audio_button------------------)

Share

![Image 12](https://miro.medium.com/v2/resize:fit:700/1*dFqq2ZGjlQvKCCQehnFhaQ.png)

[Retrieval Augmented Generation (RAG)](https://kdb.ai/learning-hub/articles/understanding-rag-approaches/) is a powerful technique that allows language models to draw upon relevant information from external knowledge bases when generating responses. However, the effectiveness of RAG heavily relies on the quality of the retrieved results. In this article, we’ll explore an advanced multistage RAG architecture using LlamaIndex for indexing and retrieval and Cohere for semantic reranking. We’ll provide a detailed, step-by-step guide to implementing this architecture, complete with code snippets from the [accompanying Colab notebook](https://colab.research.google.com/drive/1r-4g-r9JphE6qEKX4Vap-DupZ3AWH2nW?usp=sharing).

To provide the best possible context for our LLM, we need to surface the most relevant snippets possible. When our document store is large, it’s very difficult to retrieve very relevant documents in just one step. To remedy this, we will retrieve in two stages: first by searching individual sentences to find any docs relevant to our query vector, and then reranking the wider context in which the sentence was found. Luckily, the SentenceWindowParser from LlamaIndex allows us to not only separate our document into sentences, but also add some metadata — in this case three sentences on each side of our target sentence. This will come in handy in our reranking step!

Here’s a full image of our pipeline. Don’t be intimidated! We can achieve this with very little code:

![Image 13: Multistage RAG Pipeline](https://miro.medium.com/v2/resize:fit:700/0*RcNLmPZr7S374epy)

Step 1: Set Up the Environment
==============================

First, let’s install the necessary libraries:

!pip install cohere spacy llama-index kdbai\_client llama-index\-vector-stores-kdbai llama-index\-embeddings-fastembed

Then, import the required modules:

from llama\_index.core.node\_parser import SentenceWindowNodeParser  
from llama\_index.core import Document, VectorStoreIndex  
from llama\_index.embeddings.fastembed import FastEmbedEmbedding  
from llama\_index.vector\_stores.kdbai import KDBAIVectorStore  
from llama\_index.core import SimpleDirectoryReader  
from llama\_index.core.llama\_dataset import LabelledRagDataset  
import kdbai\_client as kdbai  
import cohere

Step 2: Data Preparation
========================

We’ll be using the Paul Graham Essay Dataset as our knowledge corpus. Download the dataset:

!llamaindex-cli download-llamadataset PaulGrahamEssayDataset --download-dir ./data

Step 3: [KDB.AI](http://kdb.ai/) Setup
======================================

First, sign up for [KDB.AI](http://kdb.ai/). We’re using KDB.AI here due to its fast insertion speeds and support for metadata filtering. However, if you have only a few thousand documents, you might not need multistage retrieval or even a vector database — Cohere reranking on its own can be a perfectly reasonable solution.

Grab your endpoint and API key from the KDB.AI cloud console:

![Image 14](https://miro.medium.com/v2/resize:fit:700/1*MFltsi_pGRQuepBKAEpOGw.png)

KDB.AI Cloud Console

Create a [KDB.AI](http://kdb.ai/) session and table to store the embeddings:

session = kdbai.Session(endpoint=KDBAI\_ENDPOINT, api\_key=KDBAI\_API\_KEY)

\# Schema definition  
schema = \[  
    {"name": "document\_id", "type": "bytes"},  
    {"name": "text", "type": "bytes"},  
    {"name": "embedding", "type": "float64s"}  \# Updated to float64s  
\]  
  
\# Index definition for the embedding  
indexes = \[  
    {  
        "name": "embedding\_index",  \# Name of the index  
        "type": "flat",  \# Index type (flat)  
        "params": {"dims": 384, "metric": "L2"},  \# Dimensions and metric  
        "column": "embedding"  \# The column the index refers to  
    }  
\]  
  
\# Reference the 'default' database  
database = session.database("default")  
  
\# ensure no table called "company\_data" exists  
try:  
    for t in database.tables:  
            if t.name == KDBAI\_TABLE\_NAME:  
                t.drop()   
    time.sleep(5)  
except kdbai.KDBAIException:  
    pass  
  
\# Create the table with the specified schema and index definition  
table = database.create\_table(KDBAI\_TABLE\_NAME, schema=schema, indexes=indexes)

Step 4: Parsing Documents into Sentences
========================================

The core idea behind our multistage RAG approach is to index and retrieve at the granularity of individual sentences, while providing the language model with a broader sentence window as context for generation.

We use LlamaIndex’s `SentenceWindowNodeParser` to parse documents into individual sentence nodes, while preserving metadata about the surrounding sentence window.

node\_parser = SentenceWindowNodeParser.from\_defaults(  
    window\_size=3,  
    window\_metadata\_key="window",  
    original\_text\_metadata\_key="original\_text",  
)

nodes = node\_parser.get\_nodes\_from\_documents(docs)  
parsed\_nodes = \[node.to\_dict() for node in nodes\]

Here, we use a `window_size` of 3, meaning for each sentence, we keep the 3 sentences before and 3 sentences after as its "window". This window is stored in the node metadata.

Here is an example pipeline for Sentence Window Retrieval without reranking:

![Image 15](https://miro.medium.com/v2/resize:fit:700/1*bfc0qHfV_gmM2bmnY1qn6w.png)

It’s worth noting that sentence window parsing is just one type of small-to-big retrieval. Another approach is to use smaller chunks referring to bigger parent chunks. **This strategy isn’t included in this notebook**, but here is a diagram of chunking based small-to-big retrieval:

![Image 16](https://miro.medium.com/v2/resize:fit:700/1*upDgd0cAH0riU1G78ARDfg.png)

Chunking Based Small-to-Big Retrieval Pipeline

Step 5: Indexing and Storing Embeddings
=======================================

Next, we generate embeddings for each sentence node using FastEmbed and store them in our [KDB.AI](http://kdb.ai/) table. FastEmbed is a fast and lightweight library for generating embeddings, and supports many popular text models. The default embeddings come from the `Flag Embedding` model which has 384 dimensions, but many popular embedding models are supported.

parent\_ids = \[\]  
sentences = \[\]  
embeddings = \[\]  
  
embedding\_model = TextEmbedding()  
  
for sentence, parent\_id in sentence\_parentId:  
    parent\_ids.append(parent\_id)  
    sentences.append(sentence)  
  
embeddings = list(embedding\_model.embed(sentences))  
  
\# Convert document\_id and text to bytes  
parent\_ids\_bytes = \[str(parent\_id).encode('utf-8') for parent\_id in parent\_ids\]  
sentences\_bytes = \[str(sentence).encode('utf-8') for sentence in sentences\]  
  
\# Create a DataFrame  
records\_to\_insert\_with\_embeddings = pd.DataFrame({  
    "document\_id": parent\_ids\_bytes,  \# Convert to bytes  
    "text": sentences\_bytes,          \# Convert to bytes  
    "embedding": embeddings             
})  
  
\# Insert the DataFrame into the table  
table = database.table(KDBAI\_TABLE\_NAME)  
table.insert(records\_to\_insert\_with\_embeddings)

Step 6: Querying and Reranking
==============================

With our knowledge indexed, we can now query it with natural language questions. The retrieval process has two stages:

1.  Initial sentence retrieval
2.  Reranking based on sentence windows

For the initial retrieval, we generate an embedding for the query and use it to retrieve the 1500 most similar sentences from the vector database. 1500 is arbitrary — but it’s good to go big because you don’t want to miss any sentences which might have a relevant window.

\# Embed the query and convert the embedding to a list  
query = "How do you decide what to work on?"  
  
query\_embedding = list(embedding\_model.embed(\[query\]))\[0\].tolist()  \# Convert generator to list  
  
\# Perform the search  
search\_results = database.table(KDBAI\_TABLE\_NAME).search(  
    vectors={"embedding\_index": \[query\_embedding\]},  
    n=1500  \# Retrieve 1500 preliminary results  
)  
  
\# Print the search results  
print(search\_results)

Performing this first-pass retrieval at the sentence level ensures we don’t miss any potentially relevant windows.

The second stage is where the magic happens. We take the unique sentence windows from the initial retrieval results and rerank them using Cohere’s powerful reranking model. By considering the entire window, the reranker can better assess the relevance to the query in context.

unique\_parent\_ids = search\_results\_df\['document\_id'\].unique()  
  
texts\_to\_rerank = \[parentid\_parentTexts\[id\] for id in unique\_parent\_ids  
                   if id in parentid\_parentTexts\]  
reranked = co.rerank(  
    model='rerank-english-v3.0',  
    query=query,  
    documents=texts\_to\_rerank,  
    top\_n=len(texts\_to\_rerank)  
)

After reranking, the top sentence windows provide high-quality, contextually relevant information to be used for generating the final response.

This multistage approach offers several key advantages:

1.  Indexing and initial retrieval on the sentence-level is fast and memory efficient.
2.  The initial sentence retrieval stage is highly scalable and can support very large knowledge bases.
3.  Reranking based on sentence windows allows incorporating broader context without sacrificing the specificity of the initial retrieval.
4.  Using an external reranking model allows leveraging a larger, more powerful model for assessing relevance, while keeping the main generative model lightweight.
5.  Providing sentence windows as context to the generative model strikes a balance between specificity and sufficient context.

Multistage RAG with LlamaIndex and Cohere showcases the power of thoughtful retrieval architectures for knowledge-intensive language tasks. By indexing at a granular sentence level, performing efficient initial retrieval, and reranking with a powerful model, we can provide high-quality, contextually relevant information to generative language models — enabling them to engage in grounded, information-rich conversations without sacrificing specificity or efficiency.

To learn more about optimizing RAG for production and making the most of vector databases, check out the [KDB.AI Learning Hub](https://kdb.ai/learning-hub), chocked full of useful resources.

Connect with me on [LinkedIn](https://www.linkedin.com/in/michael-ryaboy-software-engineer/) for more AI Engineering tips.

I also encourage you to experiment with this approach on your own datasets and knowledge domains. The full code is available in the accompanying Colab notebook below.

[https://colab.research.google.com/drive/1r-4g-r9JphE6qEKX4Vap-DupZ3AWH2nW?usp=sharin](https://colab.research.google.com/drive/1r-4g-r9JphE6qEKX4Vap-DupZ3AWH2nW?usp=sharing)g

![Image 17](https://miro.medium.com/v2/da:true/resize:fit:0/5c50caa54067fd622d2f0fac18392213bf92f6e2fae89b691e62bceb40885e74)

Sign up to discover human stories that deepen your understanding of the world.
------------------------------------------------------------------------------

Free
----

Distraction-free reading. No ads.

Organize your knowledge with lists and highlights.

Tell your story. Find your audience.

Sign up for free

Membership
----------

Read member-only stories

Support writers you read most

Earn money for your writing

Listen to audio narrations

Read offline with the Medium app

Try for $5/month

[Llamaindex](https://medium.com/tag/llamaindex?source=post_page-----51fc7e8d6ef2---------------------------------------)

[AI](https://medium.com/tag/ai?source=post_page-----51fc7e8d6ef2---------------------------------------)

[Retrieval Augmented](https://medium.com/tag/retrieval-augmented?source=post_page-----51fc7e8d6ef2---------------------------------------)

[Generative Ai Solution](https://medium.com/tag/generative-ai-solution?source=post_page-----51fc7e8d6ef2---------------------------------------)

[Chatbot Design](https://medium.com/tag/chatbot-design?source=post_page-----51fc7e8d6ef2---------------------------------------)

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fvote%2Fkx-systems%2F51fc7e8d6ef2&operation=register&redirect=https%3A%2F%2Fmedium.com%2Fkx-systems%2Fmultistage-rag-with-llamaindex-and-cohere-reranking-a-step-by-step-guide-51fc7e8d6ef2&user=Michael+Ryaboy&userId=14223ef349bb&source=---footer_actions--51fc7e8d6ef2---------------------clap_footer------------------)

108

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fvote%2Fkx-systems%2F51fc7e8d6ef2&operation=register&redirect=https%3A%2F%2Fmedium.com%2Fkx-systems%2Fmultistage-rag-with-llamaindex-and-cohere-reranking-a-step-by-step-guide-51fc7e8d6ef2&user=Michael+Ryaboy&userId=14223ef349bb&source=---footer_actions--51fc7e8d6ef2---------------------clap_footer------------------)

108

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fbookmark%2Fp%2F51fc7e8d6ef2&operation=register&redirect=https%3A%2F%2Fmedium.com%2Fkx-systems%2Fmultistage-rag-with-llamaindex-and-cohere-reranking-a-step-by-step-guide-51fc7e8d6ef2&source=---footer_actions--51fc7e8d6ef2---------------------bookmark_footer------------------)

[![Image 18: KX Systems](https://miro.medium.com/v2/resize:fill:48:48/1*MBvMafY4QS8NeMgoAiUg6Q.png)](https://medium.com/kx-systems?source=post_page---post_publication_info--51fc7e8d6ef2---------------------------------------)

[![Image 19: KX Systems](https://miro.medium.com/v2/resize:fill:64:64/1*MBvMafY4QS8NeMgoAiUg6Q.png)](https://medium.com/kx-systems?source=post_page---post_publication_info--51fc7e8d6ef2---------------------------------------)

Follow

[Published in KX Systems -----------------------](https://medium.com/kx-systems?source=post_page---post_publication_info--51fc7e8d6ef2---------------------------------------)

[114 Followers](https://medium.com/kx-systems/followers?source=post_page---post_publication_info--51fc7e8d6ef2---------------------------------------)

·[Last published Jan 23, 2025](https://medium.com/kx-systems/rag-gone-rogue-a-sneaky-context-pitfall-df36cc9c3882?source=post_page---post_publication_info--51fc7e8d6ef2---------------------------------------)

Vector native data processing

Follow

[![Image 20: Michael Ryaboy](https://miro.medium.com/v2/resize:fill:48:48/1*iTWSk2J3q-7jAnKaxSgKnQ.jpeg)](https://medium.com/@aimichael?source=post_page---post_author_info--51fc7e8d6ef2---------------------------------------)

[![Image 21: Michael Ryaboy](https://miro.medium.com/v2/resize:fill:64:64/1*iTWSk2J3q-7jAnKaxSgKnQ.jpeg)](https://medium.com/@aimichael?source=post_page---post_author_info--51fc7e8d6ef2---------------------------------------)

Follow

[Written by Michael Ryaboy -------------------------](https://medium.com/@aimichael?source=post_page---post_author_info--51fc7e8d6ef2---------------------------------------)

[1K Followers](https://medium.com/@aimichael/followers?source=post_page---post_author_info--51fc7e8d6ef2---------------------------------------)

·[11 Following](https://medium.com/@aimichael/following?source=post_page---post_author_info--51fc7e8d6ef2---------------------------------------)

Developer Advocate at [KDB.AI](http://kdb.ai/)

Follow

No responses yet
----------------

[](https://policy.medium.com/medium-rules-30e5502c4eb4?source=post_page---post_responses--51fc7e8d6ef2---------------------------------------)

![Image 22](https://miro.medium.com/v2/resize:fill:32:32/1*dmbNkD5D-u45r44go_cf0g.png)

Write a response

[What are your thoughts?](https://medium.com/m/signin?operation=register&redirect=https%3A%2F%2Fmedium.com%2Fkx-systems%2Fmultistage-rag-with-llamaindex-and-cohere-reranking-a-step-by-step-guide-51fc7e8d6ef2&source=---post_responses--51fc7e8d6ef2---------------------respond_sidebar------------------)

Cancel

Respond

Also publish to my profile

More from Michael Ryaboy and KX Systems
---------------------------------------

![Image 23: 10x Cheaper PDF Processing: Ingesting and RAG on Millions of Documents with Gemini 2.0 Flash](https://miro.medium.com/v2/resize:fit:679/1*CEfGhNp748icy2EqFvG8WA.png)

[![Image 24: AI Advances](https://miro.medium.com/v2/resize:fill:20:20/1*R8zEd59FDf0l8Re94ImV0Q.png)](https://medium.com/ai-advances?source=post_page---author_recirc--51fc7e8d6ef2----0---------------------f667e0dd_5a13_4f27_aa0e_26aa09debca2--------------)

In

[AI Advances](https://medium.com/ai-advances?source=post_page---author_recirc--51fc7e8d6ef2----0---------------------f667e0dd_5a13_4f27_aa0e_26aa09debca2--------------)

by

[Michael Ryaboy](https://medium.com/@aimichael?source=post_page---author_recirc--51fc7e8d6ef2----0---------------------f667e0dd_5a13_4f27_aa0e_26aa09debca2--------------)

[10x Cheaper PDF Processing: Ingesting and RAG on Millions of Documents with Gemini 2.0 Flash -------------------------------------------------------------------------------------------- ### Picture this: you start by converting every PDF page into images, then send them off for OCR, only to wrestle the raw text into workable…](https://medium.com/ai-advances/10x-cheaper-pdf-processing-ingesting-and-rag-on-millions-of-documents-with-gemini-2-0-flash-8a93dbbb3b54?source=post_page---author_recirc--51fc7e8d6ef2----0---------------------f667e0dd_5a13_4f27_aa0e_26aa09debca2--------------)

Feb 13

[1K 17](https://medium.com/ai-advances/10x-cheaper-pdf-processing-ingesting-and-rag-on-millions-of-documents-with-gemini-2-0-flash-8a93dbbb3b54?source=post_page---author_recirc--51fc7e8d6ef2----0---------------------f667e0dd_5a13_4f27_aa0e_26aa09debca2--------------)

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fbookmark%2Fp%2F8a93dbbb3b54&operation=register&redirect=https%3A%2F%2Fai.gopubby.com%2F10x-cheaper-pdf-processing-ingesting-and-rag-on-millions-of-documents-with-gemini-2-0-flash-8a93dbbb3b54&source=---author_recirc--51fc7e8d6ef2----0-----------------bookmark_preview----f667e0dd_5a13_4f27_aa0e_26aa09debca2--------------)

![Image 25: Guide to Multimodal RAG for Images and Text](https://miro.medium.com/v2/resize:fit:679/1*NUoYFDWjF2LSwPhW11Mjhg.png)

[![Image 26: KX Systems](https://miro.medium.com/v2/resize:fill:20:20/1*MBvMafY4QS8NeMgoAiUg6Q.png)](https://medium.com/kx-systems?source=post_page---author_recirc--51fc7e8d6ef2----1---------------------f667e0dd_5a13_4f27_aa0e_26aa09debca2--------------)

In

[KX Systems](https://medium.com/kx-systems?source=post_page---author_recirc--51fc7e8d6ef2----1---------------------f667e0dd_5a13_4f27_aa0e_26aa09debca2--------------)

by

[Ryan Siegler](https://medium.com/@ryan.siegler8?source=post_page---author_recirc--51fc7e8d6ef2----1---------------------f667e0dd_5a13_4f27_aa0e_26aa09debca2--------------)

[Guide to Multimodal RAG for Images and Text ------------------------------------------- ### Multimodal AI stands at the forefront of the next wave of AI advancements. This sample shows methods to execute multimodal RAG pipelines.](https://medium.com/kx-systems/guide-to-multimodal-rag-for-images-and-text-10dab36e3117?source=post_page---author_recirc--51fc7e8d6ef2----1---------------------f667e0dd_5a13_4f27_aa0e_26aa09debca2--------------)

Feb 12, 2024

[535 8](https://medium.com/kx-systems/guide-to-multimodal-rag-for-images-and-text-10dab36e3117?source=post_page---author_recirc--51fc7e8d6ef2----1---------------------f667e0dd_5a13_4f27_aa0e_26aa09debca2--------------)

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fbookmark%2Fp%2F10dab36e3117&operation=register&redirect=https%3A%2F%2Fmedium.com%2Fkx-systems%2Fguide-to-multimodal-rag-for-images-and-text-10dab36e3117&source=---author_recirc--51fc7e8d6ef2----1-----------------bookmark_preview----f667e0dd_5a13_4f27_aa0e_26aa09debca2--------------)

![Image 27: RAG + LlamaParse: Advanced PDF Parsing for Retrieval](https://miro.medium.com/v2/resize:fit:679/1*5V2DFFpxDN8CP-E_AOQYMg.png)

[![Image 28: KX Systems](https://miro.medium.com/v2/resize:fill:20:20/1*MBvMafY4QS8NeMgoAiUg6Q.png)](https://medium.com/kx-systems?source=post_page---author_recirc--51fc7e8d6ef2----2---------------------f667e0dd_5a13_4f27_aa0e_26aa09debca2--------------)

In

[KX Systems](https://medium.com/kx-systems?source=post_page---author_recirc--51fc7e8d6ef2----2---------------------f667e0dd_5a13_4f27_aa0e_26aa09debca2--------------)

by

[Ryan Siegler](https://medium.com/@ryan.siegler8?source=post_page---author_recirc--51fc7e8d6ef2----2---------------------f667e0dd_5a13_4f27_aa0e_26aa09debca2--------------)

[RAG + LlamaParse: Advanced PDF Parsing for Retrieval ---------------------------------------------------- ### The core focus of Retrieval Augmented Generation (RAG) is connecting your data of interest to a Large Language Model (LLM). This process…](https://medium.com/kx-systems/rag-llamaparse-advanced-pdf-parsing-for-retrieval-c393ab29891b?source=post_page---author_recirc--51fc7e8d6ef2----2---------------------f667e0dd_5a13_4f27_aa0e_26aa09debca2--------------)

May 3, 2024

[208 4](https://medium.com/kx-systems/rag-llamaparse-advanced-pdf-parsing-for-retrieval-c393ab29891b?source=post_page---author_recirc--51fc7e8d6ef2----2---------------------f667e0dd_5a13_4f27_aa0e_26aa09debca2--------------)

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fbookmark%2Fp%2Fc393ab29891b&operation=register&redirect=https%3A%2F%2Fmedium.com%2Fkx-systems%2Frag-llamaparse-advanced-pdf-parsing-for-retrieval-c393ab29891b&source=---author_recirc--51fc7e8d6ef2----2-----------------bookmark_preview----f667e0dd_5a13_4f27_aa0e_26aa09debca2--------------)

![Image 29: Anthropic-Style Citations with Any LLM](https://miro.medium.com/v2/resize:fit:679/1*_Dx-QeNQes_VF54vezxtiA.png)

[![Image 30: Data Science Collective](https://miro.medium.com/v2/resize:fill:20:20/1*0nV0Q-FBHj94Kggq00pG2Q.jpeg)](https://medium.com/data-science-collective?source=post_page---author_recirc--51fc7e8d6ef2----3---------------------f667e0dd_5a13_4f27_aa0e_26aa09debca2--------------)

In

[Data Science Collective](https://medium.com/data-science-collective?source=post_page---author_recirc--51fc7e8d6ef2----3---------------------f667e0dd_5a13_4f27_aa0e_26aa09debca2--------------)

by

[Michael Ryaboy](https://medium.com/@aimichael?source=post_page---author_recirc--51fc7e8d6ef2----3---------------------f667e0dd_5a13_4f27_aa0e_26aa09debca2--------------)

[Anthropic-Style Citations with Any LLM -------------------------------------- ### Anthropic’s new Citations feature for Claude recently went viral because it lets you attach references to your AI’s answers automatically —…](https://medium.com/data-science-collective/anthropic-style-citations-with-any-llm-2c061671ddd5?source=post_page---author_recirc--51fc7e8d6ef2----3---------------------f667e0dd_5a13_4f27_aa0e_26aa09debca2--------------)

Mar 14

[88 3](https://medium.com/data-science-collective/anthropic-style-citations-with-any-llm-2c061671ddd5?source=post_page---author_recirc--51fc7e8d6ef2----3---------------------f667e0dd_5a13_4f27_aa0e_26aa09debca2--------------)

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fbookmark%2Fp%2F2c061671ddd5&operation=register&redirect=https%3A%2F%2Fmedium.com%2Fdata-science-collective%2Fanthropic-style-citations-with-any-llm-2c061671ddd5&source=---author_recirc--51fc7e8d6ef2----3-----------------bookmark_preview----f667e0dd_5a13_4f27_aa0e_26aa09debca2--------------)

[See all from Michael Ryaboy](https://medium.com/@aimichael?source=post_page---author_recirc--51fc7e8d6ef2---------------------------------------)

[See all from KX Systems](https://medium.com/kx-systems?source=post_page---author_recirc--51fc7e8d6ef2---------------------------------------)

Recommended from Medium
-----------------------

![Image 31: Talk With Your Document With LlamaIndex RAG (the most simple example)](https://miro.medium.com/v2/resize:fit:679/1*QEhHhCL51-VAc1BL3iprSA.jpeg)

[![Image 32: Hepiska Franatagola](https://miro.medium.com/v2/resize:fill:20:20/1*eZOgEXgA31Gk-zSIXtbXEw.jpeg)](https://medium.com/@hepiska?source=post_page---read_next_recirc--51fc7e8d6ef2----0---------------------8552788f_4058_45f1_895a_86fed3407e2c--------------)

[Hepiska Franatagola](https://medium.com/@hepiska?source=post_page---read_next_recirc--51fc7e8d6ef2----0---------------------8552788f_4058_45f1_895a_86fed3407e2c--------------)

[Talk With Your Document With LlamaIndex RAG (the most simple example) --------------------------------------------------------------------- ### Background](https://medium.com/@hepiska/talk-with-your-document-with-rag-the-most-simple-example-2b1dfb6e5d21?source=post_page---read_next_recirc--51fc7e8d6ef2----0---------------------8552788f_4058_45f1_895a_86fed3407e2c--------------)

Dec 11, 2024

[11](https://medium.com/@hepiska/talk-with-your-document-with-rag-the-most-simple-example-2b1dfb6e5d21?source=post_page---read_next_recirc--51fc7e8d6ef2----0---------------------8552788f_4058_45f1_895a_86fed3407e2c--------------)

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fbookmark%2Fp%2F2b1dfb6e5d21&operation=register&redirect=https%3A%2F%2Fmedium.com%2F%40hepiska%2Ftalk-with-your-document-with-rag-the-most-simple-example-2b1dfb6e5d21&source=---read_next_recirc--51fc7e8d6ef2----0-----------------bookmark_preview----8552788f_4058_45f1_895a_86fed3407e2c--------------)

![Image 33: Building a Multimodal LLM Application with PyMuPDF4LLM](https://miro.medium.com/v2/resize:fit:679/1*3Vv7d7iPN0yAlt7wXhHLpg.png)

[![Image 34: Benito Martin](https://miro.medium.com/v2/resize:fill:20:20/1*XcfvHkzJtTdRNxpyaw38vg.jpeg)](https://medium.com/@benitomartin?source=post_page---read_next_recirc--51fc7e8d6ef2----1---------------------8552788f_4058_45f1_895a_86fed3407e2c--------------)

[Benito Martin](https://medium.com/@benitomartin?source=post_page---read_next_recirc--51fc7e8d6ef2----1---------------------8552788f_4058_45f1_895a_86fed3407e2c--------------)

[Building a Multimodal LLM Application with PyMuPDF4LLM ------------------------------------------------------ ### Author: Benito Martin](https://medium.com/@benitomartin/building-a-multimodal-llm-application-with-pymupdf4llm-59753cb44483?source=post_page---read_next_recirc--51fc7e8d6ef2----1---------------------8552788f_4058_45f1_895a_86fed3407e2c--------------)

Sep 30, 2024

[893 5](https://medium.com/@benitomartin/building-a-multimodal-llm-application-with-pymupdf4llm-59753cb44483?source=post_page---read_next_recirc--51fc7e8d6ef2----1---------------------8552788f_4058_45f1_895a_86fed3407e2c--------------)

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fbookmark%2Fp%2F59753cb44483&operation=register&redirect=https%3A%2F%2Fmedium.com%2F%40benitomartin%2Fbuilding-a-multimodal-llm-application-with-pymupdf4llm-59753cb44483&source=---read_next_recirc--51fc7e8d6ef2----1-----------------bookmark_preview----8552788f_4058_45f1_895a_86fed3407e2c--------------)

![Image 35: How to Fine-Tune Embedding Models for RAG (Retrieval-Augmented Generation)?](https://miro.medium.com/v2/resize:fit:679/0*z2lFOAxVtBKtZ-Bf)

[![Image 36: why amit](https://miro.medium.com/v2/resize:fill:20:20/0*Kg7r8ds7B7oda6ZC)](https://medium.com/@whyamit101?source=post_page---read_next_recirc--51fc7e8d6ef2----0---------------------8552788f_4058_45f1_895a_86fed3407e2c--------------)

[why amit](https://medium.com/@whyamit101?source=post_page---read_next_recirc--51fc7e8d6ef2----0---------------------8552788f_4058_45f1_895a_86fed3407e2c--------------)

[How to Fine-Tune Embedding Models for RAG (Retrieval-Augmented Generation)? --------------------------------------------------------------------------- ### A Step-by-Step Guide With Code](https://medium.com/@whyamit101/how-to-fine-tune-embedding-models-for-rag-retrieval-augmented-generation-7c5bf08b3c54?source=post_page---read_next_recirc--51fc7e8d6ef2----0---------------------8552788f_4058_45f1_895a_86fed3407e2c--------------)

Dec 19, 2024

[2](https://medium.com/@whyamit101/how-to-fine-tune-embedding-models-for-rag-retrieval-augmented-generation-7c5bf08b3c54?source=post_page---read_next_recirc--51fc7e8d6ef2----0---------------------8552788f_4058_45f1_895a_86fed3407e2c--------------)

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fbookmark%2Fp%2F7c5bf08b3c54&operation=register&redirect=https%3A%2F%2Fmedium.com%2F%40whyamit101%2Fhow-to-fine-tune-embedding-models-for-rag-retrieval-augmented-generation-7c5bf08b3c54&source=---read_next_recirc--51fc7e8d6ef2----0-----------------bookmark_preview----8552788f_4058_45f1_895a_86fed3407e2c--------------)

![Image 37: Advanced RAG 06: Exploring Query Rewriting](https://miro.medium.com/v2/resize:fit:679/1*bwC_8_SlzuKF158CjC3nBg.png)

[![Image 38: Florian June](https://miro.medium.com/v2/resize:fill:20:20/1*DmQ3DH2JeAJquvhT_tjVCw.jpeg)](https://medium.com/@florian_algo?source=post_page---read_next_recirc--51fc7e8d6ef2----1---------------------8552788f_4058_45f1_895a_86fed3407e2c--------------)

[Florian June](https://medium.com/@florian_algo?source=post_page---read_next_recirc--51fc7e8d6ef2----1---------------------8552788f_4058_45f1_895a_86fed3407e2c--------------)

[Advanced RAG 06: Exploring Query Rewriting ------------------------------------------ ### A key technique for aligning the semantics of queries and documents](https://medium.com/@florian_algo/advanced-rag-06-exploring-query-rewriting-23997297f2d1?source=post_page---read_next_recirc--51fc7e8d6ef2----1---------------------8552788f_4058_45f1_895a_86fed3407e2c--------------)

Mar 4, 2024

[1K 6](https://medium.com/@florian_algo/advanced-rag-06-exploring-query-rewriting-23997297f2d1?source=post_page---read_next_recirc--51fc7e8d6ef2----1---------------------8552788f_4058_45f1_895a_86fed3407e2c--------------)

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fbookmark%2Fp%2F23997297f2d1&operation=register&redirect=https%3A%2F%2Fmedium.com%2F%40florian_algo%2Fadvanced-rag-06-exploring-query-rewriting-23997297f2d1&source=---read_next_recirc--51fc7e8d6ef2----1-----------------bookmark_preview----8552788f_4058_45f1_895a_86fed3407e2c--------------)

![Image 39: Tabular Data, RAG, & LLMs: Improve Results Through Data Table Prompting](https://miro.medium.com/v2/resize:fit:679/0*yDadHu2xzZhgepKT)

[![Image 40: Intel Tech](https://miro.medium.com/v2/resize:fill:20:20/1*mObUkifTkQFAIJ9JPLuHBQ.png)](https://medium.com/intel-tech?source=post_page---read_next_recirc--51fc7e8d6ef2----2---------------------8552788f_4058_45f1_895a_86fed3407e2c--------------)

In

[Intel Tech](https://medium.com/intel-tech?source=post_page---read_next_recirc--51fc7e8d6ef2----2---------------------8552788f_4058_45f1_895a_86fed3407e2c--------------)

by

[Intel](https://medium.com/@intel?source=post_page---read_next_recirc--51fc7e8d6ef2----2---------------------8552788f_4058_45f1_895a_86fed3407e2c--------------)

[Tabular Data, RAG, & LLMs: Improve Results Through Data Table Prompting ----------------------------------------------------------------------- ### How to ingest small tabular data when working with LLMs.](https://medium.com/intel-tech/tabular-data-rag-llms-improve-results-through-data-table-prompting-bcb42678914b?source=post_page---read_next_recirc--51fc7e8d6ef2----2---------------------8552788f_4058_45f1_895a_86fed3407e2c--------------)

May 14, 2024

[567 6](https://medium.com/intel-tech/tabular-data-rag-llms-improve-results-through-data-table-prompting-bcb42678914b?source=post_page---read_next_recirc--51fc7e8d6ef2----2---------------------8552788f_4058_45f1_895a_86fed3407e2c--------------)

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fbookmark%2Fp%2Fbcb42678914b&operation=register&redirect=https%3A%2F%2Fmedium.com%2Fintel-tech%2Ftabular-data-rag-llms-improve-results-through-data-table-prompting-bcb42678914b&source=---read_next_recirc--51fc7e8d6ef2----2-----------------bookmark_preview----8552788f_4058_45f1_895a_86fed3407e2c--------------)

![Image 41: Building a Vector Database: A Practical Guide to Storing and Querying Data with FAISS](https://miro.medium.com/v2/resize:fit:679/1*cDmRs8h9AnmiYU3nOQzpZg.jpeg)

[![Image 42: Unicorn Day](https://miro.medium.com/v2/resize:fill:20:20/0*pawT57rXsMSeii7-)](https://medium.com/@wl8380?source=post_page---read_next_recirc--51fc7e8d6ef2----3---------------------8552788f_4058_45f1_895a_86fed3407e2c--------------)

[Unicorn Day](https://medium.com/@wl8380?source=post_page---read_next_recirc--51fc7e8d6ef2----3---------------------8552788f_4058_45f1_895a_86fed3407e2c--------------)

[Building a Vector Database: A Practical Guide to Storing and Querying Data with FAISS ------------------------------------------------------------------------------------- ### Have you ever wondered how GitHub Copilot suggests code snippets that feel magically relevant? Or how does ChatGPT seem to know exactly…](https://medium.com/@wl8380/building-a-vector-database-a-practical-guide-to-storing-and-querying-data-with-faiss-432f10acc96b?source=post_page---read_next_recirc--51fc7e8d6ef2----3---------------------8552788f_4058_45f1_895a_86fed3407e2c--------------)

Nov 23, 2024

[27](https://medium.com/@wl8380/building-a-vector-database-a-practical-guide-to-storing-and-querying-data-with-faiss-432f10acc96b?source=post_page---read_next_recirc--51fc7e8d6ef2----3---------------------8552788f_4058_45f1_895a_86fed3407e2c--------------)

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fbookmark%2Fp%2F432f10acc96b&operation=register&redirect=https%3A%2F%2Fmedium.com%2F%40wl8380%2Fbuilding-a-vector-database-a-practical-guide-to-storing-and-querying-data-with-faiss-432f10acc96b&source=---read_next_recirc--51fc7e8d6ef2----3-----------------bookmark_preview----8552788f_4058_45f1_895a_86fed3407e2c--------------)

[See more recommendations](https://medium.com/?source=post_page---read_next_recirc--51fc7e8d6ef2---------------------------------------)

[Help](https://help.medium.com/hc/en-us?source=post_page-----51fc7e8d6ef2---------------------------------------)

[Status](https://medium.statuspage.io/?source=post_page-----51fc7e8d6ef2---------------------------------------)

[About](https://medium.com/about?autoplay=1&source=post_page-----51fc7e8d6ef2---------------------------------------)

[Careers](https://medium.com/jobs-at-medium/work-at-medium-959d1a85284e?source=post_page-----51fc7e8d6ef2---------------------------------------)

[Press](mailto:pressinquiries@medium.com)

[Blog](https://blog.medium.com/?source=post_page-----51fc7e8d6ef2---------------------------------------)

[Privacy](https://policy.medium.com/medium-privacy-policy-f03bf92035c9?source=post_page-----51fc7e8d6ef2---------------------------------------)

[Rules](https://policy.medium.com/medium-rules-30e5502c4eb4?source=post_page-----51fc7e8d6ef2---------------------------------------)

[Terms](https://policy.medium.com/medium-terms-of-service-9db0094a1e0f?source=post_page-----51fc7e8d6ef2---------------------------------------)

[Text to speech](https://speechify.com/medium?source=post_page-----51fc7e8d6ef2---------------------------------------)

Title: 8 Common Mistakes in Vector Search (and How to Avoid Them)

URL Source: https://ai.gopubby.com/8-common-mistakes-in-vector-search-and-how-to-avoid-them-e48d849c23f8

Published Time: 2025-01-28T19:55:42.694Z

Markdown Content:
8 Common Mistakes in Vector Search (and How to Avoid Them) | by Michael Ryaboy | AI Advances
===============
 

[Open in app](https://rsci.app.link/?%24canonical_url=https%3A%2F%2Fmedium.com%2Fp%2Fe48d849c23f8&%7Efeature=LoOpenInAppButton&%7Echannel=ShowPostUnderCollection&source=post_page---top_nav_layout_nav-----------------------------------------)

[Sign up](https://medium.com/m/signin?operation=register&redirect=https%3A%2F%2Fai.gopubby.com%2F8-common-mistakes-in-vector-search-and-how-to-avoid-them-e48d849c23f8&source=post_page---top_nav_layout_nav-----------------------global_nav------------------)

[Sign in](https://medium.com/m/signin?operation=login&redirect=https%3A%2F%2Fai.gopubby.com%2F8-common-mistakes-in-vector-search-and-how-to-avoid-them-e48d849c23f8&source=post_page---top_nav_layout_nav-----------------------global_nav------------------)

[](https://medium.com/?source=post_page---top_nav_layout_nav-----------------------------------------)

[Write](https://medium.com/m/signin?operation=register&redirect=https%3A%2F%2Fmedium.com%2Fnew-story&source=---top_nav_layout_nav-----------------------new_post_topnav------------------)

[](https://medium.com/search?source=post_page---top_nav_layout_nav-----------------------------------------)

[Sign up](https://medium.com/m/signin?operation=register&redirect=https%3A%2F%2Fai.gopubby.com%2F8-common-mistakes-in-vector-search-and-how-to-avoid-them-e48d849c23f8&source=post_page---top_nav_layout_nav-----------------------global_nav------------------)

[Sign in](https://medium.com/m/signin?operation=login&redirect=https%3A%2F%2Fai.gopubby.com%2F8-common-mistakes-in-vector-search-and-how-to-avoid-them-e48d849c23f8&source=post_page---top_nav_layout_nav-----------------------global_nav------------------)

![Image 6](https://miro.medium.com/v2/resize:fill:64:64/1*dmbNkD5D-u45r44go_cf0g.png)

[Home](https://medium.com/?source=post_page--------------------------------------------)

Following

Library

[Your lists](https://medium.com/me/lists?source=post_page--------------------------------------------)[Saved lists](https://medium.com/me/lists/saved?source=post_page--------------------------------------------)[Highlights](https://medium.com/me/list/highlights?source=post_page--------------------------------------------)[Reading history](https://medium.com/me/lists/reading-history?source=post_page--------------------------------------------)

[Stories](https://medium.com/me/stories/drafts?source=post_page--------------------------------------------)[Stats](https://medium.com/me/stats?source=post_page--------------------------------------------)

[AI Advances ---------------](https://ai.gopubby.com/?source=post_page---publication_nav-3fe99b2acc4-e48d849c23f8---------------------------------------)

[Home](https://ai.gopubby.com/?source=post_page---publication_nav-3fe99b2acc4-e48d849c23f8---------------------------------------)[Newsletter](https://ai.gopubby.com/newsletter?source=post_page---publication_nav-3fe99b2acc4-e48d849c23f8---------------------------------------)[About](https://ai.gopubby.com/about?source=post_page---publication_nav-3fe99b2acc4-e48d849c23f8---------------------------------------)

·[Follow publication](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fsubscribe%2Fcollection%2Fai-advances&operation=register&redirect=https%3A%2F%2Fai.gopubby.com%2F8-common-mistakes-in-vector-search-and-how-to-avoid-them-e48d849c23f8&collection=AI+Advances&collectionId=3fe99b2acc4&source=post_page---publication_nav-3fe99b2acc4-e48d849c23f8---------------------publication_nav------------------)

[![Image 7: AI Advances](https://miro.medium.com/v2/resize:fill:76:76/1*R8zEd59FDf0l8Re94ImV0Q.png)](https://ai.gopubby.com/?source=post_page---post_publication_sidebar-3fe99b2acc4-e48d849c23f8---------------------------------------)

Democratizing access to artificial intelligence

[Follow publication](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fsubscribe%2Fcollection%2Fai-advances&operation=register&redirect=https%3A%2F%2Fai.gopubby.com%2F8-common-mistakes-in-vector-search-and-how-to-avoid-them-e48d849c23f8&collection=AI+Advances&collectionId=3fe99b2acc4&source=post_page---post_publication_sidebar-3fe99b2acc4-e48d849c23f8---------------------post_publication_sidebar------------------)

8 Common Mistakes in Vector Search (and How to Avoid Them)
==========================================================

[![Image 8: Michael Ryaboy](https://miro.medium.com/v2/resize:fill:88:88/1*iTWSk2J3q-7jAnKaxSgKnQ.jpeg)](https://medium.com/@aimichael?source=post_page---byline--e48d849c23f8---------------------------------------)

[![Image 9: AI Advances](https://miro.medium.com/v2/resize:fill:48:48/1*R8zEd59FDf0l8Re94ImV0Q.png)](https://ai.gopubby.com/?source=post_page---byline--e48d849c23f8---------------------------------------)

[Michael Ryaboy](https://medium.com/@aimichael?source=post_page---byline--e48d849c23f8---------------------------------------)

·[Follow](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fsubscribe%2Fuser%2F14223ef349bb&operation=register&redirect=https%3A%2F%2Fai.gopubby.com%2F8-common-mistakes-in-vector-search-and-how-to-avoid-them-e48d849c23f8&user=Michael+Ryaboy&userId=14223ef349bb&source=post_page-14223ef349bb--byline--e48d849c23f8---------------------post_header------------------)

Published in

[AI Advances](https://ai.gopubby.com/?source=post_page---byline--e48d849c23f8---------------------------------------)

·

8 min read

·

Jan 28, 2025

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fvote%2Fai-advances%2Fe48d849c23f8&operation=register&redirect=https%3A%2F%2Fai.gopubby.com%2F8-common-mistakes-in-vector-search-and-how-to-avoid-them-e48d849c23f8&user=Michael+Ryaboy&userId=14223ef349bb&source=---header_actions--e48d849c23f8---------------------clap_footer------------------)

289

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fbookmark%2Fp%2Fe48d849c23f8&operation=register&redirect=https%3A%2F%2Fai.gopubby.com%2F8-common-mistakes-in-vector-search-and-how-to-avoid-them-e48d849c23f8&source=---header_actions--e48d849c23f8---------------------bookmark_footer------------------)

[Listen](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2Fplans%3Fdimension%3Dpost_audio_button%26postId%3De48d849c23f8&operation=register&redirect=https%3A%2F%2Fai.gopubby.com%2F8-common-mistakes-in-vector-search-and-how-to-avoid-them-e48d849c23f8&source=---header_actions--e48d849c23f8---------------------post_audio_button------------------)

Share

![Image 10](https://miro.medium.com/v2/resize:fit:700/1*NkMGw7CWuJ9SRnic4yMQAQ.png)

Broken Magifying Glass. Image by Author.

Vector search looks easy on paper — chuck some embeddings into a database, query them, and boom, you get results. But once you leap from hobby projects to real-world apps, you quickly find that ‘magic’ turns into a minefield of exploding cloud bills, weird hallucinations, and searches that miss the mark entirely. I’ve seen teams burn weeks on ‘optimized’ pipelines only to get ambushed by the same issues: latency spikes, irrelevant chunks, and costs that are too high to justify.

Below, I’ll share eight pitfalls I see time and again — especially among teams scaling vector search without a plan. I’ll also give you practical strategies to sidestep them, so you can save time, money, and a whole lot of stress.

1\. Neglecting Evaluations from the Get-Go
==========================================

**Why It’s a Problem**  
You set up a fancy embedding search but soon discover that some queries fail while others succeed — and you don’t know why. That’s exactly what happens when you dive into vector search without a proper evaluation (eval) framework. You can’t fix what you can’t measure.

**What to Do Instead**

*   **Create a small, reliable eval set**: Even 50–100 labeled queries is enough to reveal huge gaps.
*   **Use standard metrics**: NDCG, MRR, recall — whatever. Start with something, then refine it.
*   **Monitor improvements**: Each time you tweak chunking or switch embeddings, run the eval again.

Many teams get excited about advanced chunking techniques or “contextual retrieval”, or even something like knowledge graphs, but have zero idea if those changes actually help. Evals break you out of guesswork.

2\. Ignoring Hybrid Search
==========================

**Why It’s a Problem**  
Relying solely on embedding similarity can miss obvious keyword hits. If your embeddings aren’t domain-tuned — or a user queries a rare term — the system might fail. Meanwhile, standard keyword search (BM25, etc.) would’ve caught it.

**What to Do Instead**

*   **Combine embeddings + keyword search**: “Hybrid search” merges vector-based and keyword-based results.
*   **Boost recall**: This approach is easy to implement in many vector DBs (e.g., KDB.AI can store both BM25 and vector indexes in the same table).
*   **Re-rank the union**: Return the top results from both methods and let your re-ranker decide.

It’s increasingly common to see teams jump to embeddings only and wondered why trivial queries got missed. Non-fine-tuned embeddings often perform _worse_ than a simple keyword search than BM25 on non-standard datasets. That’s where hybrid search comes in — by combining embeddings and keyword search you can massively improve recall without sacrificing latency. It should be the first step towards improving your vector search pipeline.

Here’s an example of how hybrid search looks in action:

![Image 11](https://miro.medium.com/v2/resize:fit:700/1*45Eicxhzs_kM5G-CRBe01g.png)

Hybrid Search Diagram. Image by Author.

3\. Over-Optimizing (Especially Without Evals)
==============================================

**Why It’s a Problem**  
It’s tempting to chase some shiny new retrieval technique — before establishing a clear baseline. If you can’t measure impact, you won’t know if it’s working.

**What to Do Instead**

1.  **Set a baseline**: A great place to start is often hybrid search + a small re-ranker.
2.  **Measure**: Evaluate it on your labeled set.
3.  **Introduce changes gradually**: See if performance actually improved with changes.

If your pipeline is very complex (and it’s very easy to create a complex pipeline with a tool like LlamaIndex), you may be better off building a simple RAG pipeline from scratch.

Look at all these retrievers on LlamaIndex! Without evals, you’ll never know if they’re actually working (improving your search results.)

![Image 12](https://miro.medium.com/v2/resize:fit:700/1*NimJCl8ROIiB5bjKXCUGeg.png)

Llamaindex Retrievers. Image source: [https://docs.llamaindex.ai/en/stable/examples/retrievers/composable\_retrievers/](https://docs.llamaindex.ai/en/stable/examples/retrievers/composable_retrievers/)

Even simple techniques like late-chunking, which can often improve performance with little work, can potentially reduce the quality of your results. But the worst thing you can do is spend days on complex methods (I see quite often people see a new study and think “I need to try this”) only to discover their performance was worse than it was on day one, either in terms of latency or recall.

Always measure, and when in doubt, simplify.

4\. Not Quantizing Your Embeddings
==================================

**Why It’s a Problem**  
3k-dimensional embeddings can work great, until you have tens of millions of them — then you’re drowning in memory costs. Overkill embeddings can also slow queries and blow up your cloud bill.

**What to Do Instead**

*   **Use quantization**: Techniques like Matryoshka Representation Learning (MRL) or binary quantization can shrink embeddings down with minimal loss.
*   **Try 64D or 128D**: Especially if you have over 2–3M vectors. You might barely notice any drop in recall — but you’ll definitely see a drop in cost.
*   **Lean on re-ranking**: The first retrieval step can be “good enough” if you re-rank the top N results with a more accurate method.
*   **Consider Binary Quantization**: Binary quantization often mixes well with other techniques like MRL, but make sure your model works well with it!

I’ve chatted with developers paying $100+ a month for a serverless DB that only had 1M vectors at 1536 dims. I’ve also spoken to engineers that believe they “need” 3000 dimensions for good search on their PDFs. I promise you, you do not. Switching to 64D or 128D cuts their storage and CPU usage so much that it effectively became free. If you use binary quantization on top of that, you can reduce the space used up by your embeddings by an additional 32x.

Once again, our evals tell us how much we can quantize without losing too much recall.

5\. Failing to Use On-Disk Indexes at Larger Scale
==================================================

**Why It’s a Problem**  
Once you hit 5–10+ million vectors, storing them all in RAM is often too expensive. You might be forced into a more expensive hardware tier or a bigger managed DB tier just to hold your embeddings in memory.

**What to Do Instead**

*   **On-disk indexing**: Indexes like qHNSW in KDB.AI let you store vectors on disk, drastically cutting memory usage.
*   **Check your scale**: If you see yourself heading toward 50 million or 100 million vectors, plan for an on-disk solution.
*   **Watch your latency**: Modern on-disk indexes are surprisingly fast, so you might barely notice the difference — but always measure. For example, KDB.AI’s qHNSW index actually achieves 3x higher throughput than the default HNSW index, while keeping latency about the same.

6\. Skipping Fine-Tuning (Either Embeddings or Re-Rankers)
==========================================================

**Why It’s a Problem**  
Off-the-shelf embeddings (e.g., from OpenAI, Cohere) are great for general queries but might miss domain-specific nuance — like medical terms, chemical compounds, or specialized brand references.

**What to Do Instead**

*   **Fine-tune embeddings**: Even 1,000 labeled pairs can make a difference.
*   **Fine-tune re-rankers**: Cross-encoders or other re-rankers often need fewer examples than you’d think. Even a few hundred pairs can make a difference, but the more the better.
*   **Use your eval set**: Test before you train, then after. Track how much fine-tuning helps.

15–25% improvements in recall are not uncommon with just a small set of domain-specific training samples. If domain matters, ignoring fine-tuning is leaving accuracy on the table. Fine-tuning embedding models and rerankers is becoming increasingly easy.

Here’s an excellent blog on training embeddings: [https://huggingface.co/blog/train-sentence-transformers](https://huggingface.co/blog/train-sentence-transformers)

7\. Confusing Vector Search with a Full-Fledged Vector Database
===============================================================

**Why It’s a Problem**  
It’s easy to download Faiss or Annoy, hack together approximate nearest neighbor search, and call it a day. But production DBs handle so much more than raw vector lookups — like hybrid search, concurrency, metadata filters, partitioning, etc. Most in-memory vector libs don’t even support searching while adding new data.

**What to Do Instead**

*   **Pick a vector database**: Tools like KDB.AI solve database-level problems like transactions, scaling, and advanced querying.
*   **Make sure Hybrid Search is an option**: Hybrid search is now the standard for text retrieval, and is vital for real-world use cases.
*   **Metadata filtering**: Real queries typically say “find me all documents near this vector _but also_ created in the last 7 days.” Make sure your DB can do that. KDB.AI also supports partitioning on metadata, so if you data is related to time you can massively reduce latency!

Rebuilding your index from scratch each time your data changes isn’t fun — yet that’s exactly what you face if you only rely on a raw Faiss index.

8\. Being Afraid to Look at (and Edit) Your Data
================================================

**Why It’s a Problem**  
So many teams treat their chunks or embeddings as a black box — “it’s just the AI’s job to figure it out.” Then they wonder why certain queries fail or produce nonsense.

**What to Do Instead**

*   **Inspect your chunks**: Look at how text is split. Are you cutting sentences in half? Did a key phrase get truncated?
*   **Manually fix trouble spots**: If a certain chunk is underperforming, don’t be afraid to add a keyword or refine how it’s described. If a user query doesn’t return what it should, maybe you need to manually tweak the chunk’s text.
*   **Iterate on real feedback**: If a query is popular and keeps failing, do a quick update so that the chunk surfaces the right keywords. Sometimes the easiest fix is a small tweak in the raw data.

**Key Insight**  
Vector DBs are not some mystical black box. Just like you’d tune an index or restructure a relational DB table, you can absolutely revise your chunk text, rename fields, or annotate certain parts. Yes, it’s “manual,” but it can dramatically fix real-world issues quickly.

Final Thoughts
==============

Vector search can supercharge semantic queries, but it can also blow up in your face if you overlook these eight pitfalls. Whether you’re building a recommendation system on 1 million vectors or scaling to 100 million for a big enterprise knowledge base, keep these mistakes — and fixes — in mind:

1.  **Add evals early** so you can track real progress.
2.  **Use hybrid search** to catch both semantic and exact matches.
3.  **Don’t over-optimize** advanced RAG or chunking without data to back it up.
4.  **Quantize** to keep memory and bills in check.
5.  **Use on-disk indexes** if you’re going big — memory is costly.
6.  **Fine-tune embeddings or re-rankers** if domain specificity matters.
7.  **Adopt a full vector DB** rather than a barebones library.
8.  **Look at your data** — and don’t be afraid to manually fix chunk issues when you see them.

Address these head-on, and you’re well on your way to a vector search pipeline that consistently delivers relevant results — without draining your wallet. If you’re under ~5M vectors, you can often store embeddings at 64D on disk, keep everything under a free KDB.AI cloud tier, and still get <200ms latency. And if you do see a query struggling, a quick chunk edit might be all it takes to fix it.

**Happy querying!**

![Image 13](https://miro.medium.com/v2/da:true/resize:fit:0/5c50caa54067fd622d2f0fac18392213bf92f6e2fae89b691e62bceb40885e74)

Sign up to discover human stories that deepen your understanding of the world.
------------------------------------------------------------------------------

Free
----

Distraction-free reading. No ads.

Organize your knowledge with lists and highlights.

Tell your story. Find your audience.

[Sign up for free](https://medium.com/m/signin?operation=register&redirect=https%3A%2F%2Fai.gopubby.com%2F8-common-mistakes-in-vector-search-and-how-to-avoid-them-e48d849c23f8&source=---post_footer_upsell--e48d849c23f8---------------------lo_non_moc_upsell------------------)

Membership
----------

Read member-only stories

Support writers you read most

Earn money for your writing

Listen to audio narrations

Read offline with the Medium app

[Try for $5/month](https://medium.com/m/signin?operation=register&redirect=https%3A%2F%2Fmedium.com%2Fplans&source=---post_footer_upsell--e48d849c23f8---------------------lo_non_moc_upsell------------------)

[Data Science](https://medium.com/tag/data-science?source=post_page-----e48d849c23f8---------------------------------------)

[Artificial Intelligence](https://medium.com/tag/artificial-intelligence?source=post_page-----e48d849c23f8---------------------------------------)

[Vector Database](https://medium.com/tag/vector-database?source=post_page-----e48d849c23f8---------------------------------------)

[Retrieval Augmented Gen](https://medium.com/tag/retrieval-augmented-gen?source=post_page-----e48d849c23f8---------------------------------------)

[Information Retrieval](https://medium.com/tag/information-retrieval?source=post_page-----e48d849c23f8---------------------------------------)

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fvote%2Fai-advances%2Fe48d849c23f8&operation=register&redirect=https%3A%2F%2Fai.gopubby.com%2F8-common-mistakes-in-vector-search-and-how-to-avoid-them-e48d849c23f8&user=Michael+Ryaboy&userId=14223ef349bb&source=---footer_actions--e48d849c23f8---------------------clap_footer------------------)

289

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fvote%2Fai-advances%2Fe48d849c23f8&operation=register&redirect=https%3A%2F%2Fai.gopubby.com%2F8-common-mistakes-in-vector-search-and-how-to-avoid-them-e48d849c23f8&user=Michael+Ryaboy&userId=14223ef349bb&source=---footer_actions--e48d849c23f8---------------------clap_footer------------------)

289

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fbookmark%2Fp%2Fe48d849c23f8&operation=register&redirect=https%3A%2F%2Fai.gopubby.com%2F8-common-mistakes-in-vector-search-and-how-to-avoid-them-e48d849c23f8&source=---footer_actions--e48d849c23f8---------------------bookmark_footer------------------)

[![Image 14: AI Advances](https://miro.medium.com/v2/resize:fill:96:96/1*R8zEd59FDf0l8Re94ImV0Q.png)](https://ai.gopubby.com/?source=post_page---post_publication_info--e48d849c23f8---------------------------------------)

[![Image 15: AI Advances](https://miro.medium.com/v2/resize:fill:128:128/1*R8zEd59FDf0l8Re94ImV0Q.png)](https://ai.gopubby.com/?source=post_page---post_publication_info--e48d849c23f8---------------------------------------)

[Follow](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fsubscribe%2Fcollection%2Fai-advances&operation=register&redirect=https%3A%2F%2Fai.gopubby.com%2F8-common-mistakes-in-vector-search-and-how-to-avoid-them-e48d849c23f8&collection=AI+Advances&collectionId=3fe99b2acc4&source=post_page---post_publication_info--e48d849c23f8---------------------follow_post_publication_info------------------)

[Published in AI Advances ------------------------](https://ai.gopubby.com/?source=post_page---post_publication_info--e48d849c23f8---------------------------------------)

[26K Followers](https://ai.gopubby.com/followers?source=post_page---post_publication_info--e48d849c23f8---------------------------------------)

·[Last published 5 hours ago](https://ai.gopubby.com/building-efficient-leaner-docker-images-multistage-dockerfiles-da5ae52fc325?source=post_page---post_publication_info--e48d849c23f8---------------------------------------)

Democratizing access to artificial intelligence

[Follow](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fsubscribe%2Fcollection%2Fai-advances&operation=register&redirect=https%3A%2F%2Fai.gopubby.com%2F8-common-mistakes-in-vector-search-and-how-to-avoid-them-e48d849c23f8&collection=AI+Advances&collectionId=3fe99b2acc4&source=post_page---post_publication_info--e48d849c23f8---------------------follow_post_publication_info------------------)

[![Image 16: Michael Ryaboy](https://miro.medium.com/v2/resize:fill:96:96/1*iTWSk2J3q-7jAnKaxSgKnQ.jpeg)](https://medium.com/@aimichael?source=post_page---post_author_info--e48d849c23f8---------------------------------------)

[![Image 17: Michael Ryaboy](https://miro.medium.com/v2/resize:fill:128:128/1*iTWSk2J3q-7jAnKaxSgKnQ.jpeg)](https://medium.com/@aimichael?source=post_page---post_author_info--e48d849c23f8---------------------------------------)

[Follow](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fsubscribe%2Fuser%2F14223ef349bb&operation=register&redirect=https%3A%2F%2Fai.gopubby.com%2F8-common-mistakes-in-vector-search-and-how-to-avoid-them-e48d849c23f8&user=Michael+Ryaboy&userId=14223ef349bb&source=post_page-14223ef349bb--post_author_info--e48d849c23f8---------------------follow_post_author_info------------------)

[Written by Michael Ryaboy -------------------------](https://medium.com/@aimichael?source=post_page---post_author_info--e48d849c23f8---------------------------------------)

[1K Followers](https://medium.com/@aimichael/followers?source=post_page---post_author_info--e48d849c23f8---------------------------------------)

·[11 Following](https://medium.com/@aimichael/following?source=post_page---post_author_info--e48d849c23f8---------------------------------------)

Developer Advocate at [KDB.AI](http://kdb.ai/)

[Follow](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fsubscribe%2Fuser%2F14223ef349bb&operation=register&redirect=https%3A%2F%2Fai.gopubby.com%2F8-common-mistakes-in-vector-search-and-how-to-avoid-them-e48d849c23f8&user=Michael+Ryaboy&userId=14223ef349bb&source=post_page-14223ef349bb--post_author_info--e48d849c23f8---------------------follow_post_author_info------------------)

No responses yet
----------------

[](https://policy.medium.com/medium-rules-30e5502c4eb4?source=post_page---post_responses--e48d849c23f8---------------------------------------)

![Image 18](https://miro.medium.com/v2/resize:fill:32:32/1*dmbNkD5D-u45r44go_cf0g.png)

Write a response

[What are your thoughts?](https://medium.com/m/signin?operation=register&redirect=https%3A%2F%2Fai.gopubby.com%2F8-common-mistakes-in-vector-search-and-how-to-avoid-them-e48d849c23f8&source=---post_responses--e48d849c23f8---------------------respond_sidebar------------------)

Cancel

Respond

Also publish to my profile

More from Michael Ryaboy and AI Advances
----------------------------------------

![Image 19: 10x Cheaper PDF Processing: Ingesting and RAG on Millions of Documents with Gemini 2.0 Flash](https://miro.medium.com/v2/resize:fit:679/1*CEfGhNp748icy2EqFvG8WA.png)

[![Image 20: AI Advances](https://miro.medium.com/v2/resize:fill:20:20/1*R8zEd59FDf0l8Re94ImV0Q.png)](https://ai.gopubby.com/?source=post_page---author_recirc--e48d849c23f8----0---------------------2b15da2d_8c80_4825_93aa_6a3cd9d140de--------------)

In

[AI Advances](https://ai.gopubby.com/?source=post_page---author_recirc--e48d849c23f8----0---------------------2b15da2d_8c80_4825_93aa_6a3cd9d140de--------------)

by

[Michael Ryaboy](https://medium.com/@aimichael?source=post_page---author_recirc--e48d849c23f8----0---------------------2b15da2d_8c80_4825_93aa_6a3cd9d140de--------------)

[10x Cheaper PDF Processing: Ingesting and RAG on Millions of Documents with Gemini 2.0 Flash -------------------------------------------------------------------------------------------- ### Picture this: you start by converting every PDF page into images, then send them off for OCR, only to wrestle the raw text into workable…](https://ai.gopubby.com/10x-cheaper-pdf-processing-ingesting-and-rag-on-millions-of-documents-with-gemini-2-0-flash-8a93dbbb3b54?source=post_page---author_recirc--e48d849c23f8----0---------------------2b15da2d_8c80_4825_93aa_6a3cd9d140de--------------)

Feb 13

[1K 17](https://ai.gopubby.com/10x-cheaper-pdf-processing-ingesting-and-rag-on-millions-of-documents-with-gemini-2-0-flash-8a93dbbb3b54?source=post_page---author_recirc--e48d849c23f8----0---------------------2b15da2d_8c80_4825_93aa_6a3cd9d140de--------------)

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fbookmark%2Fp%2F8a93dbbb3b54&operation=register&redirect=https%3A%2F%2Fai.gopubby.com%2F10x-cheaper-pdf-processing-ingesting-and-rag-on-millions-of-documents-with-gemini-2-0-flash-8a93dbbb3b54&source=---author_recirc--e48d849c23f8----0-----------------bookmark_preview----2b15da2d_8c80_4825_93aa_6a3cd9d140de--------------)

![Image 21: Agentic AI for Data Engineering](https://miro.medium.com/v2/resize:fit:679/1*Jwnv2prBBHCvDDi_Kik9fQ.png)

[![Image 22: AI Advances](https://miro.medium.com/v2/resize:fill:20:20/1*R8zEd59FDf0l8Re94ImV0Q.png)](https://ai.gopubby.com/?source=post_page---author_recirc--e48d849c23f8----1---------------------2b15da2d_8c80_4825_93aa_6a3cd9d140de--------------)

In

[AI Advances](https://ai.gopubby.com/?source=post_page---author_recirc--e48d849c23f8----1---------------------2b15da2d_8c80_4825_93aa_6a3cd9d140de--------------)

by

[Debmalya Biswas](https://debmalyabiswas.medium.com/?source=post_page---author_recirc--e48d849c23f8----1---------------------2b15da2d_8c80_4825_93aa_6a3cd9d140de--------------)

[Agentic AI for Data Engineering ------------------------------- ### Reimagining Enterprise Data Management leveraging AI Agents](https://ai.gopubby.com/agentic-ai-for-data-engineering-4412d5e70189?source=post_page---author_recirc--e48d849c23f8----1---------------------2b15da2d_8c80_4825_93aa_6a3cd9d140de--------------)

Mar 23

[413 11](https://ai.gopubby.com/agentic-ai-for-data-engineering-4412d5e70189?source=post_page---author_recirc--e48d849c23f8----1---------------------2b15da2d_8c80_4825_93aa_6a3cd9d140de--------------)

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fbookmark%2Fp%2F4412d5e70189&operation=register&redirect=https%3A%2F%2Fai.gopubby.com%2Fagentic-ai-for-data-engineering-4412d5e70189&source=---author_recirc--e48d849c23f8----1-----------------bookmark_preview----2b15da2d_8c80_4825_93aa_6a3cd9d140de--------------)

![Image 23: How to make your own AI software engineer (like Devin)](https://miro.medium.com/v2/resize:fit:679/0*wxHG3WMeszpDsiJw)

[![Image 24: AI Advances](https://miro.medium.com/v2/resize:fill:20:20/1*R8zEd59FDf0l8Re94ImV0Q.png)](https://ai.gopubby.com/?source=post_page---author_recirc--e48d849c23f8----2---------------------2b15da2d_8c80_4825_93aa_6a3cd9d140de--------------)

In

[AI Advances](https://ai.gopubby.com/?source=post_page---author_recirc--e48d849c23f8----2---------------------2b15da2d_8c80_4825_93aa_6a3cd9d140de--------------)

by

[Nikhil Anand](https://medium.com/@nikhilanandnj?source=post_page---author_recirc--e48d849c23f8----2---------------------2b15da2d_8c80_4825_93aa_6a3cd9d140de--------------)

[How to make your own AI software engineer (like Devin) ------------------------------------------------------ ### …using DeepSeek’s RL blueprint for everything AI.](https://ai.gopubby.com/how-to-make-your-own-ai-software-engineer-like-devin-67ffc7153040?source=post_page---author_recirc--e48d849c23f8----2---------------------2b15da2d_8c80_4825_93aa_6a3cd9d140de--------------)

Mar 19

[740 17](https://ai.gopubby.com/how-to-make-your-own-ai-software-engineer-like-devin-67ffc7153040?source=post_page---author_recirc--e48d849c23f8----2---------------------2b15da2d_8c80_4825_93aa_6a3cd9d140de--------------)

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fbookmark%2Fp%2F67ffc7153040&operation=register&redirect=https%3A%2F%2Fai.gopubby.com%2Fhow-to-make-your-own-ai-software-engineer-like-devin-67ffc7153040&source=---author_recirc--e48d849c23f8----2-----------------bookmark_preview----2b15da2d_8c80_4825_93aa_6a3cd9d140de--------------)

![Image 25: Anthropic-Style Citations with Any LLM](https://miro.medium.com/v2/resize:fit:679/1*_Dx-QeNQes_VF54vezxtiA.png)

[![Image 26: Data Science Collective](https://miro.medium.com/v2/resize:fill:20:20/1*0nV0Q-FBHj94Kggq00pG2Q.jpeg)](https://medium.com/data-science-collective?source=post_page---author_recirc--e48d849c23f8----3---------------------2b15da2d_8c80_4825_93aa_6a3cd9d140de--------------)

In

[Data Science Collective](https://medium.com/data-science-collective?source=post_page---author_recirc--e48d849c23f8----3---------------------2b15da2d_8c80_4825_93aa_6a3cd9d140de--------------)

by

[Michael Ryaboy](https://medium.com/@aimichael?source=post_page---author_recirc--e48d849c23f8----3---------------------2b15da2d_8c80_4825_93aa_6a3cd9d140de--------------)

[Anthropic-Style Citations with Any LLM -------------------------------------- ### Anthropic’s new Citations feature for Claude recently went viral because it lets you attach references to your AI’s answers automatically —…](https://medium.com/data-science-collective/anthropic-style-citations-with-any-llm-2c061671ddd5?source=post_page---author_recirc--e48d849c23f8----3---------------------2b15da2d_8c80_4825_93aa_6a3cd9d140de--------------)

Mar 14

[88 3](https://medium.com/data-science-collective/anthropic-style-citations-with-any-llm-2c061671ddd5?source=post_page---author_recirc--e48d849c23f8----3---------------------2b15da2d_8c80_4825_93aa_6a3cd9d140de--------------)

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fbookmark%2Fp%2F2c061671ddd5&operation=register&redirect=https%3A%2F%2Fmedium.com%2Fdata-science-collective%2Fanthropic-style-citations-with-any-llm-2c061671ddd5&source=---author_recirc--e48d849c23f8----3-----------------bookmark_preview----2b15da2d_8c80_4825_93aa_6a3cd9d140de--------------)

[See all from Michael Ryaboy](https://medium.com/@aimichael?source=post_page---author_recirc--e48d849c23f8---------------------------------------)

[See all from AI Advances](https://ai.gopubby.com/?source=post_page---author_recirc--e48d849c23f8---------------------------------------)

Recommended from Medium
-----------------------

![Image 27: Local DeepSeek-R1 671B on $800 configurations](https://miro.medium.com/v2/resize:fit:679/1*TsNrvfgr9xxdXtNMn2TR4Q.jpeg)

[![Image 28: Wei Lu](https://miro.medium.com/v2/resize:fill:20:20/0*L7iwOjUQEQgub7Ya.jpg)](https://medium.com/@GenerationAI?source=post_page---read_next_recirc--e48d849c23f8----0---------------------bf98c60c_c2e3_4f38_96cb_a559942dbf01--------------)

[Wei Lu](https://medium.com/@GenerationAI?source=post_page---read_next_recirc--e48d849c23f8----0---------------------bf98c60c_c2e3_4f38_96cb_a559942dbf01--------------)

[Local DeepSeek-R1 671B on $800 configurations --------------------------------------------- ### No matter how competitors attack DeepSeek, the V3 and R1 models are fully open-source LLMs with capabilities rivaling various commercial…](https://medium.com/@GenerationAI/deepseek-r1-671b-on-800-configurations-ed6f40425f34?source=post_page---read_next_recirc--e48d849c23f8----0---------------------bf98c60c_c2e3_4f38_96cb_a559942dbf01--------------)

Mar 20

[462 11](https://medium.com/@GenerationAI/deepseek-r1-671b-on-800-configurations-ed6f40425f34?source=post_page---read_next_recirc--e48d849c23f8----0---------------------bf98c60c_c2e3_4f38_96cb_a559942dbf01--------------)

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fbookmark%2Fp%2Fed6f40425f34&operation=register&redirect=https%3A%2F%2Fmedium.com%2F%40GenerationAI%2Fdeepseek-r1-671b-on-800-configurations-ed6f40425f34&source=---read_next_recirc--e48d849c23f8----0-----------------bookmark_preview----bf98c60c_c2e3_4f38_96cb_a559942dbf01--------------)

![Image 29: This new IDE from Google is an absolute game changer](https://miro.medium.com/v2/resize:fit:679/1*f-1HQQng85tbA7kwgECqoQ.png)

[![Image 30: Coding Beauty](https://miro.medium.com/v2/resize:fill:20:20/1*ViyWUoh4zqx294no1eENxw.png)](https://medium.com/coding-beauty?source=post_page---read_next_recirc--e48d849c23f8----1---------------------bf98c60c_c2e3_4f38_96cb_a559942dbf01--------------)

In

[Coding Beauty](https://medium.com/coding-beauty?source=post_page---read_next_recirc--e48d849c23f8----1---------------------bf98c60c_c2e3_4f38_96cb_a559942dbf01--------------)

by

[Tari Ibaba](https://medium.com/@tariibaba?source=post_page---read_next_recirc--e48d849c23f8----1---------------------bf98c60c_c2e3_4f38_96cb_a559942dbf01--------------)

[This new IDE from Google is an absolute game changer ---------------------------------------------------- ### This new IDE from Google is seriously revolutionary.](https://medium.com/coding-beauty/new-google-project-idx-fae1fdd079c7?source=post_page---read_next_recirc--e48d849c23f8----1---------------------bf98c60c_c2e3_4f38_96cb_a559942dbf01--------------)

Mar 11

[2.9K 173](https://medium.com/coding-beauty/new-google-project-idx-fae1fdd079c7?source=post_page---read_next_recirc--e48d849c23f8----1---------------------bf98c60c_c2e3_4f38_96cb_a559942dbf01--------------)

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fbookmark%2Fp%2Ffae1fdd079c7&operation=register&redirect=https%3A%2F%2Fmedium.com%2Fcoding-beauty%2Fnew-google-project-idx-fae1fdd079c7&source=---read_next_recirc--e48d849c23f8----1-----------------bookmark_preview----bf98c60c_c2e3_4f38_96cb_a559942dbf01--------------)

![Image 31: SmolDocling: A New Era in Document Processing — OCR](https://miro.medium.com/v2/resize:fit:679/0*n5j-jbfnJlGv_HXj.png)

[![Image 32: Data Science Collective](https://miro.medium.com/v2/resize:fill:20:20/1*0nV0Q-FBHj94Kggq00pG2Q.jpeg)](https://medium.com/data-science-collective?source=post_page---read_next_recirc--e48d849c23f8----0---------------------bf98c60c_c2e3_4f38_96cb_a559942dbf01--------------)

In

[Data Science Collective](https://medium.com/data-science-collective?source=post_page---read_next_recirc--e48d849c23f8----0---------------------bf98c60c_c2e3_4f38_96cb_a559942dbf01--------------)

by

[Buse Şenol](https://busekoseoglu.medium.com/?source=post_page---read_next_recirc--e48d849c23f8----0---------------------bf98c60c_c2e3_4f38_96cb_a559942dbf01--------------)

[SmolDocling: A New Era in Document Processing — OCR --------------------------------------------------- ### A model that outperforms its competitors 27 times its size with the DocTags format](https://medium.com/data-science-collective/smoldocling-a-new-era-in-document-processing-3e9b044eeb4a?source=post_page---read_next_recirc--e48d849c23f8----0---------------------bf98c60c_c2e3_4f38_96cb_a559942dbf01--------------)

6d ago

[680 2](https://medium.com/data-science-collective/smoldocling-a-new-era-in-document-processing-3e9b044eeb4a?source=post_page---read_next_recirc--e48d849c23f8----0---------------------bf98c60c_c2e3_4f38_96cb_a559942dbf01--------------)

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fbookmark%2Fp%2F3e9b044eeb4a&operation=register&redirect=https%3A%2F%2Fmedium.com%2Fdata-science-collective%2Fsmoldocling-a-new-era-in-document-processing-3e9b044eeb4a&source=---read_next_recirc--e48d849c23f8----0-----------------bookmark_preview----bf98c60c_c2e3_4f38_96cb_a559942dbf01--------------)

![Image 33: Manus: The AI That’s Quietly Making Experts Sweat (And Why You Need to Try It)](https://miro.medium.com/v2/resize:fit:679/1*2vpwzn1HNQnS1x1igutwpw.jpeg)

[![Image 34: Generative AI](https://miro.medium.com/v2/resize:fill:20:20/1*M4RBhIRaSSZB7lXfrGlatA.png)](https://generativeai.pub/?source=post_page---read_next_recirc--e48d849c23f8----1---------------------bf98c60c_c2e3_4f38_96cb_a559942dbf01--------------)

In

[Generative AI](https://generativeai.pub/?source=post_page---read_next_recirc--e48d849c23f8----1---------------------bf98c60c_c2e3_4f38_96cb_a559942dbf01--------------)

by

[Anwesh Agrawal](https://medium.com/@anwesh.agrawals?source=post_page---read_next_recirc--e48d849c23f8----1---------------------bf98c60c_c2e3_4f38_96cb_a559942dbf01--------------)

[Manus: The AI That’s Quietly Making Experts Sweat (And Why You Need to Try It) ------------------------------------------------------------------------------ ### From cloning bacteria in a virtual petri dish to designing your dream bedroom — this AI doesn’t just “assist.” It replaces entire job…](https://generativeai.pub/manus-the-ai-thats-quietly-making-experts-sweat-and-why-you-need-to-try-it-ead5bfe0d960?source=post_page---read_next_recirc--e48d849c23f8----1---------------------bf98c60c_c2e3_4f38_96cb_a559942dbf01--------------)

Mar 16

[572 10](https://generativeai.pub/manus-the-ai-thats-quietly-making-experts-sweat-and-why-you-need-to-try-it-ead5bfe0d960?source=post_page---read_next_recirc--e48d849c23f8----1---------------------bf98c60c_c2e3_4f38_96cb_a559942dbf01--------------)

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fbookmark%2Fp%2Fead5bfe0d960&operation=register&redirect=https%3A%2F%2Fgenerativeai.pub%2Fmanus-the-ai-thats-quietly-making-experts-sweat-and-why-you-need-to-try-it-ead5bfe0d960&source=---read_next_recirc--e48d849c23f8----1-----------------bookmark_preview----bf98c60c_c2e3_4f38_96cb_a559942dbf01--------------)

![Image 35: Craziest MCP Servers You Must Try](https://miro.medium.com/v2/resize:fit:679/1*fj50kDuSl87JHwz4N75Qsg.png)

[![Image 36: Everyday AI](https://miro.medium.com/v2/resize:fill:20:20/1*zT6K7hMwNoj89nKhGfL7Hg.png)](https://medium.com/everyday-ai?source=post_page---read_next_recirc--e48d849c23f8----2---------------------bf98c60c_c2e3_4f38_96cb_a559942dbf01--------------)

In

[Everyday AI](https://medium.com/everyday-ai?source=post_page---read_next_recirc--e48d849c23f8----2---------------------bf98c60c_c2e3_4f38_96cb_a559942dbf01--------------)

by

[Manpreet Singh](https://medium.com/@singh.manpreet171900?source=post_page---read_next_recirc--e48d849c23f8----2---------------------bf98c60c_c2e3_4f38_96cb_a559942dbf01--------------)

[Craziest MCP Servers You Must Try --------------------------------- ### I remember when I first heard about MCP (Model Context Protocol). I thought](https://medium.com/everyday-ai/craziest-mcp-servers-you-must-try-f23526a165f5?source=post_page---read_next_recirc--e48d849c23f8----2---------------------bf98c60c_c2e3_4f38_96cb_a559942dbf01--------------)

Mar 9

[1K 9](https://medium.com/everyday-ai/craziest-mcp-servers-you-must-try-f23526a165f5?source=post_page---read_next_recirc--e48d849c23f8----2---------------------bf98c60c_c2e3_4f38_96cb_a559942dbf01--------------)

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fbookmark%2Fp%2Ff23526a165f5&operation=register&redirect=https%3A%2F%2Fmedium.com%2Feveryday-ai%2Fcraziest-mcp-servers-you-must-try-f23526a165f5&source=---read_next_recirc--e48d849c23f8----2-----------------bookmark_preview----bf98c60c_c2e3_4f38_96cb_a559942dbf01--------------)

![Image 37: Testing 18 RAG Techniques to Find the Best](https://miro.medium.com/v2/resize:fit:679/1*JcAGUtpUWawjgitM0t1X2Q.png)

[![Image 38: Level Up Coding](https://miro.medium.com/v2/resize:fill:20:20/1*5D9oYBd58pyjMkV_5-zXXQ.jpeg)](https://levelup.gitconnected.com/?source=post_page---read_next_recirc--e48d849c23f8----3---------------------bf98c60c_c2e3_4f38_96cb_a559942dbf01--------------)

In

[Level Up Coding](https://levelup.gitconnected.com/?source=post_page---read_next_recirc--e48d849c23f8----3---------------------bf98c60c_c2e3_4f38_96cb_a559942dbf01--------------)

by

[Fareed Khan](https://medium.com/@fareedkhandev?source=post_page---read_next_recirc--e48d849c23f8----3---------------------bf98c60c_c2e3_4f38_96cb_a559942dbf01--------------)

[Testing 18 RAG Techniques to Find the Best ------------------------------------------ ### crag, HyDE, fusion and more!](https://levelup.gitconnected.com/testing-18-rag-techniques-to-find-the-best-094d166af27f?source=post_page---read_next_recirc--e48d849c23f8----3---------------------bf98c60c_c2e3_4f38_96cb_a559942dbf01--------------)

Mar 12

[1.3K 22](https://levelup.gitconnected.com/testing-18-rag-techniques-to-find-the-best-094d166af27f?source=post_page---read_next_recirc--e48d849c23f8----3---------------------bf98c60c_c2e3_4f38_96cb_a559942dbf01--------------)

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fbookmark%2Fp%2F094d166af27f&operation=register&redirect=https%3A%2F%2Flevelup.gitconnected.com%2Ftesting-18-rag-techniques-to-find-the-best-094d166af27f&source=---read_next_recirc--e48d849c23f8----3-----------------bookmark_preview----bf98c60c_c2e3_4f38_96cb_a559942dbf01--------------)

[See more recommendations](https://medium.com/?source=post_page---read_next_recirc--e48d849c23f8---------------------------------------)

[Help](https://help.medium.com/hc/en-us?source=post_page-----e48d849c23f8---------------------------------------)

[Status](https://medium.statuspage.io/?source=post_page-----e48d849c23f8---------------------------------------)

[About](https://medium.com/about?autoplay=1&source=post_page-----e48d849c23f8---------------------------------------)

[Careers](https://medium.com/jobs-at-medium/work-at-medium-959d1a85284e?source=post_page-----e48d849c23f8---------------------------------------)

[Press](mailto:pressinquiries@medium.com)

[Blog](https://blog.medium.com/?source=post_page-----e48d849c23f8---------------------------------------)

[Privacy](https://policy.medium.com/medium-privacy-policy-f03bf92035c9?source=post_page-----e48d849c23f8---------------------------------------)

[Rules](https://policy.medium.com/medium-rules-30e5502c4eb4?source=post_page-----e48d849c23f8---------------------------------------)

[Terms](https://policy.medium.com/medium-terms-of-service-9db0094a1e0f?source=post_page-----e48d849c23f8---------------------------------------)

[Text to speech](https://speechify.com/medium?source=post_page-----e48d849c23f8---------------------------------------)

Title: 10x Cheaper PDF Processing: Ingesting and RAG on Millions of Documents with Gemini 2.0 Flash

URL Source: https://ai.gopubby.com/10x-cheaper-pdf-processing-ingesting-and-rag-on-millions-of-documents-with-gemini-2-0-flash-8a93dbbb3b54

Published Time: 2025-02-13T23:35:16.249Z

Markdown Content:
[![Image 1: Michael Ryaboy](https://miro.medium.com/v2/resize:fill:88:88/1*iTWSk2J3q-7jAnKaxSgKnQ.jpeg)](https://medium.com/@aimichael?source=post_page---byline--8a93dbbb3b54---------------------------------------)

[![Image 2: AI Advances](https://miro.medium.com/v2/resize:fill:48:48/1*R8zEd59FDf0l8Re94ImV0Q.png)](https://ai.gopubby.com/?source=post_page---byline--8a93dbbb3b54---------------------------------------)

Published in

9 min read

Feb 13, 2025

\--

![Image 3](https://miro.medium.com/v2/resize:fit:700/1*CEfGhNp748icy2EqFvG8WA.png)

Image Source: [https://meetcody.ai/blog/gemini-1-5-flash-vs-gpt-4o/](https://meetcody.ai/blog/gemini-1-5-flash-vs-gpt-4o/), edited by author

**Picture this:** you start by converting every PDF page into images, then send them off for OCR, only to wrestle the raw text into workable HTML or Markdown. Next, you meticulously detect and rebuild each table, chop the content into chunks for semantic retrieval, and finally insert them all into a vector database. That’s already a monstrous pipeline—incorporating several ML/OCR models often at large cost.

**But what if** a single Large Language Model — **Google’s Gemini 2.0 Flash** — could streamline that entire process? Imagine bundling OCR and chunking in a single step, at a fraction of the cost. This piece explores exactly that possibility. We’ll show how Gemini 2.0 Flash converts PDFs into chunked, Markdown-ready text in one shot, freeing you from the usual multi-step madness. Then, we’ll store those chunks in **KDB.AI** for fast vector search, weaving it all into a more elegant, budget-friendly RAG workflow than you’ve likely seen before. Buckle up — it’s a game-changer.

This guide shows how to:

*   Use **Gemini 2.0 Flash** to convert PDF pages directly into chunked text.
*   Store chunks in **KDB.AI** for vector search.
*   Tie it all together in a RAG workflow.

Along the way, we’ll highlight real-world feedback from Hacker News discussions, plus references to [Sergey Filimonov’s blog](https://sergey.fyi/) that first measured ~6,000 pages/dollar with near-perfect accuracy.

![Image 4](https://miro.medium.com/v2/resize:fit:700/1*jFxIbJkCThkn087kPdrJkA.png)

Image source: [https://www.sergey.fyi/articles/gemini-flash-2](https://www.sergey.fyi/articles/gemini-flash-2)

> **_Key takeaway_**_: If you don’t need bounding boxes in the original PDF, this approach is drastically simpler and cheaper than older OCR pipelines._

If you want to just try it yourself in colab, check out this [notebook](https://colab.research.google.com/drive/1YFq0vr00kyLu7mdu30BR__duI-RvurDH?usp=sharing).

(Edit: follow me for part two coming soon, where we actually parse, ingest, and search a large dataset.)

2\. The Traditional PDF Ingestion Problem
-----------------------------------------

**Why is PDF ingestion so hard?**

1.  **Complex Layouts**: Multi-column text, footnotes, sidebars, images, or scanned forms.
2.  **Table Extraction**: Traditional OCR tools often flatten tables into jumbled text.
3.  **High Cost**: Using GPT-4o or other big LLMs can get expensive quickly, especially if you process millions of pages.
4.  **Multiple Tools**: You might run Tesseract for OCR, a layout model for table detection, a separate chunking strategy for RAG, etc.

Many teams end up with a huge pipeline that’s fragile and expensive. The new approach is:

> _“Just show the PDF page as an image to a multimodal LLM, give it a prompt for chunking, and watch the magic happen.”_

That’s where **Gemini 2.0 Flash** steps in.

3\. Why Gemini 2.0 Flash?
-------------------------

Per Sergey Filimonov and multiple [Hacker News commenters](https://news.ycombinator.com/item?id=43018928):

*   **Cost**: ~6,000 pages/dollar (with batch calls and minimal output tokens). That’s easily 5–30x cheaper than many other solutions (GPT-4, specialized OCR vendors, etc.).
*   **Accuracy**: Surprising fidelity on standard text. Most mistakes are minor structural differences, especially for tables.

The big _missing piece_ is bounding box data. If you need pixel-perfect overlays back onto the PDF, Gemini’s bounding-box generation is still far from accurate. But if your main concern is text-based retrieval or summaries, it’s cheaper, faster, and easier.

4\. End-to-End Architecture
---------------------------

We’ll do the following in code:

![Image 5](https://miro.medium.com/v2/resize:fit:700/0*kWZToVThG0v04qV3.png)

Image by author

1.  Convert PDF pages to images (`pdf2image`).
2.  Send images to Gemini 2.0 Flash with a chunking prompt.
3.  Extract chunk tags `<chunk>...</chunk>`.
4.  Embed those chunks with a common embedding model.
5.  Store in KDB.AI for search.
6.  At query time, retrieve relevant chunks and feed them to an LLM for final answers.

Below, we’ll walk through the code in **sections**, explaining each snippet step by step.

5\. Step-by-Step Code
---------------------

5.1. Install Dependencies & Create Basic Table
----------------------------------------------

First, we install all required Python packages:

*   **google-generativeai**: The Python client for Gemini.
*   **kdbai-client**: Interacting with KDB.AI.
*   **sentence-transformers**: For embeddings.
*   **pdf2image**: Converting PDF pages to PNGs.
*   Plus poppler-utils for system-level PDF support.

To get your KDB.AI credentials, head to [KDB.AI](http://kdb.ai/) and log in. The free cloud offering comes with 4GB of memory and 30GB of disk space, enough for millions of vectors if quantized properly.

\# SNIPPET 1: Installing packages & setting up  
!apt-get update  
!apt-get install -y poppler-utils  
!pip install -q google-generativeai kdbai-client sentence-transformers pdf2imageimport os  
import kdbai\_client as kdbai  
from sentence\_transformers import SentenceTransformer  
\# We'll connect to KDB.AI to store our chunk embeddings  
KDBAI\_ENDPOINT = "YOUR\_KDBAI\_ENDPOINT"  
KDBAI\_API\_KEY = "YOUR\_KDBAI\_API\_KEY"  
session = kdbai.Session(endpoint=KDBAI\_ENDPOINT, api\_key=KDBAI\_API\_KEY)  
db = session.database('default')  
print("Connected to KDB.AI:", db)

After installing, we create a session object to talk to our KDB.AI instance.

5.2. Creating a Vector Table
----------------------------

We’ll define a simple schema for chunk text and embeddings. KDB.AI supports indexing on the “vectors” column for similarity search.

\# SNIPPET 2: Define KDB.AI table schema  
VECTOR\_DIM = 384  # we'll use all-MiniLM-L6-v2 for embeddingsschema = \[  
    {"name": "id", "type": "str"},  
    {"name": "text", "type": "str"},  
    {"name": "vectors", "type": "float32s"}  
\]  
\# Build a simple L2 distance index  
index = \[  
    {  
        "name": "flat\_index",  
        "type": "flat",  
        "column": "vectors",  
        "params": {"dims": VECTOR\_DIM, "metric": "L2"}  
    }  
\]  
table\_name = "pdf\_chunks"  
try:  
    db.table(table\_name).drop()  
except kdbai.KDBAIException:  
    pass  
table = db.create\_table(table\_name, schema=schema, indexes=index)  
print(f"Table '{table\_name}' created.")

**Explanation**:

*   We store an `"id"` for each chunk, the `"text"`, and `"vectors"` for embeddings.
*   The table uses a “flat” index with L2 distance. For production, you might switch to HNSW if you want faster approximate nearest neighbor queries.

5.3. Converting PDF Pages to Images
-----------------------------------

Gemini is a **multimodal** model, so we can feed images directly. That means we first convert each PDF page to PNG with `pdf2image`.

\# SNIPPET 3: Convert PDF to images  
import requests  
from pdf2image import convert\_from\_bytes  
import base64  
import iopdf\_url = "https://arxiv.org/pdf/2404.08865"  # example PDF  
resp = requests.get(pdf\_url)  
pdf\_data = resp.content  
pages = convert\_from\_bytes(pdf\_data)  
print(f"Converted {len(pages)} PDF pages to images.")  
\# We'll encode the images as base64 for easy sending to Gemini  
images\_b64 = {}  
for i, page in enumerate(pages, start=1):  
    buffer = io.BytesIO()  
    page.save(buffer, format="PNG")  
    image\_data = buffer.getvalue()  
    b64\_str = base64.b64encode(image\_data).decode("utf-8")  
    images\_b64\[i\] = b64\_str

**Explanation**:

*   `convert_from_bytes` handles all pages in one shot.
*   We store each image’s raw PNG data as base64 strings, so it’s easy to pass it to Gemini’s API.

5.4. Calling Gemini 2.0 Flash for OCR + Chunking
------------------------------------------------

Let’s initialize the Gemini client and define a prompt that instructs the model to:

1.  “OCR the page into Markdown.”
2.  “Break it into 250–1,000 word sections.”
3.  “Surround the sections with `<chunk>` … `</chunk>`.”

\# SNIPPET 4: Configure Gemini & define chunking prompt  
import google.generativeai as genaiGOOGLE\_API\_KEY = "YOUR\_GOOGLE\_API\_KEY"  
genai.configure(api\_key=GOOGLE\_API\_KEY)  
model = genai.GenerativeModel(model\_name="gemini-2.0-flash")  
print("Gemini model loaded:", model)  
CHUNKING\_PROMPT = """\\  
OCR the following page into Markdown. Tables should be formatted as HTML.  
Do not surround your output with triple backticks.  
Chunk the document into sections of roughly 250 - 1000 words.  
Surround each chunk with <chunk\> and </chunk\> tags.  
Preserve as much content as possible, including headings, tables, etc.  
"""

**Explanation**:

*   We load `gemini-2.0-flash` as the model. If you want to try a bigger/smaller versions, you could pick the pro or flash variants respectively.”
*   The prompt is carefully written so the model outputs chunk delimiters we can parse easily.
*   Here we process one PDF, but we can easily scale this to millions with async calls to Gemini.

5.5. Processing Each Page with One Prompt
-----------------------------------------

We’ll define a helper function `process_page(page_num, b64)` that sends the base64 PNG plus the prompt to Gemini. Then we’ll parse out `<chunk>` blocks from the response.

\# SNIPPET 5: OCR + chunking function  
import redef process\_page(page\_num, image\_b64):  
    # We'll create the message payload:  
    payload = \[  
        {  
            "inline\_data": {"data": image\_b64, "mime\_type": "image/png"}  
        },  
        {  
            "text": CHUNKING\_PROMPT  
        }  
    \]  
    try:  
        resp = model.generate\_content(payload)  
        text\_out = resp.text  
    except Exception as e:  
        print(f"Error processing page {page\_num}: {e}")  
        return \[\]  
    # parse <chunk\> blocks  
    chunks = re.findall(r"<chunk\>(.\*?)</chunk\>", text\_out, re.DOTALL)  
    if not chunks:  
        # fallback if model doesn't produce chunk tags  
        chunks = text\_out.split("\\n\\n")  
    results = \[\]  
    for idx, chunk\_txt in enumerate(chunks):  
        # store ID, chunk text  
        results.append({  
            "id": f"page\_{page\_num}\_chunk\_{idx}",  
            "text": chunk\_txt.strip()  
        })  
    return results  
all\_chunks = \[\]  
for i, b64\_str in images\_b64.items():  
    page\_chunks = process\_page(i, b64\_str)  
    all\_chunks.extend(page\_chunks)  
print(f"Total extracted chunks: {len(all\_chunks)}")

**Explanation**:

1.  `inline_data`: Tells Gemini we’re passing an image (PNG).
2.  We also add the text chunking prompt.
3.  The model returns a big string. We find `<chunk>...</chunk>` to separate them.
4.  If no chunk tags are found, we do a fallback split by double newlines.

5.6. Embedding Chunks & Storing in KDB.AI
-----------------------------------------

Now that we have chunk text, let’s embed with `all-MiniLM-L6-v2` and upload to KDB.AI. This isn't nearly the best embedding model for this task, but it will do for this example.

\# SNIPPET 6: Embedding & Insertion  
embed\_model = SentenceTransformer("all-MiniLM-L6-v2")chunk\_texts = \[ch\["text"\] for ch in all\_chunks\]  
embeddings = embed\_model.encode(chunk\_texts)  
embeddings = embeddings.astype("float32")  
import pandas as pd  
row\_list = \[\]  
for idx, ch\_data in enumerate(all\_chunks):  
    row\_list.append({  
        "id": ch\_data\["id"\],  
        "text": ch\_data\["text"\],  
        "vectors": embeddings\[idx\].tolist()  
    })  
df = pd.DataFrame(row\_list)  
table.insert(df)  
print(f"Inserted {len(df)} chunks into '{table\_name}'.")

**Explanation**:

*   The embeddings come out as `numpy.float32` arrays of shape `(num_chunks, 384)`.
*   We convert each vector to a Python list and stuff it in a DataFrame.
*   Then we insert it into the KDB.AI table with `.insert()`.

At this point, each chunk is searchable in vector space. If you do a quick `table.query()` you’ll see them all stored inside KDB.

6\. Querying & Building a RAG Flow
----------------------------------

We can now embed user queries, fetch top chunks, and pass them to _any_ LLM for final Q&A.

6.1. Similarity Search
----------------------

\# SNIPPET 7: Vector query for RAG  
user\_query = "How does this paper handle multi-column text?"  
qvec = embed\_model.encode(user\_query).astype("float32")search\_results = table.search(vectors={"flat\_index": \[qvec\]}, n=3)  
retrieved\_chunks = search\_results\[0\]\["text"\].tolist()  
context\_for\_llm = "\\n\\n".join(retrieved\_chunks)  
print("Retrieved chunks:\\n", context\_for\_llm)

**Explanation**:

*   `table.search()` runs a vector similarity search. We get the top 3 relevant chunks.
*   We combine them into a single string for a final LLM call.

6.2. Final Generation
---------------------

We’ll feed the retrieved chunks as “context” to the same Gemini model (or any other LLM), letting it generate a final answer:

\# SNIPPET 8: RAG generation  
final\_prompt = f"""Use the following context to answer the question:  
Context:  
{context\_for\_llm}  
Question: {user\_query}  
Answer:  
"""  
resp = model.generate\_content(final\_prompt)  
print("\\n=== Gemini's final answer ===")  
print(resp.text)  

![Image 6](https://miro.medium.com/v2/resize:fit:700/0*X4EOijlAwlix7RjV.png)

Image by author

**Explanation**:

*   This is your standard RAG approach: incorporate the “context” from the top chunks, and ask the LLM to respond.
*   If you need specialized reasoning or a chain-of-thought approach, you can refine the prompt accordingly.

7\. Caveats & Lessons from Hacker News
--------------------------------------

1.  **Bounding Boxes**: Several users mention it’s a showstopper if you want to overlay text highlights on the original PDF. Gemini can do bounding box attempts, but it’s inaccurate.
2.  **Hallucinations**: LLM-based OCR can produce entire “missing” text. Most often it’s very close to ground truth, but it can be off, miss sections, or create content that wasn’t there. Some folks do a second pass or “prompt the LLM to verify each line.”
3.  **Cost**: If you do single-page, single-call usage, you might see fewer pages per dollar. Batching calls and limiting tokens is how you get ~6k pages/dollar.
4.  **Table accuracy**: Real-world table parsing can still be 80–90% correct. Great for semantic search or summarization, but maybe not perfect if you need a precise CSV. However, LLMs are only getting better at this task, and you can easily switch to another LLM later.

9\. Final Thoughts
------------------

1.  **User Feedback**: Real teams on HN have replaced specialized OCR vendors with Gemini for PDF ingestion, saving time **and** cost. Others remain cautious about bounding boxes or absolute numeric reliability.
2.  **When bounding boxes matter**: If you must precisely track the location of each chunk on the PDF, you’ll need a hybrid approach. (Google might solve this soon, but it’s not there yet.)
3.  **Scalability**: Doing millions of pages? Make sure to batch calls and limit tokens. That’s how you hit the ~6,000 pages/dollar sweet spot. Single-page calls or large outputs are costlier.
4.  **Simplicity**: You can literally skip a half-dozen microservices or GPU pipelines. For many, that alone is a _massive_ relief.

**Bottom line**: If you’re dealing with standard PDFs and want to feed them into a vector store for RAG, Gemini 2.0 Flash is _probably_ the fastest path to “good enough” text extraction — especially if you don’t need bounding boxes. The cost advantage can be enormous, and the code is pleasantly simple. That’s a huge step forward from where we were a year ago.

**Happy Chunking!**

— _Michael Ryaboy, Developer Advocate @ KDB.AI_

Follow me on [LinkedIn](https://www.linkedin.com/in/michael-ryaboy-software-engineer/) or [Medium](https://medium.com/@aimichael) to stay updated on LLMs, RAG, and AI Engineering.

Title: Anthropic-Style Citations with Any LLM - Data Science Collective - Medium

URL Source: https://medium.com/data-science-collective/anthropic-style-citations-with-any-llm-2c061671ddd5

Published Time: 2025-03-14T17:55:05.413Z

Markdown Content:
Anthropic-Style Citations with Any LLM
--------------------------------------

[![Image 1: Michael Ryaboy](https://miro.medium.com/v2/resize:fill:44:44/1*iTWSk2J3q-7jAnKaxSgKnQ.jpeg)](https://medium.com/@aimichael?source=post_page---byline--2c061671ddd5---------------------------------------)

[![Image 2: Data Science Collective](https://miro.medium.com/v2/resize:fill:24:24/1*0nV0Q-FBHj94Kggq00pG2Q.jpeg)](https://medium.com/data-science-collective?source=post_page---byline--2c061671ddd5---------------------------------------)

Published in

12 min read

Mar 14, 2025

![Image 3](https://miro.medium.com/v2/resize:fit:700/1*_Dx-QeNQes_VF54vezxtiA.png)

Image Sourced from [https://www.anthropic.com/news/introducing-citations-api](https://www.anthropic.com/news/introducing-citations-api) and edited by author

Anthropic’s new **Citations** feature for Claude recently went viral because it lets you attach references to your AI’s answers _automatically_ — yet it’s only available for Claude. If your pipeline runs on ChatGPT, a local open-source model, or something else, you’re out of luck with the official approach.

That’s why I put together this article: to show how you can **roll your own** Anthropic-style citation system, step by step, for any LLM you want. We’ll store chunks in a vector DB, retrieve them, pass them to the LLM with instructions on how to produce `<CIT>` tags referencing specific sentences, and then parse the final answer to display a neat, interactive UI for each citation. Yes, it’s a bit messy—and, if I had my choice, I’d use Anthropic’s built-in feature. But if you can’t, here’s your alternative.

> **_Note_**_: Anthropic likely uses a single-pass approach (like we do) to generate both the final answer and the citations inline. Another approach is two-pass: first the model writes an answer, then we ask it to label each snippet with references. That can be more accurate, but it’s also more complex and slower. For many use cases, inline citations are enough._

1\. The Architecture at a Glance
--------------------------------

Below is a quick look at how our do-it-yourself citation system works:

![Image 4](https://miro.medium.com/v2/resize:fit:700/0*w0vf-Z-JMhyCWzSI.png)

1.  **User Query**: We ask, say, “How does Paul Graham decide what to work on?”
2.  **Vector DB Search**: We embed the query, search in KDB.AI for relevant text chunks.
3.  **Chunks**: The top hits are split by sentences (we do naive splitting or some advanced method) to allow fine-grained references like “sentences=2–4.”
4.  **LLM Prompt**: We instruct the model to produce an answer that includes inline tags (`<CIT chunk_id='0' sentences='1-3'>…</CIT>`) around specific phrases.
5.  **LLM Output**: The single output includes both the final text _and_ embedded citation tags.
6.  **Parser**: We parse those tags out, map them back to the original chunk sentences, and build metadata (like the exact snippet the model claims is from chunk 0, sentences 1–3).
7.  **UI**: Finally, we show an interactive popover or tooltip in the user’s browser, letting them see the reference text from the chunk.

The result will be the following UI, with hoverable sentences in the style of Gemini:

![Image 5](https://miro.medium.com/v2/1*LeBjYPl0y7EPVStDkkPQqA.png)

Image source: author

2\. Full Code: Start to Finish
------------------------------

If you want to just try it yourself in Colab, check out this [notebook](https://colab.research.google.com/drive/1PdlmI0CXqM-3MqFckd7VqSjFTf5Y0wNu#scrollTo=4rhRF58Wwxhj).

We’ll be building a single-pass inline citation approach similar to what Anthropic likely uses under the hood. Note that a lot of the complexity of this approach comes from wanting to cite not only chunks, but fine-grained sentences within these chunks. This is something that I try to do because displaying these to the user is usually a good idea. But without this requirement, the code becomes substantially simpler and you can easily modify the following to simply return chunk citations instead.

2.1 Setup and Dependencies
--------------------------

We’ll rely on:

*   **kdbai\_client** to store chunks in the KDB.AI vector database.
*   **fastembed,** a library for generating local embeddings quickly.
*   **llama-index** to parse Paul Graham’s dataset.

!pip install llama-index fastembed kdbai\_client onnxruntime==1.19.2import os  
from getpass import getpass  
import kdbai\_client as kdbai  
import time  
from llama\_index.core import Document, SimpleDirectoryReader  
from llama\_index.core.node\_parser import SentenceSplitter  
import pandas as pd  
from fastembed import TextEmbedding  
import openai  
import textwrap

2.2 Connecting to KDB.AI
------------------------

We store all data in KDB.AI — each chunk along with its 384-dimensional embedding. This setup allows us to perform vector similarity searches to quickly identify the most relevant chunks.

KDB.AI offers an excellent free tier with 4GB of RAM. To get your API keys, simply sign up at [KDB.AI](https://markdown-to-medium.surge.sh/KDB.AI).

KDBAI\_ENDPOINT="KDBAI\_ENDPOINT"  
KDBAI\_API\_KEY="KDBAI\_API\_KEY"os.environ\["OPENAI\_API\_KEY"\] = "OPENAI\_API\_KEY"  
fastembed = TextEmbedding()  
KDBAI\_TABLE\_NAME = "paul\_graham"  
session = kdbai.Session(endpoint=KDBAI\_ENDPOINT, api\_key=KDBAI\_API\_KEY)  
database = session.database("default")  
  
try:  
    database.table(KDBAI\_TABLE\_NAME).drop()  
except kdbai.KDBAIException:  
    pass  
schema = \[  
    dict(name="text", type="bytes"),  
    dict(name="embedding", type="float32s")  
\]  
indexes = \[dict(name="flat\_index", column="embedding", type="flat", params=dict(metric="L2", dims=384))\]  
table = database.create\_table(KDBAI\_TABLE\_NAME, schema=schema, indexes=indexes)

2.3 Data Prep: Paul Graham Essays
---------------------------------

We fetch the Paul Graham essays, parse them into ~500 token chunks with 100 token overlap to preserve context:

!mkdir -p ./data  
!llamaindex-cli download-llamadataset PaulGrahamEssayDataset --download-dir ./datanode\_parser = SentenceSplitter(chunk\_size=500, chunk\_overlap=100)  
essays = SimpleDirectoryReader(input\_dir="./data/source\_files").load\_data()  
docs = node\_parser.get\_nodes\_from\_documents(essays)  
len(docs)

We embed each chunk with a local model:

embedding\_model = TextEmbedding()  
documents = \[doc.text for doc in docs\]  
embeddings = list(embedding\_model.embed(documents))records\_to\_insert\_with\_embeddings = pd.DataFrame({  
    "text": \[d.encode('utf-8') for d in documents\],  
    "embedding": embeddings  
})

table.insert(records\_to\_insert\_with\_embeddings)

2.4 RAG Implementation
----------------------

Our data is now in our table, and we can query it:

query = "How does Paul Graham decide what to work on?"  
query\_embedding = list(embedding\_model.embed(\[query\]))\[0\].tolist()search\_results = table.search({"flat\_index": \[query\_embedding\]}, n=10)  
search\_results\_df = search\_results\[0\]  
df = pd.DataFrame(search\_results\_df)  
df.head(5)

![Image 6](https://miro.medium.com/v2/resize:fit:700/1*pLB8sKN45-vZzEV2DtOEFQ.png)

Image source: author

We have the 10 chunks most relevant to our query. Next, we’ll feed them to the LLM.

2.5 The Citation Pipeline Code
------------------------------

**Here** is the part that does the heavy lifting. Much of this code is not for the actual citation generation, but instead to meaningfully display the result, which is tedious in Python.

First, we need to import some more libraries.

import os  
import re  
import json  
import openai  
import pandas as pd  
from typing import List, Dict, Any  
from IPython.display import display, HTML

Step 1: Prepare Data (Splitting Text into Sentences)
----------------------------------------------------

Before calling the LLM, we need a way to reference **individual sentences** within retrieved text chunks. This function **splits a text chunk into sentences** and assigns metadata like start and end character offsets.

  
  
def parse\_chunk\_into\_sentences(chunk\_text: str) -\> List\[Dict\[str, Any\]\]:  
    """  
    Splits 'chunk\_text' into naive 'sentences' with start/end offsets.  
    Returns a list of dicts like:  
      {  
        "sentence\_id": int,  
        "text": str,  
        "start\_char": int,  
        "end\_char": int  
      }  
    """  
      
      
    import re  
    raw\_parts = re.split(r'(\\.)', chunk\_text)

combined = \[\]  
    for i in range(0, len(raw\_parts), 2):  
        text\_part = raw\_parts\[i\].strip()  
        punct = ""  
        if i+1 < len(raw\_parts):  
            punct = raw\_parts\[i+1\]  
        if text\_part or punct:  
            combined\_text = (text\_part + punct).strip()  
            if combined\_text:  
                combined.append(combined\_text)

sentences = \[\]  
    offset = 0  
    for s\_id, s\_txt in enumerate(combined, start=1):  
        start\_char = offset  
        end\_char = start\_char + len(s\_txt)  
        sentences.append({  
            "sentence\_id": s\_id,  
            "text": s\_txt,  
            "start\_char": start\_char,  
            "end\_char": end\_char  
        })  
        offset = end\_char + 1    
    return sentences

We split into sentences so that the LLM can not only cite specific chunks, but return the _exact sentences in the chunk that are relevant_**.**

Step 2: Call OpenAI to Generate a Response with Citations
---------------------------------------------------------

Now that we can reference individual sentences, let’s **query the LLM** and instruct it to generate citations inline.

################################################################################  
\# STEP 2: CALL OPENAI WITH A ROBUST SYSTEM PROMPT  
################################################################################def call\_openai\_with\_citations(chunks: List\[str\], user\_query: str) -\> str:  
    """  
    Asks the LLM to produce a single continuous answer,  
    referencing chunk\_id + sentences range as:  
      <CIT chunk\_id='N' sentences='X-Y'\>...some snippet...</CIT\>.  
    """

# If you want, set your API key in code or rely on environment variable  
    # openai.api\_key \= "sk-..."  
    if not openai.api\_key and "OPENAI\_API\_KEY" in os.environ:  
        openai.api\_key \= os.environ\["OPENAI\_API\_KEY"\]

# We'll craft a robust system prompt with examples  
    system\_prompt \= (  
        "You have a collection of chunks from a single document, each chunk may have multiple sentences.\\n"  
        "Please write a single continuous answer to the user's question.\\n"  
        "When you reference or rely on a specific portion of a chunk, cite it as:\\n"  
        "  <CIT chunk\_id='N' sentences='X-Y'\>the snippet of your final answer</CIT\>\\n"  
        "Where:\\n"  
        "  - N is the chunk index.\\n"  
        "  - X-Y is the range of sentence numbers within that chunk. Example: 'sentences=2-4'.\\n"  
        "  - The text inside <CIT\> is part of your answer, not the original chunk text.\\n"  
        "  - Keep your answer minimal in whitespace. Do not add extra spaces or line breaks.\\n"  
        "  - Only add <CIT\> tags around the key phrases of your answer that rely on some chunk.\\n"  
        "    E.g. 'He stated <CIT chunk\_id='3' sentences='1-2'\>it was crucial to experiment early</CIT\>.'\\n\\n"  
        "Remember: The text inside <CIT\> is your final answer's snippet, not the chunk text itself.\\n"  
        "The user question is below."  
    )

# We just show the user the chunk texts:  
    chunks\_info \= "\\n\\n".join(  
        f"\[Chunk {i}\] {chunk}" for i, chunk in enumerate(chunks)  
    )

# We create the conversation  
    messages \= \[  
        {"role": "system", "content": system\_prompt},  
        {  
            "role": "user",  
            "content": f"{chunks\_info}\\n\\nQuestion: {user\_query}\\n"  
        }  
    \]

response \= openai.chat.completions.create(  
        model\="gpt-4o",  
        messages\=messages,  
        temperature\=0.3,  
        max\_tokens\=1024  
    )  
    return response.choices\[0\].message.content

This function sends a query to OpenAI, instructing it to generate a response that includes citations inline. The prompt explicitly directs the model to use `<CIT>` tags to mark references, ensuring each citation includes both the corresponding `chunk_id` and the specific sentence range (`sentences=X-Y`). For example, OpenAI might return a response like:

> Paul Graham suggests that <CIT chunk\_id=’2' sentences=’1–2'\>choosing work should be based on curiosity</CIT\>.

This approach ensures that the final answer is self-contained and properly annotated, allowing for precise attribution of information.

Step 3: Parse the LLM Response to Extract Citations
---------------------------------------------------

Once OpenAI returns a response, we need to **parse the citation tags** and **extract structured data**.

  
def parse\_response\_with\_sentence\_range(response\_text: str) -\> Dict\[str, Any\]:  
    """  
    Produce a single block with:  
    {  
      "type": "text",  
      "text": <the final answer minus CIT tags but with snippet inline\>,  
      "citations": \[  
        {  
          "chunk\_id": int,  
          "sentences\_range": "X-Y",  
          "answer\_snippet": snippet,  
          "answer\_snippet\_start": int,  
          "answer\_snippet\_end": int  
        },  
        ...  
      \]  
    }  
    """  
    pattern = re.compile(  
        r'(.\*?)<CIT\\s+chunk\_id=\[\\'"\](\\d+)\[\\'"\]\\s+sentences=\[\\'"\](\\d+-\\d+)\[\\'"\]\>(.\*?)(?:</CIT\>|(?=<CIT)|$)',  
        re.DOTALL  
    )  
    final\_text = ""  
    citations = \[\]  
    idx = 0

while True:  
        match = pattern.search(response\_text, idx)  
        if not match:  
              
            leftover = response\_text\[idx:\]  
            final\_text += leftover  
            break

text\_before = match.group(1)  
        chunk\_id\_str = match.group(2)  
        sent\_range = match.group(3)  
        snippet = match.group(4)

final\_text += text\_before

start\_in\_answer = len(final\_text)  
        final\_text += snippet  
        end\_in\_answer = len(final\_text)

citations.append({  
            "chunk\_id": int(chunk\_id\_str),  
            "sentences\_range": sent\_range,  
            "answer\_snippet": snippet,  
            "answer\_snippet\_start": start\_in\_answer,  
            "answer\_snippet\_end": end\_in\_answer  
        })

idx = match.end()

return {  
        "type": "text",  
        "text": final\_text,  
        "citations": citations  
    }

This function extracts and structures citations from the LLM response by identifying `<CIT>` tags using a regex pattern. It removes these tags from the final text while storing metadata like `chunk_id`, sentence range, and snippet position separately. The output is a dictionary with the cleaned response and a list of citations, enabling precise mapping of references for user-friendly display.

Step 4: Matching Cited Sentences and Finding Character Ranges
-------------------------------------------------------------

Once we have extracted citations from the LLM response, we need to match them back to the original text chunks. This step ensures that each reference in the answer corresponds accurately to its source. The function below looks up the cited `chunk_id` and `sentence range`, retrieves the relevant sentences from our indexed text, and records their exact character offsets. This allows us to display precise references without including irrelevant information.

################################################################################  
\# STEP 4: MATCH CITED SENTENCES + FIND CHAR RANGES IN CHUNK  
################################################################################def gather\_sentence\_data\_for\_citations(block: Dict\[str, Any\], sentence\_map: Dict\[int, List\[Dict\[str, Any\]\]\]) -\> Dict\[str, Any\]:  
    """  
    For each citation, parse the chunk\_id + sentences='X-Y'.  
    Gather the text of those sentences from 'sentence\_map\[chunk\_id\]'  
    and record their combined text plus start/end offsets in the chunk.  
    """  
    for c in block\["citations"\]:  
        c\_id = c\["chunk\_id"\]  
        sent\_range = c\["sentences\_range"\]  
        try:  
            start\_sent, end\_sent = map(int, sent\_range.split("-"))  
        except:  
            start\_sent, end\_sent = 1, 1

# get the sentence list for that chunk  
        sents\_for\_chunk = sentence\_map.get(c\_id, \[\])  
        # filter the range  
        relevant\_sents = \[s for s in sents\_for\_chunk if start\_sent <\= s\["sentence\_id"\] <\= end\_sent\]

if relevant\_sents:  
            combined\_text = " ".join(s\["text"\] for s in relevant\_sents)  
            chunk\_start\_char = relevant\_sents\[0\]\["start\_char"\]  
            chunk\_end\_char = relevant\_sents\[-1\]\["end\_char"\]  
        else:  
            combined\_text = ""  
            chunk\_start\_char = -1  
            chunk\_end\_char = -1

c\["chunk\_sentences\_text"\] = combined\_text  
        c\["chunk\_sentences\_start"\] = chunk\_start\_char  
        c\["chunk\_sentences\_end"\] = chunk\_end\_char

return block

################################################################################  
\# STEP 5: BUILD HTML FOR DISPLAY  
################################################################################

def build\_html\_for\_block(block: Dict\[str, Any\]) -\> str:  
    """  
    Build an HTML string that underlines each snippet in the final answer  
    and shows a tooltip with 'chunk\_sentences\_text' plus start/end offsets.  
    """  
    css = """  
    <style\>    body {  
      font-family: Arial, sans-serif;  
      margin: 20px;  
      line-height: 1.6;  
    }  
    .tooltip {  
      position: relative;  
      text-decoration: underline dotted;  
      cursor: help;  
    }  
    .tooltip .tooltiptext {  
      visibility: hidden;  
      width: 400px;  
      background: #f9f9f9;  
      color: #333;  
      text-align: left;  
      border: 1px solid #ccc;  
      border-radius: 4px;  
      padding: 10px;  
      position: absolute;  
      z-index: 1;  
      top: 125%;  
      left: 50%;  
      transform: translateX(-50%);  
      opacity: 0;  
      transition: opacity 0.3s;  
    }  
    .tooltip:hover .tooltiptext {  
      visibility: visible;  
      opacity: 1;  
    }    </style\>  
    """

full\_text = block\["text"\]  
    citations = sorted(block\["citations"\], key=lambda x: x\["answer\_snippet\_start"\])

html\_parts = \[f"<!DOCTYPE html\><html\><head\><meta charset\='UTF-8'\>{css}</head\><body\>"\]  
    cursor = 0

for cit in citations:  
        st = cit\["answer\_snippet\_start"\]  
        en = cit\["answer\_snippet\_end"\]

if st \> cursor:  
            html\_parts.append(full\_text\[cursor:st\])

snippet\_text = full\_text\[st:en\]

# Build tooltip with chunk sentences  
        tooltip\_html = f"""  
        <span class\="tooltip"\>  
          {snippet\_text}  
          <span class\="tooltiptext"\>  
            <strong\>Chunk ID:</strong\> {cit\["chunk\_id"\]}<br\>  
            <strong\>Sentence Range:</strong\> {cit\["sentences\_range"\]}<br\>  
            <strong\>Chunk Sentences Offset:</strong\> {cit\["chunk\_sentences\_start"\]}-{cit\["chunk\_sentences\_end"\]}<br\>  
            <strong\>Chunk Sentences Text:</strong\> {cit\["chunk\_sentences\_text"\]}  
          </span\>  
        </span\>  
        """  
        html\_parts.append(tooltip\_html)  
        cursor = en

if cursor < len(full\_text):  
        html\_parts.append(full\_text\[cursor:\])

html\_parts.append("</body\></html\>")  
    return "".join(html\_parts)

def display\_html\_block(block: Dict\[str, Any\]):  
    from IPython.display import display, HTML  
    html\_str = build\_html\_for\_block(block)  
    display(HTML(html\_str))

Why This Step Matters
---------------------

By linking each citation back to its exact sentence and character offsets, we ensure that the references displayed in the final answer are both **accurate and contextually relevant**. This prevents citations from being too broad or misleading, making the results more transparent and trustworthy.

Now that the references are structured correctly, the next step is to build a **visual representation** that allows users to interact with the citations.

2.6 Running the Pipeline
------------------------

Let’s put it all together. Let’s run our main function that does RAG with our query and displays the result.

  
def main(df, user\_query: str):  
    """  
    Full pipeline:  
      1) We'll parse each chunk into sentences.  
      2) We'll call openai with a robust system prompt for <CIT\> usage.  
      3) We'll parse the LLM's response for chunk\_id + sentences='X-Y'.  
      4) We'll gather the chunk sentences text, produce a final block with citations.  
      5) We'll build HTML and display in Colab.  
    """

sentence\_map = {}  
    chunk\_texts = \[\]  
    max\_chunk\_id = df\["chunk\_id"\].max()  
    for i, row in df.iterrows():  
        c\_id = row\["chunk\_id"\]  
        c\_txt = row\["text"\]  
          
        sents = parse\_chunk\_into\_sentences(c\_txt)  
        sentence\_map\[c\_id\] = sents  
          
          
          
          
        if len(chunk\_texts) <\= c\_id:  
            chunk\_texts.extend(\[""\]\*(c\_id - len(chunk\_texts)+1))  
        chunk\_texts\[c\_id\] = c\_txt

answer\_text = call\_openai\_with\_citations(chunk\_texts, user\_query)

block = parse\_response\_with\_sentence\_range(answer\_text)

block = gather\_sentence\_data\_for\_citations(block, sentence\_map)

print("----- JSON OUTPUT -----")  
    print(json.dumps({"content": \[block\]}, indent=2, ensure\_ascii=False))

display\_html\_block(block)

Now we get:

1.  The final consolidated answer from the LLM, minus the `<CIT>` tags in the displayed text.
2.  Underlined snippets (where `<CIT>` was) that show a tooltip with the chunk’s exact text.

![Image 7](https://miro.medium.com/v2/1*LeBjYPl0y7EPVStDkkPQqA.png)

Image source: author

As you can see, when we hover on a sentence, we can see the exact chunk it is citing, as well as the exact relevant sentences of that chunk to the RAG answer. We get an extreme amount of granularity, which means we can display the source text to the user without worrying about irrelevant information being displayed!

Although a lot of this code is for displaying the RAG answer with citations in a meaningful way, we end up with JSON that can be displayed much more easily in a web app:

![Image 8](https://miro.medium.com/v2/resize:fit:700/1*6AImsMKaM7xSNoNYDM_Qag.png)

Image source: author

3\. Why This Single-Pass, Inline Approach?
------------------------------------------

A common alternative is a two-step approach:

1.  Ask the model to produce the best final answer, no references.
2.  Pass that final answer plus the top chunks to the model again, asking “where did each piece come from?”

**Pros**: Possibly more accurate references.  
**Cons**: Double the LLM calls, more complicated parsing, and you might have to handle partial overlaps.

Anthropic likely uses a single-pass approach for Citations because it’s simpler, and if your model is well-trained, the references can still be quite accurate. _But you might see an occasional mismatch._ That’s life in RAG.

4\. Wrap-Up
-----------

We overcame the main limitation: Anthropic’s “don’t do it yourself” approach is great if you rely on Claude. But if you want to replicate it on GPT-4o or any other model, you can _absolutely_ do so by:

1.  **Chunking your text** at the sentence level (optional)
2.  **Telling the LLM** to label each snippet of the final answer with `<CIT>` tags referencing chunk ID + sentence range.
3.  **Parsing** that output and building an interactive UI.

Yes, this code is more complicated than toggling a single parameter in Anthropic’s API — and you’ll see edge cases. But it works with any LLM. One day, maybe OpenAI (or a library) will release official citations for GPT. Until then, you’ve got a blueprint for building your own.

**Happy citing!** If you have questions or run into interesting challenges, feel free to reach out. And if you would like cutting-edge RAG/LLM content injected regularly into your feed, follow me on [LinkedIn!](https://markdown-to-medium.surge.sh/linkedin.com/michael-ryaboy-software-engineer)
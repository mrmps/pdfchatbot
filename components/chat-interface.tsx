'use client';

import { useChat } from '@ai-sdk/react';
import { Send, User, Bot, MoreHorizontal, Search, FileText, ChevronDown, Layers, SplitSquareVertical, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { KeyboardEvent, useState, useEffect } from 'react';
import { MemoizedMarkdown } from '@/components/memoized-markdown';
import { getUserId } from '@/lib/user-id';

export function ChatInterface() {
  const [userId, setUserId] = useState<string>('');
  const [isUserIdLoaded, setIsUserIdLoaded] = useState(false);
  
  useEffect(() => {
    async function fetchUserId() {
      try {
        const id = await getUserId();
        setUserId(id);
        setIsUserIdLoaded(true);
      } catch (error) {
        console.error('Error fetching user ID:', error);
        setUserId('Error fetching user ID');
        setIsUserIdLoaded(true);
      }
    }
    
    fetchUserId();
  }, []);
  
  const { messages, input, handleInputChange, handleSubmit, status } = useChat({
    maxSteps: 3,
    body: {
      userId // Pass the user ID to the backend
    }
  });
  
  const isLoading = status === 'submitted' || status === 'streaming';
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  
  const toggleToolExpansion = (toolId: string) => {
    setExpandedTools(prev => ({
      ...prev,
      [toolId]: !prev[toolId]
    }));
  };
  
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // Allow shift+enter to create a new line
        return;
      } else {
        // Regular enter submits the form
        e.preventDefault();
        handleSubmit(e as unknown as React.FormEvent<HTMLFormElement>);
      }
    }
  };
  
  // Wait for the user ID to be loaded before rendering the chat interface
  if (!isUserIdLoaded) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
            <Bot className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="mt-4 text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-full">
      {process.env.NODE_ENV === 'development' && (
        <div className="bg-gray-100 p-2 text-xs text-gray-600 rounded mb-2">
          User ID: {userId}
        </div>
      )}
      <div className="flex flex-col min-w-0 gap-8 flex-1 overflow-y-auto pt-4 pb-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full space-y-4">
            <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
              <Bot className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">Chat with your PDFs</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm max-w-md text-center">
              Ask questions about your documents. Your documents are stored and indexed using KDB.AI for intelligent searching and retrieval.
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <div 
              key={m.id} 
              className="w-full mx-auto max-w-3xl px-4 group/message"
              data-role={m.role}
            >
              <div className="flex gap-4 w-full group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl group-data-[role=user]/message:w-fit">
                {m.role !== 'user' && (
                  <div className="size-8 flex items-center justify-center rounded-full shrink-0 bg-background ring-1 ring-border">
                    <Bot className="h-4 w-4 text-foreground" />
                  </div>
                )}
                <div className="flex flex-col gap-4 w-full">
                  <div className="flex flex-row gap-2 items-start">
                    <div 
                      className={cn(
                        m.role === 'user' 
                          ? "flex flex-col gap-4 rounded-3xl bg-[#EDEFF2] text-primary-foreground px-3 py-2 text-black" 
                          : "flex flex-col gap-4 prose dark:prose-invert max-w-3xl"
                      )}
                    >
                      {m.role === 'user' ? (
                        <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                      ) : (
                        <>
                          {/* Display search queries and results */}
                          {m.parts.some(part => part.type === 'tool-invocation') && (
                            <div className="mb-4 bg-muted/30 rounded-lg overflow-hidden border border-border/50">
                              {m.parts.map(part => 
                                part.type === 'tool-invocation' && part.toolInvocation.toolName === 'searchPdfs' && (
                                  <div key={part.toolInvocation.toolCallId}>
                                    <div className="flex items-center gap-2 p-3 border-b border-border/50 bg-muted/50">
                                      <Search className="h-4 w-4 text-muted-foreground" />
                                      <span className="text-sm font-medium">
                                        Searched for: <span className="text-foreground">{part.toolInvocation.args.query}</span>
                                      </span>
                                      
                                      {/* Search mode indicator */}
                                      {part.toolInvocation.args.searchMode && (
                                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted-foreground/10 text-muted-foreground flex items-center gap-1">
                                          {part.toolInvocation.args.searchMode === "individual" ? (
                                            <>
                                              <SplitSquareVertical className="h-3 w-3" />
                                              <span>Individual searches</span>
                                            </>
                                          ) : (
                                            <>
                                              <Layers className="h-3 w-3" />
                                              <span>Unified search</span>
                                            </>
                                          )}
                                        </span>
                                      )}
                                      
                                      <div className="ml-auto flex items-center gap-1">
                                        {part.toolInvocation.args.pdfNames ? (
                                          <span className="text-xs text-muted-foreground">
                                            {Array.isArray(part.toolInvocation.args.pdfNames) 
                                              ? (
                                                <span className="flex items-center">
                                                  <FileText className="h-3 w-3 mr-1" />
                                                  {part.toolInvocation.args.pdfNames.length > 1 
                                                    ? `${part.toolInvocation.args.pdfNames.length} documents` 
                                                    : part.toolInvocation.args.pdfNames[0]}
                                                </span>
                                              ) 
                                              : (
                                                <span className="flex items-center">
                                                  <FileText className="h-3 w-3 mr-1" />
                                                  {part.toolInvocation.args.pdfNames}
                                                </span>
                                              )}
                                          </span>
                                        ) : (
                                          <span className="text-xs text-muted-foreground flex items-center">
                                            <FileText className="h-3 w-3 mr-1" />
                                            All documents
                                          </span>
                                        )}
                                        
                                        {part.toolInvocation.state === 'result' && (
                                          <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="ml-1 h-6 px-2 text-xs"
                                            onClick={() => toggleToolExpansion(part.toolInvocation.toolCallId)}
                                          >
                                            <span>{expandedTools[part.toolInvocation.toolCallId] ? "Hide" : "Show"}</span>
                                            <ChevronDown className={cn(
                                              "h-3 w-3 ml-1 transition-transform", 
                                              expandedTools[part.toolInvocation.toolCallId] ? "rotate-180" : ""
                                            )} />
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                    
                                    {part.toolInvocation.state === 'result' && expandedTools[part.toolInvocation.toolCallId] && (
                                      <div className="max-h-[350px] overflow-y-auto p-3 text-sm bg-background/50">
                                        <div className="prose dark:prose-invert max-w-2xl prose-sm break-words">
                                          {/* Custom rendering for search results to show individual chunks */}
                                          {part.toolInvocation.result.includes('## From:') ? (
                                            <div className="space-y-4">
                                              {part.toolInvocation.result.split('## From:').filter(Boolean).map((pdfSection: string, pdfIndex: number) => {
                                                // Extract PDF name and chunks
                                                const pdfNameMatch = pdfSection.match(/^([^\n]+)/);
                                                const pdfName = pdfNameMatch ? pdfNameMatch[1].trim() : `Document ${pdfIndex + 1}`;
                                                // Split into individual chunks
                                                const chunks = pdfSection.split('### Chunk').filter((item: string, i: number) => i > 0);
                                                
                                                return (
                                                  <div key={pdfIndex} className="mb-4">
                                                    <div className="flex items-center gap-2 font-medium text-base mb-2 pb-1 border-b border-border/30">
                                                      <FileText className="h-4 w-4" />
                                                      <span>{pdfName}</span>
                                                    </div>
                                                    
                                                    <div className="space-y-3">
                                                      {chunks.map((chunk: string, chunkIndex: number) => {
                                                        // Extract page number if available
                                                        const pageMatch = chunk.match(/\(Page (\d+)\)/);
                                                        const pageNumber = pageMatch ? pageMatch[1] : null;
                                                        
                                                        // Extract the actual content (between the header and the separator)
                                                        const contentMatch = chunk.match(/(?:\(Page \d+\))?\s*\n\n([\s\S]+?)\n\n---/);
                                                        const content = contentMatch ? contentMatch[1].trim() : chunk.trim();
                                                        
                                                        return (
                                                          <div key={chunkIndex} className="bg-muted/30 rounded-md p-3 border border-border/20">
                                                            <div className="flex items-center justify-between mb-1 text-xs text-muted-foreground">
                                                              <span className="flex items-center gap-1">
                                                                <BookOpen className="h-3 w-3" />
                                                                <span>Chunk {chunkIndex + 1}</span>
                                                              </span>
                                                              {pageNumber && (
                                                                <span>Page {pageNumber}</span>
                                                              )}
                                                            </div>
                                                            <div className="text-sm mt-1">
                                                              <MemoizedMarkdown 
                                                                id={`${m.id}-pdf-${pdfIndex}-chunk-${chunkIndex}`} 
                                                                content={content} 
                                                              />
                                                            </div>
                                                          </div>
                                                        );
                                                      })}
                                                    </div>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          ) : (
                                            // Fallback for other result formats
                                            <MemoizedMarkdown 
                                              id={`${m.id}-tool-${part.toolInvocation.toolCallId}`} 
                                              content={part.toolInvocation.result} 
                                            />
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )
                              )}
                            </div>
                          )}
                          
                          {/* Display the actual message content */}
                          {m.content && (
                            <MemoizedMarkdown id={m.id} content={m.content} />
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="w-full mx-auto max-w-3xl px-4 group/message">
            <div className="flex gap-4 w-full">
              <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border bg-background">
                <div className="translate-y-px">
                  <Bot className="h-4 w-4" />
                </div>
              </div>
              <div className="flex items-center">
                <MoreHorizontal className="h-5 w-5 animate-pulse text-muted-foreground" />
              </div>
            </div>
          </div>
        )}
        <div className="shrink-0 min-w-[24px] min-h-[24px]"></div>
      </div>
      
      <form onSubmit={handleSubmit} className="sticky bottom-0 flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl">
        <div className="relative w-full flex flex-col gap-4">
          <textarea
            className="flex w-full border border-input px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm min-h-[24px] max-h-[calc(75dvh)] overflow-hidden resize-none rounded-2xl bg-muted pb-10 dark:border-zinc-700"
            placeholder="Ask about your documents..."
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            rows={2}
          />
          <div className="absolute bottom-0 right-0 p-2 w-fit flex flex-row justify-end">
            <Button 
              type="submit" 
              disabled={isLoading || !input.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full p-1.5 h-fit border dark:border-zinc-600"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

// Export with both names for backward compatibility
export { ChatInterface as Chat };
'use client';

import { useChat } from '@ai-sdk/react';
import { Send, Bot, MoreHorizontal, Search, FileText, ChevronDown, Layers, SplitSquareVertical, BookOpen, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { KeyboardEvent, useState, useEffect, useRef } from 'react';
import { MemoizedMarkdown } from '@/components/memoized-markdown';
import { getUserId } from '@/lib/user-id';

export function ChatInterface() {
  const [userId, setUserId] = useState<string>('');
  const [isUserIdLoaded, setIsUserIdLoaded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  
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
  
  const { messages, input, handleInputChange, handleSubmit, status, stop } = useChat({
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

  // Auto-resize textarea as content grows
  const adjustTextareaHeight = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const element = e.target;
    element.style.height = 'auto';
    // Limit height to 30% of viewport on mobile, 25% on larger screens
    const maxHeight = window.innerWidth < 640 ? window.innerHeight * 0.3 : window.innerHeight * 0.25;
    element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`;
  };
  
  useEffect(() => {
    // Reset textarea height when input is cleared
    if (input === '' && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages]);
  
  // Wait for the user ID to be loaded before rendering the chat interface
  if (!isUserIdLoaded) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
            <Bot className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="mt-3 sm:mt-4 text-sm sm:text-base text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {process.env.NODE_ENV === 'development' && (
        <div className="bg-gray-100 p-1.5 sm:p-2 text-xs text-gray-600 rounded mb-1.5 sm:mb-2 flex-shrink-0">
          User ID: {userId}
        </div>
      )}
      <div 
        ref={messagesRef}
        className="flex-1 overflow-y-auto -webkit-overflow-scrolling-touch touch-auto pb-4 px-3 md:px-4"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-3 sm:p-4 space-y-3 sm:space-y-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
              <Bot className="h-7 w-7 sm:h-8 sm:w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-base sm:text-lg font-medium text-center">Chat with your PDFs</p>
            <p className="text-gray-400 dark:text-gray-500 text-xs sm:text-sm max-w-[280px] sm:max-w-md text-center">
              Ask questions about your documents. Your documents are stored and indexed using <a href="https://kdb.ai" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">KDB.AI</a> for intelligent searching and retrieval.
            </p>
          </div>
        ) : (
          <div className="flex flex-col pt-4 gap-4">
            {messages.map((m) => (
              <div 
                key={m.id} 
                className="w-full mx-auto max-w-3xl group/message"
                data-role={m.role}
              >
                <div className="flex gap-2 sm:gap-3 w-full group-data-[role=user]/message:justify-end">
                  {m.role !== 'user' && (
                    <div className="size-6 sm:size-7 md:size-8 flex items-center justify-center rounded-full shrink-0 bg-background ring-1 ring-border">
                      <Bot className="h-3 sm:h-3.5 md:h-4 w-3 sm:w-3.5 md:w-4 text-foreground" />
                    </div>
                  )}
                  <div className={cn(
                    "flex flex-col gap-2",
                    m.role === 'user' ? "max-w-[85%] sm:max-w-[75%] md:max-w-2xl w-fit" : "w-full max-w-full"
                  )}>
                    <div className="flex flex-row gap-2 items-start">
                      <div 
                        className={cn(
                          m.role === 'user' 
                            ? "flex flex-col gap-1.5 sm:gap-2 rounded-2xl sm:rounded-3xl bg-[#EDEFF2] text-primary-foreground px-3 py-2 text-black break-words" 
                            : "flex flex-col gap-1.5 sm:gap-2 prose dark:prose-invert max-w-full overflow-hidden break-words"
                        )}
                      >
                        {m.role === 'user' ? (
                          <p className="whitespace-pre-wrap leading-relaxed text-sm">{m.content}</p>
                        ) : (
                          <>
                            {/* Display search queries and results */}
                            {m.parts.some(part => part.type === 'tool-invocation') && (
                              <div className="mb-3 bg-muted/30 rounded-lg overflow-hidden border border-border/50 text-sm">
                                {m.parts.map(part => 
                                  part.type === 'tool-invocation' && part.toolInvocation.toolName === 'searchPdfs' && (
                                    <div key={part.toolInvocation.toolCallId}>
                                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 p-2 sm:p-3 border-b border-border/50 bg-muted/50">
                                        <Search className="h-3 sm:h-3.5 w-3 sm:w-3.5 text-muted-foreground flex-shrink-0" />
                                        <span className="text-xs font-medium mr-auto">
                                          <span className="text-muted-foreground">Searched:</span> <span className="text-foreground line-clamp-1">{part.toolInvocation.args.query}</span>
                                        </span>
                                        
                                        {/* Mobile-optimized search mode indicator */}
                                        {part.toolInvocation.args.searchMode && (
                                          <span className="text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 rounded-full bg-muted-foreground/10 text-muted-foreground flex items-center gap-0.5 sm:gap-1 ml-auto sm:ml-0">
                                            {part.toolInvocation.args.searchMode === "individual" ? (
                                              <>
                                                <SplitSquareVertical className="h-2.5 sm:h-3 w-2.5 sm:w-3" />
                                                <span className="hidden xs:inline">Individual</span>
                                              </>
                                            ) : (
                                              <>
                                                <Layers className="h-2.5 sm:h-3 w-2.5 sm:w-3" />
                                                <span className="hidden xs:inline">Unified</span>
                                              </>
                                            )}
                                          </span>
                                        )}
                                        
                                        <div className="flex flex-shrink-0 items-center gap-1">
                                          {part.toolInvocation.args.pdfNames ? (
                                            <span className="text-[10px] sm:text-xs text-muted-foreground flex items-center">
                                              {Array.isArray(part.toolInvocation.args.pdfNames) 
                                                ? (
                                                  <span className="flex items-center">
                                                    <FileText className="h-2.5 sm:h-3 w-2.5 sm:w-3 mr-0.5 sm:mr-1" />
                                                    {part.toolInvocation.args.pdfNames.length > 1 
                                                      ? `${part.toolInvocation.args.pdfNames.length} docs` 
                                                      : part.toolInvocation.args.pdfNames[0]}
                                                  </span>
                                                ) 
                                                : (
                                                  <span className="flex items-center">
                                                    <FileText className="h-2.5 sm:h-3 w-2.5 sm:w-3 mr-0.5 sm:mr-1" />
                                                    {part.toolInvocation.args.pdfNames}
                                                  </span>
                                                )}
                                            </span>
                                          ) : part.toolInvocation.args.pdfIds ? (
                                            <span className="text-[10px] sm:text-xs text-muted-foreground flex items-center">
                                              <FileText className="h-2.5 sm:h-3 w-2.5 sm:w-3 mr-0.5 sm:mr-1" />
                                              {Array.isArray(part.toolInvocation.args.pdfIds) 
                                                ? `${part.toolInvocation.args.pdfIds.length} specific docs` 
                                                : '1 specific doc'}
                                            </span>
                                          ) : (
                                            <span className="text-[10px] sm:text-xs text-muted-foreground flex items-center">
                                              <FileText className="h-2.5 sm:h-3 w-2.5 sm:w-3 mr-0.5 sm:mr-1" />
                                              All docs
                                            </span>
                                          )}
                                          
                                          {part.toolInvocation.state === 'result' && (
                                            <Button 
                                              variant="ghost" 
                                              size="sm" 
                                              className="h-5 sm:h-6 px-1.5 sm:px-2 text-[10px] sm:text-xs"
                                              onClick={() => toggleToolExpansion(part.toolInvocation.toolCallId)}
                                            >
                                              <span>{expandedTools[part.toolInvocation.toolCallId] ? "Hide" : "Show"}</span>
                                              <ChevronDown className={cn(
                                                "h-2.5 sm:h-3 w-2.5 sm:w-3 ml-0.5 sm:ml-1 transition-transform", 
                                                expandedTools[part.toolInvocation.toolCallId] ? "rotate-180" : ""
                                              )} />
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                      
                                      {part.toolInvocation.state === 'result' && expandedTools[part.toolInvocation.toolCallId] && (
                                        <div className="max-h-[200px] sm:max-h-[250px] md:max-h-[350px] overflow-y-auto p-2 sm:p-3 text-xs sm:text-sm bg-background/50">
                                          <div className="prose dark:prose-invert max-w-full prose-sm sm:prose-base break-words">
                                            {/* Custom rendering for search results to show individual chunks */}
                                            {part.toolInvocation.result.includes('## From:') ? (
                                              <div className="space-y-2 sm:space-y-3 md:space-y-4">
                                                {part.toolInvocation.result.split('## From:').filter(Boolean).map((pdfSection: string, pdfIndex: number) => {
                                                  // Extract PDF name and chunks
                                                  const pdfNameMatch = pdfSection.match(/^([^\n]+)/);
                                                  const pdfName = pdfNameMatch ? pdfNameMatch[1].trim() : `Document ${pdfIndex + 1}`;
                                                  // Split into individual chunks
                                                  const chunks = pdfSection.split('### Chunk').filter((item: string, i: number) => i > 0);
                                                  
                                                  return (
                                                    <div key={pdfIndex} className="mb-2 sm:mb-3 md:mb-4">
                                                      <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2 font-medium text-xs sm:text-sm mb-1.5 sm:mb-2 pb-1 border-b border-border/30">
                                                        <FileText className="h-3 sm:h-3.5 md:h-4 w-3 sm:w-3.5 md:w-4" />
                                                        <span className="truncate">{pdfName}</span>
                                                      </div>
                                                      
                                                      <div className="space-y-1.5 sm:space-y-2 md:space-y-3">
                                                        {chunks.map((chunk: string, chunkIndex: number) => {
                                                          // Extract the actual content (between the header and the separator)
                                                          const contentMatch = chunk.match(/\s*\n\n([\s\S]+?)\n\n---/);
                                                          const content = contentMatch ? contentMatch[1].trim() : chunk.trim();
                                                          
                                                          return (
                                                            <div key={chunkIndex} className="bg-muted/30 rounded-md p-1.5 sm:p-2 md:p-3 border border-border/20">
                                                              <div className="flex items-center justify-between mb-0.5 sm:mb-1 text-[10px] sm:text-xs text-muted-foreground">
                                                                <span className="flex items-center gap-0.5 sm:gap-1">
                                                                  <BookOpen className="h-2.5 sm:h-3 w-2.5 sm:w-3" />
                                                                  <span>Chunk {chunkIndex + 1}</span>
                                                                </span>
                                                              </div>
                                                              <div className="text-[11px] xs:text-xs sm:text-sm mt-0.5 sm:mt-1 break-words">
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
                              <div className="text-xs xs:text-sm sm:text-base">
                                <MemoizedMarkdown id={m.id} content={m.content} />
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="w-full mx-auto max-w-3xl">
                <div className="flex gap-2 sm:gap-3 w-full">
                  <div className="size-6 sm:size-7 md:size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border bg-background">
                    <div className="translate-y-px">
                      <Bot className="h-3 sm:h-3.5 md:h-4 w-3 sm:w-3.5 md:w-4" />
                    </div>
                  </div>
                  <div className="flex items-center">
                    <MoreHorizontal className="h-3.5 sm:h-4 md:h-5 w-3.5 sm:w-4 md:w-5 animate-pulse text-muted-foreground" />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      <form 
        onSubmit={handleSubmit} 
        className="flex-shrink-0 border-t border-border/40 bg-background px-3 md:px-4 py-3 sticky bottom-0 left-0 right-0 z-10"
      >
        <div className="relative max-w-3xl mx-auto w-full">
          <textarea
            ref={textareaRef}
            className="flex w-full border border-input px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[42px] resize-none rounded-xl bg-muted pb-8 overflow-y-auto"
            placeholder="Ask about your documents..."
            value={input}
            onChange={(e) => {
              handleInputChange(e);
              adjustTextareaHeight(e);
            }}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            rows={1}
          />
          <div className="absolute bottom-0 right-0 p-1.5 w-fit">
            <Button 
              type={isLoading ? "button" : "submit"}
              onClick={isLoading ? stop : undefined}
              disabled={isLoading ? false : !input.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full p-1 sm:p-1.5 h-fit border dark:border-zinc-600"
              aria-label={isLoading ? "Stop generating" : "Send message"}
            >
              {isLoading ? <Square className="h-3.5 sm:h-4 w-3.5 sm:w-4" /> : <Send className="h-3.5 sm:h-4 w-3.5 sm:w-4" />}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

// Export with both names for backward compatibility
export { ChatInterface as Chat };
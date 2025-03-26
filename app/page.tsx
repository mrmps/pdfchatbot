"use client";

import { useState } from "react";
import { FileUpload } from "@/components/file-upload";
import { Chat } from "@/components/chat-interface";
import { Button } from "@/components/ui/button";
import { Upload, FileTextIcon, GithubIcon } from "lucide-react";
import { PdfViewerDialog } from "@/components/pdf-viewer-dialog";
import Image from "next/image";
import {
  Credenza,
  CredenzaContent,
  CredenzaHeader,
  CredenzaTitle,
  CredenzaTrigger,
} from "@/components/ui/credenza";

export default function Home() {
  const [viewingContent, setViewingContent] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);

  return (
    <div className="flex flex-col h-[100dvh]">
      <header className="border-b border-border/40 bg-background/95 z-10 flex-shrink-0">
        <div className="max-w-[1440px] mx-auto w-full flex items-center justify-between h-14 sm:h-16 px-4 md:px-6">
          <div className="flex items-center gap-3">
            <div className="h-6 sm:h-7 flex-shrink-0">
              <Image
                src="/kdbai.png"
                alt="KDB.AI Logo"
                width={100}
                height={28}
                // REMOVED previous light:/dark:/invert classes unless specifically needed for dark mode
                // ADDED light mode drop shadow:
                className="h-full w-auto object-contain bg-zinc-800 p-1 rounded-lg light:drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)]" // Adjust alpha (0.3) or blur/offset as needed
                priority
              />
            </div>
            <span className="hidden sm:inline text-sm text-muted-foreground/80">
              PDF Chat
            </span>
          </div>

          <div className="flex gap-2 sm:gap-3 items-center">
            <Credenza open={uploadingPdf} onOpenChange={setUploadingPdf}>
              <CredenzaTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 sm:h-9 text-xs sm:text-sm font-normal gap-1.5"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span className="hidden xs:inline">Upload</span>
                  <span className="xs:hidden">PDF</span>
                </Button>
              </CredenzaTrigger>
              <CredenzaContent className="sm:max-w-[550px] p-0 overflow-hidden rounded-lg border-border">
                <CredenzaHeader className="p-4 sm:p-5 border-b border-border/50">
                  <CredenzaTitle className="text-lg font-medium">
                    Upload PDFs
                  </CredenzaTitle>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1.5">
                    Select PDF files to upload and process for searching and
                    analysis.
                  </p>
                </CredenzaHeader>
                <div className="p-4 sm:p-5">
                  <FileUpload onUploadComplete={() => setUploadingPdf(false)} />
                </div>
              </CredenzaContent>
            </Credenza>

            <Button
              variant="outline"
              size="sm"
              className="h-8 sm:h-9 text-xs sm:text-sm font-normal gap-1.5"
              onClick={() => setViewingContent(true)}
            >
              <FileTextIcon className="h-3.5 w-3.5" />
              <span className="hidden xs:inline">View</span>
              <span className="xs:hidden">Library</span>
            </Button>

            <Button
              variant="default"
              size="sm"
              className="h-8 sm:h-9 text-xs sm:text-sm font-normal gap-1.5 bg-black hover:bg-zinc-800 text-white"
              onClick={() =>
                window.open("https://github.com/mrmps/pdfchatbot", "_blank")
              }
            >
              <GithubIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Star on GitHub</span>
              <span className="sm:hidden">Star</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 relative">
        <div className="absolute inset-0 max-w-[1440px] mx-auto">
          <Chat />
        </div>
      </main>

      <PdfViewerDialog open={viewingContent} onOpenChange={setViewingContent} />
    </div>
  );
}

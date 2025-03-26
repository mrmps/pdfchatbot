"use client"

import { useState } from "react"
import { FileUpload } from "@/components/file-upload"
import { Chat } from "@/components/chat-interface"
import { Button } from "@/components/ui/button"
import { Upload, FileText, Github } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { PdfViewerDialog } from "@/components/pdf-viewer-dialog"
import Image from "next/image"
import {
  Credenza,
  CredenzaContent,
  CredenzaHeader,
  CredenzaTitle,
  CredenzaTrigger
} from "@/components/ui/credenza"

export default function Home() {
  const [viewingContent, setViewingContent] = useState(false)
  const [uploadingPdf, setUploadingPdf] = useState(false)

  return (
    <div className="h-screen flex flex-col">
      {/* Header with buttons */}
      <header className="border-b p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Image src="/kdbai.png" alt="KDB AI Logo" width={100} height={100} />
          <Badge variant="secondary" className="px-3 py-1 text-sm font-medium">
            PDF Chat
          </Badge>
        </div>
        <div className="flex gap-2">
          <Credenza open={uploadingPdf} onOpenChange={setUploadingPdf}>
            <CredenzaTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Upload PDFs
              </Button>
            </CredenzaTrigger>
            <CredenzaContent className="sm:max-w-[500px]">
              <CredenzaHeader>
                <CredenzaTitle>Upload PDFs</CredenzaTitle>
              </CredenzaHeader>
              <div className="py-4 px-4 sm:px-6">
                <p className="text-sm text-muted-foreground mb-4">
                  Select PDF files to upload. After selecting files, click &ldquo;Process Selected PDFs&rdquo; to extract their content.
                </p>
                <FileUpload onUploadComplete={() => setUploadingPdf(false)} />
              </div>
            </CredenzaContent>
          </Credenza>

          <Button variant="outline" className="flex items-center gap-2" onClick={() => setViewingContent(true)}>
            <FileText className="h-4 w-4" />
            View PDF Content
          </Button>

          <Button 
            variant="default" 
            className="flex items-center gap-2 bg-black hover:bg-gray-800 text-white" 
            onClick={() => window.open("https://github.com/mrmps/pdfchatbot", "_blank")}
          >
            <Github className="h-5 w-5" />
            Star on GitHub
          </Button>
        </div>
      </header>

      {/* Full-screen chat */}
      <div className="flex-1 overflow-hidden">
        <Chat />
      </div>

      {/* PDF Viewer Dialog */}
      <PdfViewerDialog open={viewingContent} onOpenChange={setViewingContent} />
    </div>
  )
}

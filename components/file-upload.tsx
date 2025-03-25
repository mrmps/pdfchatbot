"use client"

import type React from "react"
import { useState, useRef } from "react"
import { Upload, File, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { uploadPdf } from "@/lib/actions"

interface FileUploadProps {
  onUploadComplete: (files?: File[]) => void
}

export function FileUpload({ onUploadComplete }: FileUploadProps) {
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadComplete, setUploadComplete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      // Limit to 3 files
      const selectedFiles = Array.from(e.target.files).slice(0, 3)
      setFiles(selectedFiles)
      setError(null) // Clear any previous errors
      
      if (e.target.files.length > 3) {
        setError("Only the first 3 PDFs will be processed")
      }
    }
  }

  const handleBrowseClick = () => {
    // Programmatically click the hidden file input
    fileInputRef.current?.click()
  }

  const handleUpload = async () => {
    if (files.length === 0) return

    setUploading(true)
    setProgress(0)
    setUploadComplete(false)
    setError(null)

    try {
      // Create FormData to send files
      const formData = new FormData()
      files.forEach((file) => {
        formData.append("files", file)
      })

      // Start progress animation
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            return 90 // Cap at 90% until we get confirmation
          }
          return prev + (90 - prev) * 0.1 // Gradually approach 90%
        })
      }, 500)

      // Upload files
      const result = await uploadPdf(formData)

      // Clear the interval
      clearInterval(interval)

      if (result.success) {
        setProgress(100)
        setUploadComplete(true)

        // Reset after 2 seconds
        setTimeout(() => {
          setFiles([])
          setUploading(false)
          setProgress(0)
          setUploadComplete(false)

          // Call the callback if provided
          if (onUploadComplete) {
            onUploadComplete(files)
          }
        }, 2000)
      } else {
        setError(result.error || "Upload failed")
        setUploading(false)
        setProgress(0)
      }
    } catch (error) {
      console.error("Upload failed:", error)
      setError("Upload failed: " + (error instanceof Error ? error.message : String(error)))
      setUploading(false)
      setProgress(0)
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // Filter for PDF files only
      const pdfFiles = Array.from(e.dataTransfer.files)
        .filter((file) => file.type === "application/pdf")
        .slice(0, 3) // Limit to 3 files

      if (pdfFiles.length > 0) {
        setFiles(pdfFiles)
        setError(null)
        
        if (e.dataTransfer.files.length > 3) {
          setError("Only the first 3 PDFs will be processed")
        }
      } else {
        setError("Please drop PDF files only")
      }
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <div className="space-y-4">
      {/* Hidden file input */}
      <input
        type="file"
        multiple
        accept=".pdf"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        disabled={uploading}
      />

      {/* Drop area or file list */}
      {files.length === 0 ? (
        <div
          className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={handleBrowseClick}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <Upload className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-2 text-sm text-gray-600">Drag and drop your PDFs here or click to browse</p>
          <p className="mt-1 text-xs text-gray-500">Upload up to three PDFs at a time</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Selected files:</p>
          </div>
          <ul className="space-y-1 max-h-40 overflow-y-auto border rounded-md p-2">
            {files.map((file, index) => (
              <li key={index} className="flex items-center text-sm">
                <File className="h-4 w-4 mr-2 flex-shrink-0" />
                <span className="truncate">{file.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-600 text-sm">{error}</div>}

      {uploading && (
        <div className="space-y-2">
          <Progress value={progress} className="h-2 w-full" />
          <p className="text-sm text-gray-600 text-center">
            {uploadComplete ? "Upload complete!" : "Processing files with PyPDF2 (use LlamaParse/Chunkr for better results)"}
          </p>
        </div>
      )}

      <Button onClick={handleUpload} disabled={files.length === 0 || uploading} className="w-full">
        {uploading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : (
          "Process Selected PDFs"
        )}
      </Button>
    </div>
  )
}


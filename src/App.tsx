import React, { useState, useRef } from 'react';
import { UploadCloud, File, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, FileText, Download } from 'lucide-react';
import { saveAs } from 'file-saver';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import jsPDF from 'jspdf';

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);
  const [expandedSection, setExpandedSection] = useState<'summary' | 'payload' | null>('summary');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownload = async () => {
    if (!result || !result.data) return;
    const content = result.data.converted_output_payload || '';
    
    if (result.detected_input_type === 'pdf') {
      const paragraphs = content.split('\n').map((line: string) => {
        return new Paragraph({
          children: [new TextRun(line)],
        });
      });
  
      const doc = new Document({
        sections: [{
          properties: {},
          children: paragraphs,
        }],
      });
  
      const blob = await Packer.toBlob(doc);
      saveAs(blob, "Generated_Output.docx");
    } else if (result.detected_input_type === 'docx') {
      const doc = new jsPDF();
      const splitText = doc.splitTextToSize(content, 180);
      let y = 10;
      for (let i = 0; i < splitText.length; i++) {
          if (y > 280) {
              doc.addPage();
              y = 10;
          }
          doc.text(splitText[i], 10, y);
          y += 7;
      }
      doc.save("Generated_Output.pdf");
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const validateAndSetFile = (selectedFile: File) => {
    setError(null);
    setResult(null);
    const validExtensions = ['.pdf', '.doc', '.docx'];
    const hasValidExtension = validExtensions.some(ext => 
      selectedFile.name.toLowerCase().endsWith(ext)
    );

    if (!hasValidExtension) {
      setError("ERROR: Unsupported file format. Please upload a PDF or Word document.");
      setFile(null);
      return;
    }

    setFile(selectedFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleProcess = async () => {
    if (!file) return;

    setIsProcessing(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/process', {
        method: 'POST',
        body: formData,
      });

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const textData = await response.text();
        console.error("Non-JSON response received:", textData);
        throw new Error(`Server returned an invalid format or timed out. Status: ${response.status}`);
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Server processing failed.');
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-[#e0e0e0] font-sans p-6 md:p-12">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="space-y-2 border-b border-[#1a1a1a] pb-6 mb-8">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 border border-[#c5a47e] flex items-center justify-center rotate-45 shrink-0">
              <div className="w-4 h-4 bg-[#c5a47e] rotate-45"></div>
            </div>
            <div>
              <h1 className="text-xl font-serif tracking-[0.2em] uppercase text-[#c5a47e]">Document Automation Workflow</h1>
              <p className="text-[10px] tracking-[0.3em] uppercase opacity-50 text-[#e0e0e0]">
                Deterministic processing for PDF and Word documents based on automated route logic.
              </p>
            </div>
          </div>
        </header>

        {/* Upload Zone */}
        <section 
          className={`border border-[#222] p-8 transition-colors duration-200 text-center cursor-pointer ${
            isDragging ? 'border-[#c5a47e] bg-[#080808]' : 'bg-[#0c0c0c] hover:border-[#444]'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={triggerFileInput}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            className="hidden" 
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          />
          <div className="flex flex-col items-center space-y-4">
            <div className="p-4 bg-[#1a1a1a] text-[#c5a47e] border border-[#222]">
              <UploadCloud className="w-8 h-8" />
            </div>
            <div>
              <p className="text-sm font-serif mb-1 text-[#e0e0e0]">Click to upload or drag and drop</p>
              <p className="text-[10px] font-mono text-[#c5a47e] opacity-80 uppercase tracking-widest mt-1">PDF (.pdf) or Word (.doc, .docx) formats only</p>
            </div>
          </div>
        </section>

        {/* Selected File & Action */}
        {file && (
          <div className="bg-[#0c0c0c] p-4 border border-[#222] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-3 overflow-hidden">
              <div className="p-2 bg-[#1a1a1a] text-[#c5a47e] border border-[#222] shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="truncate">
                <p className="text-sm font-serif text-[#e0e0e0] truncate">{file.name}</p>
                <p className="text-[10px] font-mono text-[#c5a47e] opacity-80 uppercase tracking-widest mt-0.5">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            </div>
            <button
              onClick={handleProcess}
              disabled={isProcessing}
              className={`shrink-0 px-6 py-2.5 border text-[10px] tracking-[0.3em] uppercase transition-colors ${
                isProcessing 
                  ? 'border-[#444] text-[#444] cursor-not-allowed' 
                  : 'border-[#c5a47e] text-[#c5a47e] hover:bg-[#c5a47e] hover:text-[#050505]'
              }`}
            >
              {isProcessing ? 'Executing Logic...' : 'Execute Processing Pipeline'}
            </button>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-[#110505] border border-red-900 text-red-500 p-4 flex items-start space-x-3 text-sm font-serif">
            <AlertCircle className="w-5 h-5 mt-0.5 shrink-0 text-red-600" />
            <p>{error}</p>
          </div>
        )}

        {/* Success Output */}
        {result && (
          <div className="space-y-6">
            <div className="bg-[#051105] border border-emerald-900 p-4 flex items-center space-x-3 text-emerald-400">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <p className="text-[11px] font-mono tracking-widest">{result.status.toUpperCase()} / PROCESSING COMPLETE</p>
                <p className="text-[10px] font-mono opacity-80 mt-1 uppercase tracking-widest text-[#888]">DETECTED_ROUTE: {result.detected_input_type.toUpperCase()} PIPELINE</p>
              </div>
            </div>

            <div className="bg-[#080808] border border-[#1a1a1a] overflow-hidden">
              <div className="p-4 border-b border-[#1a1a1a] flex justify-between items-center bg-[#050505]">
                <span className="text-[10px] uppercase tracking-[0.2em] font-semibold text-[#e0e0e0]">JSON Payload</span>
              </div>
              <div className="p-4 overflow-x-auto bg-[#080808]">
                <pre className="font-mono text-[11px] leading-relaxed text-[#c5a47e]">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            </div>

            {/* Viewer */}
            <div className="bg-[#080808] border border-[#1a1a1a] overflow-hidden">
              <div className="flex border-b border-[#1a1a1a] bg-[#050505]">
                <button
                  onClick={() => setExpandedSection('summary')}
                  className={`flex-1 py-3 px-4 transition-colors ${
                    expandedSection === 'summary' 
                      ? 'text-[#c5a47e] border-b border-[#c5a47e] bg-[#080808] text-[10px] uppercase tracking-[0.2em] font-semibold' 
                      : 'text-[10px] uppercase tracking-[0.2em] font-semibold text-[#888] hover:text-[#e0e0e0] hover:bg-[#111]'
                  }`}
                >
                  Deliverable 1: Summary
                </button>
                <button
                  onClick={() => setExpandedSection('payload')}
                  className={`flex-1 py-3 px-4 transition-colors ${
                    expandedSection === 'payload' 
                      ? 'text-[#c5a47e] border-b border-[#c5a47e] bg-[#080808] text-[10px] uppercase tracking-[0.2em] font-semibold' 
                      : 'text-[10px] uppercase tracking-[0.2em] font-semibold text-[#888] hover:text-[#e0e0e0] hover:bg-[#111]'
                  }`}
                >
                  Deliverable 2: Converted Content
                </button>
              </div>
              <div className="p-6 md:p-8">
                {expandedSection === 'summary' && (
                  <div className="text-sm font-serif leading-relaxed text-[#e0e0e0]">
                    <pre className="whitespace-pre-wrap font-serif text-[#a0a0a0] bg-[#050505] p-6 border border-[#1a1a1a]">{result.data.summary}</pre>
                  </div>
                )}
                {expandedSection === 'payload' && (
                  <div className="space-y-4">
                    <div className="flex justify-start border-b border-[#1a1a1a] pb-4 mb-4">
                      <button
                        onClick={handleDownload}
                        className="flex items-center space-x-2 px-6 py-2 border border-[#c5a47e] text-[#c5a47e] text-[10px] tracking-[0.3em] uppercase hover:bg-[#c5a47e] hover:text-[#050505] transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        <span>Download .{result.detected_input_type === 'pdf' ? 'DOCX' : 'PDF'}</span>
                      </button>
                    </div>
                    <div className="text-sm font-serif leading-relaxed text-[#e0e0e0]">
                      <pre className="whitespace-pre-wrap font-serif text-[#a0a0a0] bg-[#050505] p-6 border border-[#1a1a1a]">{result.data.converted_output_payload}</pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

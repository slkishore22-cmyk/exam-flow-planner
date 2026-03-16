import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { extractRollNumbersFromPdf, PdfExtractionResult } from '@/lib/seating-utils';

interface UploadScreenProps {
  onComplete: (results: PdfExtractionResult[], files: File[]) => void;
  initialFiles?: File[];
}

const UploadScreen: React.FC<UploadScreenProps> = ({ onComplete, initialFiles = [] }) => {
  const [files, setFiles] = useState<File[]>(initialFiles);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState('');

  const handleFiles = useCallback((newFiles: FileList | File[]) => {
    const pdfs = Array.from(newFiles).filter(f => f.type === 'application/pdf');
    setFiles(prev => [...prev, ...pdfs]);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleExtract = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    const results: PdfExtractionResult[] = [];

    for (const file of files) {
      try {
        const result = await extractRollNumbersFromPdf(file, (page, total, name) => {
          setProgress(`Reading page ${page} of ${total} from ${name}...`);
        });
        results.push(result);
      } catch (err) {
        console.error(`Error processing ${file.name}:`, err);
      }
    }

    setIsProcessing(false);
    onComplete(results, files);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <h1 className="text-5xl font-bold tracking-tight mb-2">Vin-C</h1>
      <p className="text-muted-foreground mb-12">Seating Arrangement</p>

      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`w-full max-w-xl border-2 border-dashed rounded-2xl p-16 text-center transition-all cursor-pointer ${
          isDragging ? 'border-accent bg-gold-light' : 'border-border'
        }`}
        onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.pdf';
          input.multiple = true;
          input.onchange = (e) => {
            const target = e.target as HTMLInputElement;
            if (target.files) handleFiles(target.files);
          };
          input.click();
        }}
      >
        <div className="text-4xl mb-4">📄</div>
        <p className="text-lg font-medium mb-1">Drop your PDF files here</p>
        <p className="text-sm text-muted-foreground">
          Upload all subject PDFs for this exam date
        </p>
      </div>

      {files.length > 0 && (
        <div className="mt-6 w-full max-w-xl">
          <p className="text-sm text-muted-foreground mb-2">{files.length} file{files.length > 1 ? 's' : ''} selected</p>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {files.map((f, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-1 px-3 bg-secondary rounded-lg">
                <span className="truncate">{f.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setFiles(prev => prev.filter((_, idx) => idx !== i));
                  }}
                  className="text-muted-foreground hover:text-foreground ml-2"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {isProcessing && (
        <p className="mt-6 text-sm text-muted-foreground animate-pulse-gentle">{progress}</p>
      )}

      <Button
        className="mt-8 px-12 h-12 text-base rounded-xl"
        disabled={files.length === 0 || isProcessing}
        onClick={handleExtract}
      >
        {isProcessing ? 'Extracting...' : 'Extract Roll Numbers'}
      </Button>
    </div>
  );
};

export default UploadScreen;

import express from 'express';
import path from 'path';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import mammoth from 'mammoth';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // File Upload API
  app.post('/api/process', upload.single('file'), async (req, res) => {
    try {
      if (!req.file || req.file.size === 0) {
        res.status(400).json({ error: 'ERROR: Unable to parse document data.' });
        return;
      }

      let ai: GoogleGenAI;
      try {
        if (!process.env.GEMINI_API_KEY) {
          throw new Error('Missing API Key');
        }
        ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      } catch (err) {
        res.status(500).json({ error: 'Gemini API is not configured on the server.' });
        return;
      }

      const fileBuffer = req.file.buffer;
      const originalName = req.file.originalname.toLowerCase();
      let fileType = '';

      if (originalName.endsWith('.pdf') || req.file.mimetype === 'application/pdf') {
        fileType = 'pdf';
      } else if (
        originalName.endsWith('.docx') ||
        originalName.endsWith('.doc') ||
        req.file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        req.file.mimetype === 'application/msword'
      ) {
        fileType = 'docx';
      } else {
        res.status(400).json({ error: 'ERROR: Unsupported file format. Please upload a PDF or Word document.' });
        return;
      }

      // Initialize the parts array for the Gemini API call
      const promptParts: any[] = [];
      let systemPrompt = '';

      if (fileType === 'pdf') {
        // PDF processing route A
        promptParts.push({
          inlineData: {
            mimeType: 'application/pdf',
            data: fileBuffer.toString('base64'),
          },
        });
        
        systemPrompt = `You are a deterministic, production-grade Automation AI Agent acting on Route A (PDF Document).
Extract all text and semantic structure from the PDF.
OUTPUT_DELIVERABLES MUST BE IN THIS EXACT JSON FORMAT:
{
  "summary": "An Executive Summary in Markdown: 3-5 Key Bullet Points, followed by a 100-word core synthesis.",
  "converted_output_payload": "The extracted content formatted as a clean Microsoft Word (.docx) compatible text structure, preserving headings, bullet points, and paragraph breaks."
}`;
      } else {
        // DOCX processing route B
        try {
          // Extract text from DOCX
          const result = await mammoth.extractRawText({ buffer: fileBuffer });
          const extractedText = result.value;

          if (!extractedText || extractedText.trim() === '') {
            res.status(400).json({ error: 'ERROR: Unable to parse document data.' });
            return;
          }

          promptParts.push({ text: extractedText });
          
          systemPrompt = `You are a deterministic, production-grade Automation AI Agent acting on Route B (Word Document).
Read the provided extracted text from the Word document.
OUTPUT_DELIVERABLES MUST BE IN THIS EXACT JSON FORMAT:
{
  "summary": "A Comprehensive Summary in Markdown: Overview, Key Findings, and Action Items/Takeaways.",
  "converted_output_payload": "The entire original content formatted into a standard PDF-ready layout structure (using strict markdown that maps to PDF generation engines)."
}`;
        } catch (docxErr) {
          console.error("DOCX extraction error:", docxErr);
          res.status(400).json({ error: 'ERROR: Unable to parse document data.' });
          return;
        }
      }

      promptParts.push({ text: 'Generate the results exactly according to the requested JSON format.' });

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          { role: 'user', parts: promptParts }
        ],
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
          responseSchema: {
            type: "object",
            properties: {
              summary: {
                type: "string",
                description: "The summary in Markdown format."
              },
              converted_output_payload: {
                type: "string",
                description: "The converted document structure/content."
              }
            },
            required: ["summary", "converted_output_payload"]
          },
          temperature: 0.2
        }
      });

      const responseText = response.text || "{}";
      let parsedOutput;
      try {
        let cleanText = responseText.trim();
        // Fallback for incomplete JSON if cut off
        if (cleanText === "{" || cleanText === "") {
           cleanText = '{"summary": "Error: Document generation truncated.", "converted_output_payload": "Unable to process completely."}';
        }
        if (cleanText.startsWith('```json')) {
          cleanText = cleanText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
        } else if (cleanText.startsWith('```')) {
          cleanText = cleanText.replace(/^```\n?/, '').replace(/\n?```$/, '');
        }
        
        // Attempt to fix simple truncation
        if (!cleanText.endsWith('}')) {
          if (!cleanText.endsWith('"')) {
            cleanText += '"';
          }
          cleanText += '}';
        }

        parsedOutput = JSON.parse(cleanText.trim());
      } catch (parseErr) {
        console.error("Failed to parse Gemini output:", responseText);
        throw new Error("Invalid output format generated by AI. It may be too large to process.");
      }

      res.status(200).json({
        detected_input_type: fileType,
        status: 'success',
        data: {
          summary: parsedOutput.summary,
          converted_output_payload: parsedOutput.converted_output_payload,
        }
      });

    } catch (error: any) {
      console.error('Processing error:', error);
      res.status(500).json({ error: error.message || 'An internal server error occurred.' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Global error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled server error:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();

import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const ai = new GoogleGenAI({});
  const res = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: 'Say hello in JSON formatted as {"message": "hello"}'
  });
  console.log("res.text:", typeof res.text, res.text);
}
run().catch(console.error);

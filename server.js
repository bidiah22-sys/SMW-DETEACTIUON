import express from 'express';
import { GoogleGenAI } from '@google/genai';

const app = express();
app.use(express.json());

// Initialize Google Gemini AI with Environment Variable
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Health check route to ensure the server is online
app.get('/', (req, res) => {
    res.status(200).send("⚡ SMW J.A.R.V.I.S. Cloud Brain is Online & 24x7 Active!");
});

// Main endpoint to handle voice and text prompts from your Android device
app.post('/api/command', async (req, res) => {
    try {
        const { prompt, deviceId } = req.body;
        
        if (!prompt) {
            return res.status(400).json({ error: "Prompt is required!" });
        }

        // Generate response using Gemini AI with gemini-3.8-flash model
        const response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: prompt,
            config: {
                systemInstruction: "You are J.A.R.V.I.S., a highly intelligent, sharp, and loyal personal AI assistant built for Shivam. Always keep your answers concise, futuristic, and direct."
            }
        });

        const replyText = response.text || "I am here, Boss.";

        res.status(200).json({
            status: "success",
            reply: replyText
        });

    } catch (error) {
        console.error("AI Error:", error.message);
        res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 J.A.R.V.I.S. Server running on port ${PORT}`);
});

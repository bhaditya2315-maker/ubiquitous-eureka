// server.js
// Minimal backend for PadhAI: receives a student's question from the frontend,
// forwards it to the Gemini API, and returns the answer.
//
// Setup:
//   1. npm install
//   2. Copy .env.example to .env and paste in your Gemini API key
//   3. npm start
//
// The frontend should POST to:  http://localhost:3000/api/chat
// Body:  { "message": "How do I factorise x^2 - 5x + 6?", "history": [] }

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({ origin: 'http://127.0.0.1:5500' }));
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// This keeps Gemini focused on the product's purpose: helping Class 9 & 10
// students with academic doubts, and steering it away from unrelated topics.
const SYSTEM_INSTRUCTION = `You are PadhAI, a friendly academic doubt-solving assistant for Class 9 and Class 10 students (CBSE/NCERT style curriculum: Mathematics, Science, Social Science, and English).

Rules you must follow:
- Only help with academic doubts appropriate for Class 9-10 students in these subjects.
- Explain answers step by step, in simple language a 14-16 year old can follow.
- Use short paragraphs and numbered steps for problem-solving questions.
- If a question is far outside the Class 9-10 syllabus, or is not an academic question, politely say you can only help with Class 9-10 school subjects and ask them to rephrase.
- Do not do anything that resembles doing a student's exam or graded assignment for them dishonestly — encourage understanding, not just final answers.
- Keep responses focused and not overly long.`;

if (!GEMINI_API_KEY) {
  console.warn(
    '\n[WARNING] GEMINI_API_KEY is not set. Create a .env file (see .env.example) before making requests.\n'
  );
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', model: GEMINI_MODEL, keyConfigured: Boolean(GEMINI_API_KEY) });
});

// Main chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
      console.log("ru");
    const { message, history } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Field "message" is required and must be a non-empty string.' });
    }

    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Server is missing GEMINI_API_KEY. Add it to your .env file.' });
    }

    // "history" (optional) lets the frontend send prior turns for context.
    // Expected shape: [{ role: "user" | "model", text: "..." }, ...]
    const contents = [];

    if (Array.isArray(history)) {
      for (const turn of history) {
        if (turn && typeof turn.text === 'string' && (turn.role === 'user' || turn.role === 'model')) {
          contents.push({ role: turn.role, parts: [{ text: turn.text }] });
        }
      }
    }

    contents.push({ role: 'user', parts: [{ text: message }] });

    const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: {
          parts: [{ text: SYSTEM_INSTRUCTION }],
        },
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 800,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Gemini API error:', data);
      return res.status(response.status).json({
        error: data?.error?.message || 'Gemini API request failed.',
      });
    }

    const answer =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('\n') ||
      "Sorry, I couldn't generate an answer for that. Try rephrasing your doubt.";

    res.json({ answer });
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Something went wrong on the server.' });
  }
});

app.listen(PORT, () => {
  console.log(`PadhAI backend running at http://localhost:${PORT}`);
});
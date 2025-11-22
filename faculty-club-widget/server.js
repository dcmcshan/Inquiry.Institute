import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4173;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/tables/:tableId', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'table.html'));
});

app.post('/api/generate', async (req, res) => {
  try {
    if (!OPENROUTER_API_KEY) {
      return res.status(500).json({ error: 'OPENROUTER_API_KEY is not configured' });
    }

    const { tableId, tableName, theme, participants, history = [] } = req.body || {};

    if (!tableId || !participants || participants.length === 0) {
      return res.status(400).json({ error: 'Missing table metadata or participants' });
    }

    const trimmedHistory = history.slice(-15);
    const personaSummary = participants
      .map(
        (p) =>
          `- ${p.label} (${p.handle}) → ${p.persona}. Preferred tone: ${p.tone}. Priorities: ${p.focus || 'n/a'}.`
      )
      .join('\n');

    const historyText =
      trimmedHistory.length > 0
        ? trimmedHistory.map((entry) => `${entry.speaker}: ${entry.content}`).join('\n')
        : 'No prior messages.';

    const userInstructions = `
Table: ${tableName}
Theme: ${theme}

Participants:
${personaSummary}

Recent conversation:
${historyText}

Goals:
1. Suggest a fresh micro-topic that advances the theme.
2. Draft exactly one short response per participant (no one speaks twice).
3. Responses must sound distinct, cite concrete details, and advance the dialogue.
4. Keep each response under 120 words.
5. Supply natural-thinking delays (0.5-3.5s) and realistic speaking speeds (110-190 wpm).

Respond ONLY with JSON that matches the provided schema.
    `.trim();

    const schema = {
      name: 'FacultyClubRound',
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['topic', 'messages'],
        properties: {
          topic: {
            type: 'string',
            description: 'Concise suggestion for the next angle of conversation.'
          },
          messages: {
            type: 'array',
            minItems: participants.length,
            maxItems: participants.length,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['speaker', 'content', 'thinking_delay', 'speaking_speed_wpm'],
              properties: {
                speaker: {
                  type: 'string',
                  description: 'Handle or name of the participant.'
                },
                content: {
                  type: 'string',
                  description: 'The text of the response.'
                },
                thinking_delay: {
                  type: 'number',
                  description: 'Seconds to wait before the speaker starts talking.'
                },
                speaking_speed_wpm: {
                  type: 'number',
                  description: 'Approximate words per minute for the speaker.'
                }
              }
            }
          }
        }
      }
    };

    const body = {
      model: 'openrouter/got-oss-120b',
      response_format: {
        type: 'json_schema',
        json_schema: schema
      },
      messages: [
        {
          role: 'system',
          content:
            'You orchestrate Inquiry Institute Faculty Club salons. Always follow the JSON schema exactly. Do not include commentary outside of JSON.'
        },
        {
          role: 'user',
          content: userInstructions
        }
      ]
    };

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.OPENROUTER_REFERER || 'https://inquiry.institute/faculty.club',
        'X-Title': process.env.OPENROUTER_APP_TITLE || 'Faculty Club'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: 'OpenRouter request failed', details: text });
    }

    const completion = await response.json();
    const content = completion?.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(502).json({ error: 'OpenRouter returned no content' });
    }

    let payload;
    try {
      payload = typeof content === 'string' ? JSON.parse(content) : content;
    } catch (err) {
      return res.status(502).json({ error: 'Failed to parse OpenRouter JSON', details: err.message });
    }

    if (!Array.isArray(payload.messages)) {
      return res.status(422).json({ error: 'Invalid response structure from model' });
    }

    const sanitized = {
      topic: payload.topic || theme,
      messages: payload.messages.map((msg) => ({
        speaker: msg.speaker || 'unknown',
        content: msg.content || '',
        thinking_delay: clampNumber(msg.thinking_delay, 0.4, 4) ?? 1.2,
        speaking_speed_wpm: clampNumber(msg.speaking_speed_wpm, 100, 200) ?? 140
      }))
    };

    res.json(sanitized);
  } catch (error) {
    console.error('[FacultyClub] generation failed', error);
    res.status(500).json({ error: 'Unexpected server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Faculty Club widget server running on http://localhost:${PORT}`);
});

function clampNumber(value, min, max) {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
  return Math.min(Math.max(value, min), max);
}

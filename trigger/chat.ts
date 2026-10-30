import { google } from "@ai-sdk/google"
import { chat } from "@trigger.dev/sdk/ai"

import { chatTranscriptStorage } from "@/lib/chat-transcript-storage"

// gemini-3.8-flash is often saturated on the free tier; 3.5-flash streams reliably.
const MODEL_ID = process.env.GOOGLE_MODEL ?? "gemini-3.5-flash"

export const chatAgent = chat.agent({
  id: "chat",
  storage: chatTranscriptStorage,
  run: async ({ messages, signal, streamText }) =>
    streamText({
      model: google(MODEL_ID),
      instructions: "You are a helpful assistant.",
      messages,
      abortSignal: signal,
    }),
})

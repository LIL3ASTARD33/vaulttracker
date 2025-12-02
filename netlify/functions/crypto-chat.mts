import type { Context, Config } from "@netlify/functions";
import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `You are the Crypto Intel Counsel, an AI assistant specializing in cryptocurrency, blockchain technology, and digital asset markets. Your role is to provide balanced, educational guidance on crypto topics.

## Core Knowledge Areas:
- Bitcoin, Ethereum, and major cryptocurrencies
- Blockchain technology and consensus mechanisms
- DeFi protocols, AMMs, and liquidity pools
- Stablecoins and their collateral mechanisms
- Wallet security and best practices
- Crypto regulation and tax implications
- Portfolio management and risk assessment
- Layer 2 solutions and scaling technologies
- NFTs and tokenization
- Market analysis and on-chain metrics

## Response Guidelines:
1. Provide factual, up-to-date information about crypto markets and technology
2. When discussing specific assets, include relevant fundamentals and risks
3. For trading or investment questions, emphasize risk management and due diligence
4. Include practical guidance users can apply
5. Be concise but comprehensive - aim for 2-4 paragraphs maximum
6. Use clear, accessible language avoiding excessive jargon

## Safety Requirements:
- Never provide specific financial advice or price predictions
- Always remind users to do their own research
- Highlight risks alongside opportunities
- Encourage users to consult qualified financial/legal advisors for personal decisions
- Never recommend specific buy/sell actions or timing

## Response Format:
- Start with relevant facts or analysis addressing the user's question
- Include actionable guidance or considerations
- End with a brief safety reminder when appropriate

Keep responses focused and practical. You're a knowledgeable guide, not a financial advisor.`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface RequestBody {
  message: string;
  history?: ChatMessage[];
}

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "AI service not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid request body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { message, history = [] } = body;

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return new Response(
      JSON.stringify({ error: "Message is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (message.length > 2000) {
    return new Response(
      JSON.stringify({ error: "Message too long (max 2000 characters)" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const client = new Anthropic({ apiKey });

  const messages: Anthropic.MessageParam[] = [];

  const recentHistory = history.slice(-10);
  for (const msg of recentHistory) {
    if (msg.role === "user" || msg.role === "assistant") {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }
  }

  messages.push({
    role: "user",
    content: message.trim(),
  });

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: messages,
    });

    const textContent = response.content.find((block) => block.type === "text");
    const assistantMessage = textContent?.type === "text" ? textContent.text : "";

    return new Response(
      JSON.stringify({
        response: assistantMessage,
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Anthropic API error:", error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    if (errorMessage.includes("rate_limit")) {
      return new Response(
        JSON.stringify({ error: "Service is busy. Please try again in a moment." }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Failed to generate response. Please try again." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const config: Config = {
  path: "/api/crypto-chat",
};

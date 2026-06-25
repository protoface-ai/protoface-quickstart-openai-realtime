import { NextResponse } from "next/server";

export const runtime = "nodejs";

const model = process.env.NEXT_PUBLIC_OPENAI_REALTIME_MODEL || "gpt-realtime-2";

export async function POST(request: Request) {
  try {
    const offerSdp = await request.text();
    if (!offerSdp) {
      throw new Error("Missing WebRTC offer.");
    }

    const form = new FormData();
    form.set("sdp", offerSdp);
    form.set(
      "session",
      JSON.stringify({
        type: "realtime",
        model,
        instructions: "You are a warm, concise voice assistant helping a developer test a Protoface avatar.",
        audio: {
          output: {
            voice: "marin"
          }
        }
      })
    );

    const response = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireEnv("OPENAI_API_KEY")}`,
        "OpenAI-Safety-Identifier": "create-protoface-app-openai"
      },
      body: form
    });

    const answerSdp = await response.text();
    if (!response.ok) {
      return new NextResponse(answerSdp || "Failed to start OpenAI Realtime.", { status: response.status });
    }

    return new NextResponse(answerSdp, {
      headers: {
        "content-type": "application/sdp"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start OpenAI Realtime.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}.`);
  }
  return value;
}

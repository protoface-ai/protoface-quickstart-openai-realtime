# Create Protoface App (OpenAI Realtime)

This starter adds a realtime Protoface avatar to an OpenAI Realtime conversation in a Next.js app.

## About Protoface

Protoface adds a real-time avatar to your AI app or agent.

Get a **free** API key at [protoface.com](https://protoface.com/?utm_source=github&utm_medium=referral&utm_campaign=github_docs&utm_content=protoface-quickstart-openai).

Read the docs at [docs.protoface.com](https://docs.protoface.com/?utm_source=github&utm_medium=referral&utm_campaign=github_docs&utm_content=protoface-quickstart-openai).

To see quickstarts for other platforms, visit the [quickstart repo](https://github.com/protoface-ai/protoface-quickstart).

## Usage

1. Rename `.env.example` to `.env` and paste your Protoface, LiveKit, and OpenAI values.

If you want to try Protoface but do not have API access yet, reach out to the Protoface team and we can help you get set up.

```js
PROTOFACE_API_KEY="PROTOFACE-API-KEY"
LIVEKIT_URL="wss://YOUR-LIVEKIT-PROJECT.livekit.cloud"
LIVEKIT_API_KEY="LIVEKIT-API-KEY"
LIVEKIT_API_SECRET="LIVEKIT-API-SECRET"

OPENAI_API_KEY="OPENAI-API-KEY"
NEXT_PUBLIC_OPENAI_REALTIME_MODEL="gpt-realtime-2"
NEXT_PUBLIC_PROTOFACE_AVATAR_ID="av_stock_001"
```

2. Install packages.

```bash
npm install
```

3. Run the app.

```bash
npm run dev
```

4. Set the OpenAI Realtime model and Protoface avatar ID in `.env`. `NEXT_PUBLIC_PROTOFACE_AVATAR_ID` is optional and defaults to `av_stock_001`.

## How It Works

The app starts an OpenAI Realtime conversation and a Protoface avatar session side by side:

1. The server route creates a Protoface session and returns the browser connection details.
2. `ProtofaceClient.start()` connects the browser to the avatar session.
3. The browser creates a WebRTC connection for OpenAI Realtime.
4. The app passes the realtime model speech to Protoface so the avatar speaks naturally.

Protoface is the visible and audible avatar output for the experience.

## Characters

You can swap out the character by finding one that you like in the [Protoface avatar docs](https://docs.protoface.com/guides/avatars), or create your own.

`av_stock_001` `av_stock_002` `av_stock_003` `custom_avatar_id`

## Deploy on Vercel

An easy way to deploy your avatar interaction is to use the [Vercel Platform](https://vercel.com/new?filter=next.js).

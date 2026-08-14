# EchoAI In-house Agent Contract

EchoAI owns orchestration, user context, personas, references, editable projects, and workspace delivery. The in-house endpoint owns model execution. Implement only the capabilities the endpoint can fulfill, then enable those capabilities in **Integrations > In-house AI engine**.

## Endpoint

Accept authenticated `POST` requests over HTTPS with JSON bodies. API keys are sent as bearer tokens when configured.

```http
Authorization: Bearer <configured-key>
Content-Type: application/json
```

Every version 2 request includes:

```json
{
  "contractVersion": "2.0",
  "requestId": "uuid",
  "mode": "image",
  "capability": "image",
  "model": "default",
  "agentName": "Creative Bot",
  "capabilities": ["message", "document", "image", "image_edit", "character", "video", "audio", "vision", "moderation"],
  "routing": {
    "strategy": "best_quality",
    "allowFallback": true
  },
  "prompt": "Create a product launch image...",
  "persona": null,
  "references": [],
  "output": {
    "aspectRatio": "1:1",
    "durationSeconds": 6,
    "quality": "high",
    "style": "editorial",
    "negativePrompt": "watermarks, distorted text",
    "returnEditableMetadata": true
  }
}
```

Additional task-specific fields may be included. Unknown fields should be ignored for forward compatibility.

## Capabilities

- `message`: copy, scripts, strategy, planning, and structured text.
- `document`: extraction, comparison, summarization, and grounded generation.
- `image`: text-to-image and reference-guided image creation.
- `image_edit`: inpainting, outpainting, object/background replacement, cleanup, and restoration.
- `character`: character sheets, persona definitions, identity-consistent views, and expressions.
- `video`: storyboard, text-to-video, image-to-video, and short scene generation.
- `audio`: voiceover, speech, transcription, captions, and sound generation.
- `vision`: image and video-frame understanding and quality analysis.
- `moderation`: text and media safety review.

Legacy modes remain supported by EchoAI aliases: `copy` maps to `message`, `storyboard` to `video`, and `persona` to `character`.

## Responses

Return JSON. Text-only jobs can return:

```json
{
  "title": "Launch campaign",
  "text": "Campaign-ready output",
  "usage": { "totalTokens": 1200, "costUsd": 0.04 }
}
```

A single image can use a URL, data URL, or base64:

```json
{
  "title": "Launch visual",
  "imageUrl": "https://signed.example/output.png",
  "mime": "image/png",
  "text": "Optional caption"
}
```

Video and audio use equivalent keys: `videoUrl`, `videoSrc`, `videoBase64`, `audioUrl`, `audioSrc`, or `audioBase64`.

Multiple outputs should use `media`:

```json
{
  "title": "Campaign set",
  "media": [
    { "kind": "image", "url": "https://signed.example/a.png", "mime": "image/png" },
    { "kind": "video", "url": "https://signed.example/a.webm", "mime": "video/webm" }
  ],
  "usage": { "credits": 8 }
}
```

Character creation should return a reusable profile and may include character-sheet media:

```json
{
  "title": "Maya character sheet",
  "persona": {
    "name": "Maya",
    "description": "A confident product guide in her early thirties.",
    "visualIdentity": "Oval face, dark curls, cobalt jacket, coral pin.",
    "voice": "Warm, concise, informed, never sarcastic.",
    "requiredTraits": "Cobalt jacket and coral pin remain consistent.",
    "forbiddenTraits": "No brand logos from other companies."
  },
  "media": [
    { "kind": "image", "url": "https://signed.example/maya-sheet.png", "mime": "image/png" }
  ]
}
```

Video plans can return `scenes` before or alongside generated media:

```json
{
  "title": "Six-second product reveal",
  "scenes": [
    { "title": "Reveal", "direction": "Slow push toward the product on a white pedestal." }
  ],
  "videoUrl": "https://signed.example/reveal.webm",
  "mime": "video/webm"
}
```

## References and Personas

References contain workspace metadata and a URL when one is available:

```json
{
  "name": "approved-face.png",
  "type": "image",
  "url": "data:image/png;base64,...",
  "summary": "Approved front-facing identity reference"
}
```

Use all persona reference images for identity-sensitive character and video jobs. The endpoint should support multiple angles and preserve required traits. Do not infer or recreate a real person's likeness without documented consent.

## Recommended Routing

Keep provider selection behind this endpoint rather than in the browser. A practical router can select models by:

- capability and input type;
- quality, latency, and cost policy;
- privacy or region requirements;
- aspect ratio and duration;
- character-consistency support;
- provider availability and quota.

Return the same EchoAI response shape regardless of the provider selected. This allows providers to be replaced without changing the application.

## Job Execution

Long image/video jobs should eventually use an asynchronous job API. The current client supports immediate responses. For production scale, the endpoint can initially wait for completion, but should enforce a timeout and return a clear non-2xx error when generation fails.

Recommended future asynchronous flow:

1. `POST /jobs` returns `202` and a job ID.
2. EchoAI polls `GET /jobs/:id` or receives a signed webhook.
3. Completed jobs return normalized media and usage.
4. Signed media URLs remain available long enough for users to save outputs into workspace storage.

## Safety and Quality

Before returning generated media:

- verify real-person consent and block impersonation/deceptive likeness requests;
- moderate prompt and output;
- scan uploaded and generated files;
- validate MIME type, file size, duration, and dimensions;
- verify required text, dates, prices, disclaimers, and brand constraints;
- flag uncertain claims instead of inventing facts;
- retain request IDs and provider/model metadata for audit;
- never log bearer tokens, private documents, or raw recovery credentials.

## Capability Testing

The Integrations test sends `mode: "test"`. Return HTTP 200 with JSON describing the endpoint:

```json
{
  "status": "ok",
  "contractVersion": "2.0",
  "capabilities": ["message", "image", "character", "video"],
  "models": ["private-language-v3", "image-router", "video-router"]
}
```

Only enable capabilities in EchoAI after their test fixtures return a valid recognized response. Maintain automated fixtures for every enabled mode, including at least one failure, timeout, unsafe request, and unavailable-provider fallback case.

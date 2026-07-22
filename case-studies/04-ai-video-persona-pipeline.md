# Case Study: AI Video Persona — Generative Production Pipeline

**Stack:** Remotion (React) · Replicate (flux-dev, flux-kontext-pro, nano-banana-2, p-video-avatar) · ElevenLabs voice + Scribe · Python · Airtable production tracker
**Type:** End-to-end generative media system, in production
**Live output:** a running short-form series on YouTube + Instagram · [showcase repo](https://github.com/wolfvswhale/ai-persona-video-pipeline) · persona name and channel links available on request

---

## The problem this solves

Producing character-led video normally requires a presenter, a camera, and an editor for every episode. This system replaces all three with a pipeline: a synthetic host with a stable identity, archival and generated imagery, and programmatic rendering — operated by one person, producing a running series about history's great con artists.

The hard problem isn't generating one good video. It's generating episode twelve that looks like episode three: same face, same voice, same visual grammar, no drift.

## Architecture

Six stages, one human gate:

1. **Story selection** in an Airtable tracker — one row per episode, tracking status, outfit plate number, chroma-conflict flags, runtime, and cross-posting.
2. **Voice**: script → ElevenLabs VO → Scribe word-level transcript.
3. **Subtitle alignment**: a Python stage maps the *delivered script verbatim* onto Scribe's word timings — transcription provides timing only, never on-screen text, so proper nouns are never misheard in captions. Scene cut points are computed from word timestamps ("timing is not by feel" — eyeballed cuts were the top cause of re-renders).
4. **Imagery**: exact-title archival pulls from Wikimedia Commons, with generated period stills (Replicate) filling gaps under a hard rule — right era, right place, nothing anachronistic.
5. **Avatar**: a two-stage build. The numbered outfit plate is converted to a chroma-green plate by flux-kontext-pro with a canon-preserving prompt (pose, glasses, signature details pinned); that plate plus the VO audio drives p-video-avatar into a talking head. Character consistency is treated as asset management, not model luck.
6. **Render**: one Remotion (React) template; each episode edits only a CONFIG block. Ken Burns motion, chroma de-fringe, avatar tail-trim, and subtitle behavior are baked in. QC sweeps check fixed frame points — hands for invented jewelry, the final 1.5 seconds for model garble — before the single render.

The only human checkpoint is a stills review before render. Everything else runs straight through.

## What it demonstrates

Multi-model API orchestration with real cost discipline (documented polling patterns, cold-start handling, base64 transport instead of upload infrastructure); React beyond web pages (programmatic video); production operations (a runbook and checklist that encode every failure mode already paid for once — the docs are versioned artifacts, and cleanup scripts are at v7 because real systems iterate); and the same security habit as every other project in this portfolio: zero credentials in code, everything in environment variables.

## The vertical integration

The series adapts entries from a 50-chapter nonfiction book published under the persona's own byline. The persona is simultaneously the book's author and the series' host: the pipeline turns entries from "her" book into episodes fronted by "her" on screen. Content, character, and production system are one owned stack.

## Honest scale

The series is young — double-digit YouTube subscribers, low hundreds on Instagram. The audience is not the claim. The claim is the pipeline: a one-operator system that turns a database row into a published, character-consistent, subtitle-accurate episode, repeatedly.

# Nova Chat — Design Direction

## Reference notes

Public Claude materials indicate a calm, editorial chat experience built around a persistent left navigation/history area and a large, uncluttered conversation canvas. The primary interaction is a bottom composer with a prominent plus/add affordance for attachments or commands, a model/context control near the composer, and a clear submit action. Public help content also emphasizes conversational prompting, chat history, model selection, personalization, and optional artifacts/cowork-style workflows.

Ground truth for inspiration: https://claude.ai/ and https://support.claude.com/en/articles/8114491-get-started-with-claude

This project uses **original Nova branding, copy, icons, and visual assets**. It recreates the high-level information architecture and interaction feel, not proprietary artwork or exact source code.

## Three stylistic approaches

### Theme Name: Warm Paper / Quiet Intelligence
Very light parchment surfaces, charcoal typography, and a single warm persimmon accent. Feels thoughtful, human, and editorial.

**Probability:** 0.07

### Theme Name: Ink Desk / Focus Mode
Graphite workspace with soft cream cards and muted blue controls. Feels like a private research desk for serious work.

**Probability:** 0.04

### Theme Name: Linen & Signal
Neutral linen background, mineral green actions, and sharp black type. Feels optimistic, precise, and quietly distinctive.

**Probability:** 0.09

## Chosen approach: Warm Paper / Quiet Intelligence

### Design Movement
Contemporary editorial software inspired by print layouts, Japanese stationery, and the restrained tactility of a well-made notebook.

### Core Principles
1. Put the conversation first: every secondary control recedes until needed.
2. Make utility feel human: rounded but not bubbly, warm but not playful.
3. Use generous whitespace as a navigation cue.
4. Make state changes legible through texture, contrast, and small motion rather than loud color.

### Color Philosophy
The canvas is a soft parchment rather than bright white to reduce visual glare and create a calmer reading environment. Charcoal ink provides high-contrast text. The signature persimmon accent is reserved for moments of agency: sending, active navigation, and brand marks.

### Layout Paradigm
A 272px left rail anchors history and navigation while the main chat area breathes around a narrow 760px reading measure. On small screens the rail becomes a slide-over drawer; the main canvas keeps its vertical rhythm.

### Signature Elements
- Persimmon monogram mark built from a rounded four-lobed glyph.
- Hairline dividers and paper-like surface shifts between rail, canvas, and composer.
- Small uppercase metadata labels paired with large, generous message typography.

### Interaction Philosophy
Interactions should feel like turning a page or moving a card on a desk: quick, quiet, and reversible. Hover states use surface lift or ink tint; active states use a short press scale and an accent edge.

### Animation
Use 140–220ms ease-out transitions for hover, focus, and menu states. New messages fade and rise by 6px. Avoid perpetual motion. Respect reduced-motion preferences.

### Typography System
Use Newsreader for display moments and instrument-serif-like warmth, paired with DM Sans for UI and body copy. Page title is 24px/1.1 semibold; message text is 16px/1.65; metadata is 11px uppercase with 0.12em tracking.

### Brand Essence
Nova is a quiet AI workspace for thinking clearly, made for people who want useful answers without visual noise.

**Personality:** considerate, exacting, warm.

### Brand Voice
Headlines are concise and observant. CTAs are direct but not pushy. Microcopy sounds like a capable collaborator.

Example lines:
- “What are you working through?”
- “Bring a question, a draft, or a half-formed idea.”

### Wordmark & Logo
A compact four-lobed persimmon glyph paired with the Nova wordmark in a custom-feeling serif/sans lockup. The glyph should also work alone as a favicon.

### Signature Brand Color
Persimmon `#D85A3A` — ownable, warm, and energetic without reading as a generic notification red.

## Style Decisions

- Persimmon `#D85A3A` is reserved for the brand glyph, selected navigation/history state, and primary send/agency actions.
- Nova’s visible identity moments use Newsreader; routine UI remains DM Sans so the product does not read as an all-sans generic chat app.
- The composer is treated as a tactile paper card on a desk, with a distinct white-paper surface, clearer writing/control separation, and stronger send hierarchy.

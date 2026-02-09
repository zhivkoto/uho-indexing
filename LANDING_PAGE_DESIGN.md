# Uho Landing Page Design

## Visual Direction
Cockpit-grade, crypto-native, dark. Grid backgrounds, subtle glow effects, animated terminal. The page should feel like a mission control for on-chain data.

## Sections
1. **Nav** — Fixed, glass-blur, logo + links + auth CTAs
2. **Hero** — Big headline, sub-copy, dual CTAs, floating grid bg with cyan glow
3. **Code Terminal** — Animated typing effect showing the 3-command workflow
4. **Stats Bar** — Social proof numbers (events indexed, programs, latency)
5. **Features** — 2x2 grid with icon cards, hover glow
6. **How It Works** — 3-step horizontal flow with connecting lines
7. **Agent-Native Section** — Why agents love Uho (structured output, webhooks, typed responses)
8. **CTA** — Final conversion block with glow border
9. **Footer** — Minimal, links + copyright

## Copy Tone
Technical, concise, confident. No fluff. Speak to devs who've been burned by GraphQL subgraphs.

## Key Visual Elements
- Dot grid background pattern (subtle, CSS-only)
- Cyan accent glow orbs (CSS gradients, no images)
- Animated terminal with typewriter effect
- Monospace data values for stats
- Glass-morphism cards

## Colors
Per DESIGN_SYSTEM.md — bg-base #09090B, accent #22D3EE, text hierarchy as defined.

## Implementation
Single page.tsx with CSS animations in globals.css. No external animation libraries.

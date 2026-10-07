# Typosaurus

A local-first, highly animated typing-test web application built for personal daily practice.

## Features
- **Modes**: Time, Words, Zen, Code, Weak-Spots, Pressure, and Daily challenges
- **Visuals**: Spring-physics caret, flow-meter intensity effects, keystroke heatmap
- **Audio**: Procedurally synthesized Web Audio feedback (zero audio asset downloads)
- **Analytics**: Ghost/pace caret, keystroke replay, local weakness coach, progression & stats
- **Experience**: Keyboard-driven command palette, instant themes driven by tokens

## Architecture & Standards
- **Framework**: Vite + React 18 + TypeScript
- **Target**: Constant 60fps with an imperative hot path outside React
- **Privacy & Storage**: 100% offline, persistent via local IndexedDB (Dexie)
- **Original Code**: Built from scratch; zero copied Monkeytype code

## Development
- `npm run dev` — start local development server
- `npm run build` — build production bundle
- `npm run typecheck` — strict TypeScript check
- `npm run test` — run unit and property tests
- `npm run preview` — preview production build

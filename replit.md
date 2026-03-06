# AI Video Production Studio

## Overview
The AI Video Production Studio is a full-stack platform designed to streamline video creation using multiple AI video providers. Its core purpose is to offer an intelligent system for provider selection with content-aware classification, comprehensive brand asset management, quality evaluation, and advanced sound design capabilities. The platform leverages Remotion for flexible video composition, targeting a broad market with ambitions to be a leading tool for professional and efficient AI-driven video production.

## User Preferences
- Focus on Video Production Platform only (no HR features)
- Dark theme with purple/indigo accent colors
- Modern, professional, cutting-edge UI (Canva-inspired)
- Glassmorphism card surfaces, gradient thumbnails, visual project cards

## System Architecture
-   **Tech Stack**: React 18, Vite, TypeScript, Tailwind CSS v4, shadcn/ui, wouter, @tanstack/react-query for frontend; Express.js, TypeScript, Passport.js, bcrypt for backend; PostgreSQL (Neon) with Drizzle ORM for database; Remotion for video composition.
-   **UI/UX**: Canva-inspired persistent sidebar navigation, glassmorphism card surfaces, animated gradient landing page, split-panel authentication, and visual project cards with gradient thumbnails. Modern dark theme with dynamic light/dark mode toggling.
-   **Brand Management**: Integrated brand settings (name, tagline, website, colors, logo_url, guidelines) for dynamic injection into project creation, script parsing, and video prompt optimization. Supports drag-and-drop logo upload and brand media library.
-   **AI Video Generation**: Supports configurable Text-to-Video (T2V) and Image-to-Video (I2V) pipelines. Includes content-aware provider selection classifying scenes into 8 categories (cinematic, human_subjects, product_reveal, broll, conceptual_explanatory, infographic_diagram, motion_graphics, mixed) and routing to appropriate visual formats. Features automated character consistency across scenes using extracted frames as I2V references. Supports multi-image I2V for providers like Kling.
-   **Micro-Scenes**: Claude automatically splits scene narrations into micro-scenes, each with its own visual direction and AI-generated video clip. Remotion stitches these with crossfade transitions. Supports per-micro-scene original audio mixing with volume control and background music auto-ducking.
-   **Custom Script Workflow**: Scene-by-scene editor allows users to add, reorder, and remove scenes with type selection and narration text.
-   **Quick Create Workflow**: Panel for quick asset creation including visual (prompt editing, provider selection), voiceover (AI narration), and background music generation.
-   **Overlay System**: Unified pipeline for automated per-scene logos/watermarks (`sceneOverlayConfigs`) and user-positioned drag-and-drop overlays (`scene.overlayItems`).
-   **Per-Scene Voiceover**: Voiceover generated per-scene using ElevenLabs with word-level timing data, uploaded to S3. Scene durations are based on TTS audio duration.
-   **Text Caption Overlays**: Word-synced caption overlays rendered in Remotion with 5 preset styles (karaoke, capcut, hormozi, broadcast, minimal) and configurable appearance.
-   **Visual Art Direction Presets**: 9 visual art style presets (3D Illustration, Cinematic Realism, 2D Line Art, Collage, Claymation, Neon Futuristic, Watercolor, Minimalist Flat, Scientific/Medical Animation) influence prompt engineering and provider selection, with per-scene override capability.
-   **Per-Scene Content Tags**: Individual scenes can be tagged with content categories (scientific-medical, lifestyle, testimonial, product-showcase) to override project-level art preset settings for that scene.
-   **Smart Text Label Overlays**: Claude-powered extraction identifies key terms from narrations for on-screen text labels, rendered with 8 visual treatments tailored to the video's art style.
-   **Post-Production & Rendering**: Render configuration panel for voiceover, background music volume, sound design, film treatments, captions, and transitions. Uses Remotion Lambda for rendering with live progress polling and chunked rendering for longer videos.
-   **Asset Library**: Comprehensive system for upload/deletion, brand media management, and AI asset creation. Supports T2I, T2V, I2V, IMG2IMG (style-transfer, background generation, scene integration, product placement), and V2V (object replacement). Includes advanced modes like Runway Gen-4 Aleph V2V, Runway Act Two Character Performance, Qubic Image Toolkit (upscaling, background removal), and Nano Banana Pro image generation.
-   **API Testing System**: Dedicated page for testing AI video, image, audio, and LLM providers with real-time polling and persistent results.
-   **Service Architecture**: Modularized backend services for specific functionalities (e.g., `ai-video-service`, `brand-service`, `remotion-lambda-service`).
-   **Database Schema**: Drizzle ORM defines schemas for users, sessions, video projects, production phases, brand assets, media assets, and job queues.

## External Dependencies
-   **AI Video Providers**: Kling, RunwayML (4.5, Gen-4, Gen-4 Aleph, Act Two), Luma, Pika, Veo, Hailuo, Wan, Sora, Seedance (1.0, 2.0 Preview, 2.0 Fast), Hunyuan (via PiAPI). Seedance 2 uses `model: "seedance"` with task types `seedance-2-preview` / `seedance-2-fast-preview`, supports `@imageN` multi-image references in prompts and morphing effects between images.
-   **Database**: PostgreSQL (Neon).
-   **Object Storage**: S3 for render assets and character references.
-   **Rendering**: Remotion (Remotion Lambda).
-   **Image Generation**: PiAPI Flux Schnell (fallback), Nano Banana Pro (PiAPI Gemini model).
-   **Authentication**: Passport.js.
-   **AI Tools**: ElevenLabs (for voiceover), Claude via PiAPI LLM proxy (claude-opus-4-6 primary, Anthropic direct claude-sonnet-4 fallback) for script generation, micro-scene splitting, text label extraction, prompt optimization, scene analysis, quality evaluation, and intelligent provider selection. All LLM calls go through `server/services/piapi-llm-client.ts` which handles PiAPI→Anthropic automatic failover.
-   **Image/Video Toolkit**: Qubic Image Toolkit (via PiAPI).
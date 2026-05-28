# AI Video Models Integration Guide

## Supported Models

### 1. **AnimateDiff + Wav2Lip** (Open Source - RunPod Compatible)
- **Image-to-Video**: AnimateDiff animates static images
- **Audio Input**: Wav2Lip syncs lip movements with audio
- **Best for**: Talking head animations, character animations
- **Requirements**: GPU with 16GB+ VRAM

### 2. **Stable Video Diffusion** (Stability AI - API)
- **Image-to-Video**: High quality video generation
- **Audio Input**: Not directly supported (need separate audio sync)
- **Best for**: General image animation
- **Requirements**: API key or self-hosted

### 3. **Runway Gen-2** (API)
- **Image-to-Video**: Professional quality
- **Audio Input**: Limited support
- **Best for**: High-quality animations
- **Requirements**: API key

### 4. **SadTalker** (Open Source - RunPod Compatible)
- **Image-to-Video**: Talking head generation
- **Audio Input**: Full audio-driven lip sync
- **Best for**: Portrait animations with speech
- **Requirements**: GPU with 12GB+ VRAM

### 5. **Kling AI** (API)
- **Image-to-Video**: High quality
- **Audio Input**: Limited
- **Best for**: General animations
- **Requirements**: API key

## Recommended Setup

For RunPod deployment, I recommend:
1. **AnimateDiff** for general image animation
2. **SadTalker** for talking head with audio
3. **Wav2Lip** for precise lip sync

These can all run on the same RunPod instance.


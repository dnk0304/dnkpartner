# Dennis Automation Prompt

A batch image generation tool powered by Google's Gemini 3 Pro Image API. Generate up to 70 images with a single click using a queue-based system.

## Features

- **Batch Processing**: Add up to 70 prompts and generate images in sequence
- **Queue System**: Visual progress tracking for each prompt
- **Real-time Status**: See which prompt is currently being processed
- **Auto-save**: Images are automatically saved to the `downloads/` folder
- **Preview & Download**: Thumbnail previews with download links for completed images
- **Beautiful UI**: Modern, dark-themed interface built with React and Tailwind CSS

## Getting Started

### Prerequisites

- Node.js 20.x or higher
- A Google AI API key (already configured)

### Installation

```bash
# Install dependencies
npm install

# Start both the server and frontend
npm start
```

### Running Separately

```bash
# Start the backend server (port 3001)
npm run server

# Start the frontend dev server (port 5173)
npm run dev
```

## Usage

1. **Add Prompts**: Click "Add Prompt" or use bulk buttons to add multiple prompts
2. **Enter Descriptions**: Write your image descriptions in each text box
3. **Start Generation**: Click "Start Generation" to process all prompts in sequence
4. **Monitor Progress**: Watch the status indicators update in real-time
5. **Download Images**: Once complete, preview thumbnails and download images

## API

The backend server provides the following endpoints:

- `POST /api/generate` - Generate an image from a text prompt
- `GET /api/health` - Health check endpoint
- `GET /downloads/:filename` - Serve generated images

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS 4
- **Backend**: Express.js, Google Gemini API
- **Styling**: Custom design system with CSS variables
- **Icons**: Lucide React

## Model

This tool uses `gemini-3-pro-image-preview` from Google's Gemini 3 family for image generation. See the [Gemini 3 documentation](https://ai.google.dev/gemini-api/docs/gemini-3) for more details.

## License

Private project.


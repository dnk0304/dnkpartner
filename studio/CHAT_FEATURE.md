# AI Chat Feature Guide

## What is it?

The AI Chat feature lets you describe images in natural language, and the AI will automatically extract and fill in the image prompts for you! No need to manually type each prompt.

## How to Use It

1. **Open the Chat**: Look for the chat button in the bottom-right corner of the screen (it looks like a message icon)

2. **Describe Your Images**: Type what you want in natural language. For example:
   - "I want a photo of a sunset over mountains"
   - "Create 3 images: a cat, a dog, and a bird"
   - "I need images of a modern kitchen, a cozy living room, and a minimalist bedroom"

3. **AI Extracts Prompts**: The AI will analyze your message and automatically extract the image prompts

4. **Auto-Filled**: The extracted prompts will automatically appear in your prompt cards!

## Example Conversations

### Single Image
**You**: "I want an image of a futuristic city at night with neon lights"

**AI**: *Extracts* → "futuristic city at night with neon lights"

### Multiple Images
**You**: "I need 3 images: a red sports car, a blue ocean, and a green forest"

**AI**: *Extracts* → 
- "red sports car"
- "blue ocean"  
- "green forest"

### Complex Descriptions
**You**: "Create images of a professional chef cooking in a modern kitchen, a barista making coffee, and a baker decorating a cake"

**AI**: *Extracts* →
- "professional chef cooking in a modern kitchen"
- "barista making coffee"
- "baker decorating a cake"

## Tips

- **Be Specific**: The more details you provide, the better the extracted prompts will be
- **Multiple Images**: You can describe multiple images in one message - the AI will extract them all
- **Natural Language**: Just write naturally, like you're talking to a friend
- **Edit if Needed**: After extraction, you can still edit the prompts in the cards if needed

## Requirements

- You need an **OpenAI API key** configured (same one used for DALL-E)
- The chat uses OpenAI's GPT-4o-mini model (cost-effective)
- See `OPENAI_SETUP.md` for API key setup instructions

## Troubleshooting

- **"OpenAI API key not configured"**: Add your OpenAI API key (see `OPENAI_SETUP.md`)
- **No prompts extracted**: Try being more explicit about what images you want
- **Chat not responding**: Check your internet connection and API key

Enjoy the convenience of automatic prompt extraction! 🎨


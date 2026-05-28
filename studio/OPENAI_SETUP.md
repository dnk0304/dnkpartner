# How to Add Your OpenAI API Key

To use DALL-E models (DALL-E 2 and DALL-E 3), you need to add your OpenAI API key.

## Step 1: Get Your API Key

1. Go to https://platform.openai.com/api-keys
2. Sign in or create an account
3. Click "Create new secret key"
4. Copy the key (you'll only see it once!)

## Step 2: Add the Key to Your Project

You have two options:

### Option A: Add it directly in the code (Easiest for beginners)

1. Open the file: `server/index.ts`
2. Find this line (around line 18):
   ```typescript
   const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "your-openai-api-key-here"
   ```
3. Replace `"your-openai-api-key-here"` with your actual API key:
   ```typescript
   const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "sk-your-actual-key-here"
   ```
4. Save the file
5. Restart your server (stop with Ctrl+C, then run `npm start` again)

### Option B: Use an environment variable (More secure)

1. Create a file named `.env` in the `dennisproject` folder
2. Add this line to the file:
   ```
   OPENAI_API_KEY=sk-your-actual-key-here
   ```
3. Replace `sk-your-actual-key-here` with your actual API key
4. Save the file
5. Restart your server

## Step 3: Test It

1. Start your project: `npm start`
2. Open http://localhost:5173 in your browser
3. In the "Image Settings" section, select "DALL-E 3 (OpenAI)" or "DALL-E 2 (OpenAI)" from the AI Model dropdown
4. Enter a prompt and generate an image

## Troubleshooting

- **"OpenAI API key not configured"**: Make sure you added your API key correctly
- **"Invalid API key"**: Check that you copied the entire key correctly
- **"Billing issue"**: Make sure you have credits in your OpenAI account

## Important Notes

- Keep your API key secret! Don't share it or commit it to public repositories
- OpenAI charges per image generated (check their pricing at https://openai.com/pricing)
- DALL-E 3 supports: 1024x1024, 1024x1792, and 1792x1024 sizes
- DALL-E 2 only supports: 1024x1024 (square) images


import Groq from 'groq-sdk';
import dotenv from 'dotenv';
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function testGeneration() {
  const modelsToTry = ['qwen/qwen3.8-27b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile', 'llama3-8b-8192'];

  for (const m of modelsToTry) {
    try {
      console.log(`Testing model: ${m}...`);
      const res = await groq.chat.completions.create({
        messages: [{ role: 'user', content: 'Hi' }],
        model: m,
      });
      console.log(`SUCCESS with model ${m}: ${res.choices[0]?.message.content?.slice(0, 50)}`);
      return m;
    } catch (err: any) {
      console.log(`FAILED with model ${m}: ${err.message}`);
    }
  }
}

testGeneration();

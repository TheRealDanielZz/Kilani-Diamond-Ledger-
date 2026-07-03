import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const audioDir = path.join(publicDir, 'audio');
const dataPath = path.join(publicDir, 'demo_script.json');

const apiKey = process.env.ELEVENLABS_API_KEY;
const voiceId = process.env.ELEVENLABS_VOICE_ID || 'TmNe0cCqkZBMwPWOd3RD';
const modelId = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';

if (!apiKey) {
    console.error('ELEVENLABS_API_KEY is required.');
    process.exit(1);
}

const voiceSettings = {
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0.3,
    speed: 0.95,
    use_speaker_boost: true
};

const data = JSON.parse(await readFile(dataPath, 'utf8'));
await mkdir(audioDir, { recursive: true });

for (const scene of data.scenes) {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            text: scene.narration,
            model_id: modelId,
            voice_settings: voiceSettings
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to generate ${scene.audio}: ${response.status} ${errorText}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    await writeFile(path.join(audioDir, scene.audio), audioBuffer);
    console.log(`Generated ${scene.audio}`);
}

console.log(`Generated ${data.scenes.length} workflow scenes in ${audioDir}`);

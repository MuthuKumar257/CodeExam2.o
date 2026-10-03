import fs from 'fs';
import path from 'path';

const transcriptPath = 'C:\\Users\\muthu\\.gemini\\antigravity\\brain\\7855fa0a-9206-438b-a57d-ab283ba27075\\.system_generated\\logs\\transcript_full.jsonl';

async function restoreAll() {
  const content = fs.readFileSync(transcriptPath, 'utf-8');
  const lines = content.split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      const toolCalls = obj.tool_calls || [];
      for (const call of toolCalls) {
        if (call.name === 'write_to_file') {
          const tf = call.args?.TargetFile;
          const code = call.args?.CodeContent;
          if (tf && code && tf.includes('backend')) {
            fs.mkdirSync(path.dirname(tf), { recursive: true });
            fs.writeFileSync(tf, code, 'utf-8');
          }
        } else if (call.name === 'replace_file_content') {
          const tf = call.args?.TargetFile;
          const target = call.args?.TargetContent;
          const replacement = call.args?.ReplacementContent;
          if (tf && target !== undefined && replacement !== undefined && tf.includes('backend') && fs.existsSync(tf)) {
            const current = fs.readFileSync(tf, 'utf-8');
            if (current.includes(target)) {
              const updated = current.replace(target, replacement);
              fs.writeFileSync(tf, updated, 'utf-8');
              console.log(`Applied edit to: ${path.basename(tf)}`);
            }
          }
        }
      }
    } catch {}
  }

  console.log('Finished full replay of write_to_file and replace_file_content on backend!');
}

restoreAll();

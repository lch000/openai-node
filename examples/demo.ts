#!/usr/bin/env -S npm run tsn -T

import OpenAI from '../src';
import { ChatCompletionStream } from '../src/lib/ChatCompletionStream';

const openai = new OpenAI({
  
});
async function main() {
  const stream = openai.beta.chat.completions.stream({
    model: 'Baichuan2',
    stream: true,
    messages: [{ role: 'user', content: '写一篇200字的小学生作文' }],
  });
  for await (const part of stream) {
    process.stdout.write(part.choices[0]?.delta?.content || '');
    console.log(part.choices[0]?.delta?.content, '****');
  }
}
main();

// const runner = ChatCompletionStream.fromReadableStream(stream.toReadableStream());

// runner.on('content', (delta, snapshot) => {
//   console.log(delta, 'testtest');
// });

#!/usr/bin/env -S npm run tsn -T

import OpenAI from '../src';
import { ChatCompletionStream } from '../src/lib/ChatCompletionStream';

const openai = new OpenAI({
  apiKey: '96d6c41139d2efc5c25d7c0b93ad69a3', // defaults to process.env["OPENAI_API_KEY"]
  baseURL: 'https://api.baichuan-ai.com/v1',
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

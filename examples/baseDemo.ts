#!/usr/bin/env -S npm run tsn -T

import OpenAI from '../src';
import { ChatCompletionStream } from '../src/lib/BaseChatCompletionStream';
const openai = new OpenAI({
});

async function main() {
  const stream2 = await openai.baseChat.completions
    .createBase({
      model_name: 'Baichuan2',
      prompt: {
        data: '写一篇100字的小说',
        from: 0,
        created_at: 12312344,
      },
      stream: true,
      history: [],
    })
    .asResponse();
  const { body } = stream2;
  const runner = ChatCompletionStream.fromReadableStream(body as any);
  runner.on('content', (delta, snapshot) => {
    console.log(snapshot, 'yyyy');
    console.log(delta, '*****');
  });
}
main();

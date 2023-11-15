#!/usr/bin/env -S npm run tsn -T

import OpenAI from '../src';
import { ChatCompletionStream } from '../src/lib/BaseChatCompletionStream';
const openai = new OpenAI({
  apiKey: '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', // defaults to process.env["OPENAI_API_KEY"]
  baseURL: 'http://llm-engine-test.cf8025269a251437fa494ea5f9c8a924c.cn-beijing.alicontainer.com',
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

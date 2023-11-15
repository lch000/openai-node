import * as Core from 'openai/core';
import { OpenAIError, APIUserAbortError } from 'openai/error';
import {
  Completions,
  type ChatCompletion,
  type ChatCompletionChunk,
  type ChatCompletionCreateParamsBase,
} from 'openai/resources/basechat/completions';
import {
  AbstractChatCompletionRunner,
  type AbstractChatCompletionRunnerEvents,
} from './BaseAbstractChatCompletionRunner';
import { type ReadableStream } from 'openai/_shims/index';
import { Stream } from 'openai/streaming';

export interface ChatCompletionStreamEvents extends AbstractChatCompletionRunnerEvents {
  content: (contentDelta: string, contentSnapshot: string) => void;
  chunk: (chunk: ChatCompletionChunk, snapshot: ChatCompletionSnapshot) => void;
}

export type ChatCompletionStreamParams = Omit<ChatCompletionCreateParamsBase, 'stream'> & {
  stream?: true;
};

export class ChatCompletionStream
  extends AbstractChatCompletionRunner<ChatCompletionStreamEvents>
  implements AsyncIterable<ChatCompletionChunk>
{
  #currentChatCompletionSnapshot: ChatCompletionSnapshot | undefined;

  get currentChatCompletionSnapshot(): ChatCompletionSnapshot | undefined {
    return this.#currentChatCompletionSnapshot;
  }

  /**
   * Intended for use on the frontend, consuming a stream produced with
   * `.toReadableStream()` on the backend.
   *
   * Note that messages sent to the model do not appear in `.on('message')`
   * in this context.
   */
  static fromReadableStream(stream: ReadableStream): ChatCompletionStream {
    const runner = new ChatCompletionStream();
    runner._run(() => runner._fromReadableStream(stream));
    return runner;
  }

  static createChatCompletion(
    completions: Completions,
    params: ChatCompletionStreamParams,
    options?: Core.RequestOptions,
  ): ChatCompletionStream {
    const runner = new ChatCompletionStream();
    runner._run(() => runner._runChatCompletion(completions, { ...params, stream: true }, options));
    return runner;
  }

  #beginRequest() {
    if (this.ended) return;
    this.#currentChatCompletionSnapshot = undefined;
  }
  #addChunk(chunk: ChatCompletionChunk) {
    if (this.ended) return;
    const completion = this.#accumulateChatCompletion(chunk);
    this._emit('chunk', chunk, completion);
    const delta = chunk.answer.data;
    const snapshot = completion;
    if (delta != null && snapshot?.content) {
      this._emit('content', delta, snapshot.content);
    }
  }
  #endRequest(): any {
    if (this.ended) {
      throw new OpenAIError(`stream has ended, this shouldn't happen`);
    }
    const snapshot = this.#currentChatCompletionSnapshot;
    if (!snapshot) {
      throw new OpenAIError(`request ended without sending any chunks`);
    }
    this.#currentChatCompletionSnapshot = undefined;
    return finalizeChatCompletion(snapshot);
  }

  protected async _fromReadableStream(
    readableStream: ReadableStream,
    options?: Core.RequestOptions,
  ): Promise<ChatCompletion> {
    const signal = options?.signal;
    if (signal) {
      if (signal.aborted) this.controller.abort();
      signal.addEventListener('abort', () => this.controller.abort());
    }
    this.#beginRequest();
    this._connected();
    const stream = Stream.fromReadableStream<ChatCompletionChunk>(readableStream, this.controller);
    let chatId;
    for await (const chunk of stream) {
      if (chatId && chatId !== chunk.answer.id) {
        // A new request has been made.
        this._addChatCompletion(this.#endRequest());
      }
      this.#addChunk(chunk);
      chatId = chunk.answer.id;
    }
    if (stream.controller.signal?.aborted) {
      throw new APIUserAbortError();
    }
    return this._addChatCompletion(this.#endRequest());
  }

  #accumulateChatCompletion(chunk: ChatCompletionChunk): ChatCompletionSnapshot {
    let snapshot = this.#currentChatCompletionSnapshot;
    const { answer, ...rest } = chunk;
    if (!snapshot) {
      snapshot = this.#currentChatCompletionSnapshot = {
        ...rest,
        content: '',
      };
    } else {
      Object.assign(snapshot, rest);
    }
    const { data } = chunk.answer;
    snapshot.content = snapshot.content += data;

    return snapshot;
  }

  [Symbol.asyncIterator](): AsyncIterator<ChatCompletionChunk> {
    const pushQueue: ChatCompletionChunk[] = [];
    const readQueue: ((chunk: ChatCompletionChunk | undefined) => void)[] = [];
    let done = false;

    this.on('chunk', (chunk) => {
      console.log('这里吗');
      const reader = readQueue.shift();
      if (reader) {
        reader(chunk);
      } else {
        pushQueue.push(chunk);
      }
    });

    this.on('end', () => {
      console.log('结束结束', readQueue);

      done = true;
      for (const reader of readQueue) {
        reader(undefined);
      }
      readQueue.length = 0;
    });

    return {
      next: async (): Promise<IteratorResult<ChatCompletionChunk>> => {
        if (!pushQueue.length) {
          if (done) {
            return { value: undefined, done: true };
          }
          return new Promise<ChatCompletionChunk | undefined>((resolve) => readQueue.push(resolve)).then(
            (chunk) => (chunk ? { value: chunk, done: false } : { value: undefined, done: true }),
          );
        }
        const chunk = pushQueue.shift()!;
        return { value: chunk, done: false };
      },
    };
  }

  toReadableStream(): ReadableStream {
    const stream = new Stream(this[Symbol.asyncIterator].bind(this), this.controller);
    return stream.toReadableStream();
  }
}

function finalizeChatCompletion(snapshot: ChatCompletionSnapshot): any {
  return snapshot;
}

function str(x: unknown) {
  return JSON.stringify(x);
}

/**
 * Represents a streamed chunk of a chat completion response returned by model,
 * based on the provided input.
 */
export interface ChatCompletionSnapshot {
  /**
   * A unique identifier for the chat completion.
   */
  id?: string;

  /**
   * A list of chat completion choices. Can be more than one if `n` is greater
   * than 1.
   */
  content: string;

  /**
   * The Unix timestamp (in seconds) of when the chat completion was created.
   */
}

export namespace ChatCompletionSnapshot {
  export namespace Choice {
    /**
     * A chat completion delta generated by streamed model responses.
     */
    export interface Message {
      /**
       * The contents of the chunk message.
       */
      content?: string | null;

      /**
       * The name and arguments of a function that should be called, as generated by the
       * model.
       */
      function_call?: Message.FunctionCall;

      tool_calls?: Array<Message.ToolCall>;

      /**
       * The role of the author of this message.
       */
      role?: 'system' | 'user' | 'assistant' | 'function' | 'tool';
    }

    export namespace Message {
      export interface ToolCall {
        /**
         * The ID of the tool call.
         */
        id?: string;

        function?: ToolCall.Function;

        /**
         * The type of the tool.
         */
        type?: 'function';
      }

      export namespace ToolCall {
        export interface Function {
          /**
           * The arguments to call the function with, as generated by the model in JSON
           * format. Note that the model does not always generate valid JSON, and may
           * hallucinate parameters not defined by your function schema. Validate the
           * arguments in your code before calling your function.
           */
          arguments?: string;

          /**
           * The name of the function to call.
           */
          name?: string;
        }
      }

      /**
       * The name and arguments of a function that should be called, as generated by the
       * model.
       */
      export interface FunctionCall {
        /**
         * The arguments to call the function with, as generated by the model in JSON
         * format. Note that the model does not always generate valid JSON, and may
         * hallucinate parameters not defined by your function schema. Validate the
         * arguments in your code before calling your function.
         */
        arguments?: string;

        /**
         * The name of the function to call.
         */
        name?: string;
      }
    }
  }
}

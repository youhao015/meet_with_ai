import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

// Hook up WebWorkerMLCEngineHandler to worker message event loop
const handler = new WebWorkerMLCEngineHandler();

self.onmessage = (msg: MessageEvent) => {
  handler.onmessage(msg);
};

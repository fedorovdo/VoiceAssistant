import type { SpeechToTextProvider } from "./SpeechToTextProvider.js";
import { MockSpeechToTextProvider } from "./MockSpeechToTextProvider.js";

export function createSpeechToTextProvider(): SpeechToTextProvider {
  return new MockSpeechToTextProvider();
}

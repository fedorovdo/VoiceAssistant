import type { SpeechToTextProviderId } from "@voiceassistant/shared";
import type { SpeechToTextProvider } from "./SpeechToTextProvider.js";
import { MockSpeechToTextProvider } from "./MockSpeechToTextProvider.js";

export function createSpeechToTextProvider(providerId: SpeechToTextProviderId): SpeechToTextProvider | undefined {
  if (providerId !== "mock") {
    return undefined;
  }

  return new MockSpeechToTextProvider();
}

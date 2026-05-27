import type { AssistantAnswerRequest } from "@voiceassistant/shared";
import type { AiProvider } from "./AiProvider.js";

export class MockAiProvider implements AiProvider {
  async answer(request: AssistantAnswerRequest): Promise<string> {
    const topic = request.text.trim();

    if (request.mode === "short") {
      return `Коротко: ${topic} — это техническая тема, которую стоит объяснять через назначение, основные части и типичный сценарий использования.`;
    }

    if (request.mode === "learning") {
      return [
        `Разберем по шагам: ${topic}`,
        "1. Сначала сформулируй, какую проблему решает технология.",
        "2. Затем назови ключевые компоненты.",
        "3. После этого приведи простой пример из практики.",
        "4. В конце проверь себя вопросом: что сломается, если убрать один из компонентов?"
      ].join("\n");
    }

    return [
      `Интервью-ответ: ${topic}`,
      "Начни с короткого определения, затем перечисли 3-5 ключевых частей и объясни, как они взаимодействуют.",
      "Хорошая структура ответа: назначение, компоненты, поток работы, пример, частая ошибка."
    ].join("\n");
  }
}

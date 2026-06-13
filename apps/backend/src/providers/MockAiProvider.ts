import type { AssistantAnswerRequest } from "@voiceassistant/shared";
import type { AiProvider } from "./AiProvider.js";

export class MockAiProvider implements AiProvider {
  async answer(request: AssistantAnswerRequest): Promise<string> {
    const topic = request.text.trim();
    const answerInEnglish = request.answerLanguage === "en";

    if (request.workMode === "live") {
      return answerInEnglish ? [
        `• ${topic} is a technical fragment selected by Live Assist for explanation.`,
        "• In simple terms, it is part of a system or process that affects an application or infrastructure.",
        "• For a mixed audience, understanding its purpose matters more than memorizing every internal detail.",
        "• Practical question: what problem does this component solve, and what depends on it?"
      ].join("\n") : [
        `• ${topic} — технический фрагмент, который Live Assist выбрал для пояснения.`,
        "• Простыми словами: это часть системы или процесса, влияющая на приложение или инфраструктуру.",
        "• Для смешанной аудитории важнее понять назначение, чем запомнить все внутренние детали.",
        "• Практический вопрос: какую проблему этот компонент решает и что от него зависит?"
      ].join("\n");
    }

    if (request.mode === "short") {
      return answerInEnglish
        ? `In short: ${topic} is best explained through its purpose, main parts, and a typical use case.`
        : `Коротко: ${topic} — это техническая тема, которую удобно объяснять через назначение, основные части и типичный сценарий использования.`;
    }

    if (request.mode === "learning") {
      return answerInEnglish ? [
        `Let's break it down: ${topic}`,
        "1. Start with the problem the technology solves.",
        "2. Name the key components.",
        "3. Give a simple practical example.",
        "4. Check your understanding: what breaks if one component is removed?"
      ].join("\n") : [
        `Разберем по шагам: ${topic}`,
        "1. Сначала сформулируй, какую проблему решает технология.",
        "2. Затем назови ключевые компоненты.",
        "3. После этого приведи простой пример из практики.",
        "4. В конце проверь себя вопросом: что сломается, если убрать один из компонентов?"
      ].join("\n");
    }

    return answerInEnglish ? [
      `Interview answer: ${topic}`,
      "Start with a short definition, then name 3-5 key parts and explain how they interact.",
      "A strong structure is purpose, components, workflow, example, and common mistake."
    ].join("\n") : [
      `Интервью-ответ: ${topic}`,
      "Начни с короткого определения, затем перечисли 3-5 ключевых частей и объясни, как они взаимодействуют.",
      "Хорошая структура ответа: назначение, компоненты, поток работы, пример, частая ошибка."
    ].join("\n");
  }
}

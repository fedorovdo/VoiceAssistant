export interface TechnicalTermReplacement {
  from: string;
  to: string;
  reason: string;
}

export interface NormalizedTechnicalText {
  text: string;
  replacements: TechnicalTermReplacement[];
}

interface NormalizationRule {
  pattern: RegExp;
  replacement: string | ((match: string, ...groups: string[]) => string);
  target: string;
  reason: string;
  context?: RegExp;
}

const technicalContext = /(?:kubernetes|кубер(?:нетес|нетис)?|кластер|cluster|pod|поды|service|сервис|docker|докер|linux|линукс|команд|command|контейнер|container|deployment|деплой)/iu;
const kubernetesContext = /(?:kubernetes|кубер(?:нетес|нетис)?|кластер|cluster|pod|поды|pods|service|сервис|deployment|деплой|ingress|ингресс|namespace|неймспейс)/iu;
const dockerContext = /(?:docker|докер|контейнер|container|image|образ|compose|композ|registry|регистри|реджистри)/iu;
const ambiguousKubernetesContext = /(?:кластер|cluster|pod|поды|pods|service|сервис|deployment|деплой|ingress|ингресс|namespace|неймспейс)/iu;
const dockerComposeContext = /(?:docker|докер|контейнер|container|compose\s+(?:up|down|logs)|команда|command)/iu;

const rules: NormalizationRule[] = [
  rule("(?:сервис\\s+кубернетес|кубернетес\\s+сервис)", "Kubernetes service", "Kubernetes service"),
  rule("(?:докер\\s+(?:образ|имидж)|образ\\s+докер)", "Docker image", "Docker image"),
  rule("(?:контейнер\\s+докер|докер\\s+контейнер)", "Docker container", "Docker container"),
  rule("(?:докер\\s*файл|докерфайл)", "Dockerfile", "Dockerfile"),
  rule("(?:докер\\s+композ|docker\\s+композ|докер\\s+compose)", "Docker Compose", "Docker Compose"),
  rule("(?:кубси\\s+тейл|куб\\s+си\\s+тейл|кубсити|кубси|куб\\s+ctl|куб\\s+цтл|куб\\s+си\\s+ти\\s+эл)", "kubectl", "kubectl"),
  rule("(?:кубернетес|кубернетис|кубер)", "Kubernetes", "Kubernetes"),
  rule("(?:кубернетик|кубернетика)", "Kubernetes", "Kubernetes", ambiguousKubernetesContext),
  rule("(?:шедулер|шидулер|шадулер|шадуль|шидуле)", "scheduler", "scheduler"),
  rule("(?:поды|pods)", "pod", "pod", kubernetesContext),
  contextualPodRule(),
  rule("(?:деплоймент|деплой)", "deployment", "deployment"),
  rule("(?:ингресс|ингрэс)", "ingress", "ingress"),
  rule("неймспейс", "namespace", "namespace"),

  rule("докер", "Docker", "Docker"),
  rule("композ", "Docker Compose", "Docker Compose", dockerComposeContext),
  rule("(?:регистри|реджистри)", "registry", "registry", dockerContext),

  rule("(?:систем\\s+си\\s+ти\\s+эл|систем\\s+контрол)", "systemctl", "systemctl"),
  rule("(?:журнал\\s+контрол|журнал\\s+цтл)", "journalctl", "journalctl"),
  rule("(?:эс\\s+эс\\s+команда|команда\\s+эс\\s+эс)", "ss", "ss", technicalContext),
  rule("(?:чмод|си\\s+эйч\\s+мод)", "chmod", "chmod", technicalContext),
  rule("(?:чаун|си\\s+эйч\\s+оун)", "chown", "chown", technicalContext),

  rule("(?:ди\\s+эн\\s+эс|днс)", "DNS", "DNS"),
  rule("(?:ди\\s+эйч\\s+си\\s+пи|дхцп)", "DHCP", "DHCP"),
  rule("нат", "NAT", "NAT", /(?:сеть|сетев|network|маршрут|роутер|router|адрес|ip|порт)/iu),

  rule("(?:актив\\s+директори|эктив\\s+директори|active\\s+директори)", "Active Directory", "Active Directory"),
  rule("групповая\\s+политика", "Group Policy", "Group Policy"),
  rule("(?:джипи\\s+апдейт|gp\\s+update)", "gpupdate", "gpupdate"),
  rule("(?:ди\\s+си\\s+диаг|dc\\s+diag)", "dcdiag", "dcdiag"),
  rule("(?:реп\\s+админ|rep\\s+admin)", "repadmin", "repadmin"),

  rule("пул\\s+реквест", "pull request", "pull request"),
  rule("гит", "Git", "Git"),
  rule("коммит", "commit", "commit"),
  rule("(?:бранч|branches)", "branch", "branch")
];

export function normalizeTechnicalTerms(text: string): NormalizedTechnicalText {
  let normalizedText = text;
  const replacements: TechnicalTermReplacement[] = [];

  for (const normalizationRule of rules) {
    const contextText = normalizedText;
    if (normalizationRule.context && !normalizationRule.context.test(contextText)) {
      continue;
    }

    normalizedText = normalizedText.replace(normalizationRule.pattern, (...args: unknown[]) => {
      const match = String(args[0]);
      const groups = args.slice(1, -2).map(String);
      const replacement = typeof normalizationRule.replacement === "function"
        ? normalizationRule.replacement(match, ...groups)
        : normalizationRule.replacement;

      if (match === replacement) {
        return match;
      }

      replacements.push({
        from: match,
        to: normalizationRule.target,
        reason: normalizationRule.reason
      });
      return replacement;
    });
  }

  return { text: normalizedText, replacements };
}

function rule(
  source: string,
  replacement: string,
  target: string,
  context?: RegExp
): NormalizationRule {
  return {
    pattern: new RegExp(`(?<![\\p{L}\\p{N}])(?:${source})(?![\\p{L}\\p{N}])`, "giu"),
    replacement,
    target,
    reason: "Russian STT technical term normalization",
    context
  };
}

function contextualPodRule(): NormalizationRule {
  return {
    pattern: /(?<![\p{L}\p{N}])((?:что\s+такое|создать|удалить|проверить|описать|запустить)\s+)под(?![\p{L}\p{N}])/giu,
    replacement: (_match, prefix) => `${prefix}pod`,
    target: "pod",
    reason: "Kubernetes context disambiguates Russian 'под'",
    context: kubernetesContext
  };
}

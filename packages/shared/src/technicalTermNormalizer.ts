export interface TechnicalTermReplacement {
  from: string;
  to: string;
  reason: string;
}

export interface NormalizedTechnicalText {
  text: string;
  replacements: TechnicalTermReplacement[];
}

export interface TechnicalTermNormalizationContext {
  currentTopic?: string | null;
  contextText?: string;
}

interface NormalizationRule {
  pattern: RegExp;
  replacement: string | ((match: string, ...groups: string[]) => string);
  target: string;
  reason: string;
  context?: RegExp;
  excludeContext?: RegExp;
}

const technicalContext = /(?:kubernetes|кубер(?:нетес|нетис)?|кластер|cluster|pod|поды|service|сервис|docker|докер|linux|линукс|команд|command|контейнер|container|deployment|деплой)/iu;
const kubernetesContext = /(?:kubernetes|кубер(?:нетес|нетис)?|кластер|cluster|pod|поды|pods|service|сервис|deployment|деплой|ingress|ингресс|namespace|неймспейс)/iu;
const dockerContext = /(?:docker|докер|контейнер|container|image|образ|compose|композ|registry|регистри|реджистри)/iu;
const ambiguousKubernetesContext = /(?:кластер|cluster|pod|поды|pods|service|сервис|deployment|деплой|ingress|ингресс|namespace|неймспейс)/iu;
const dockerComposeContext = /(?:docker|докер|контейнер|container|compose\s+(?:up|down|logs)|команда|command)/iu;
const osiContext = /(?:схем|модел|уров|сет|протокол|networking|network|layer|protocol)/iu;
const oracleCloudContext = /(?:oracle\s+cloud|oracle\s+cloud\s+infrastructure)/iu;

const rules: NormalizationRule[] = [
  rule("(?:сервис\\s+кубернетес|кубернетес\\s+сервис)", "Kubernetes service", "Kubernetes service"),
  rule("(?:докер\\s+(?:образ|имидж)|образ\\s+докер)", "Docker image", "Docker image"),
  rule("слои\\s+докера", "Docker layers", "Docker layers"),
  rule("слой\\s+докера", "Docker layer", "Docker layer"),
  rule("образ(?:а)?\\s+докера", "Docker image", "Docker image"),
  rule("(?:контейнер\\s+докер|докер\\s+контейнер)", "Docker container", "Docker container"),
  rule("(?:(?:докер|docker)[\\s-]*(?:файл(?:е)?|file)|докерфайл(?:е)?)", "Dockerfile", "Dockerfile"),
  repair("что\\s+стоит\\s+dockerfile", "что такое Dockerfile"),
  repair("что\\s+состоит\\s+dockerfile", "из чего состоит Dockerfile"),
  repair("что\\s+в\\s+dockerfile", "из чего состоит Dockerfile"),
  repair("из\\s+чего\\s+dockerfile", "из чего состоит Dockerfile"),
  repair("что\\s+вы\\s+знаете\\s+про\\s+dockerfile", "что такое Dockerfile"),
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
  phraseRepair("как\\s+поменять\\s+пароль\\s+linux", "Как поменять пароль в Linux", "Linux password question"),
  phraseRepair("поменять\\s+пароль\\s+пользователю\\s+в\\s+linux", "Как поменять пароль пользователю в Linux", "Linux password question"),
  rule("(?:журнал\\s+контрол|журнал\\s+цтл)", "journalctl", "journalctl"),
  rule("(?:эс\\s+эс\\s+команда|команда\\s+эс\\s+эс)", "ss", "ss", technicalContext),
  rule("(?:чмод|си\\s+эйч\\s+мод)", "chmod", "chmod", technicalContext),
  rule("(?:чаун|си\\s+эйч\\s+оун)", "chown", "chown", technicalContext),

  contextualRule("систем(?:а|е|у|ой)\\s+oci", "модель OSI", "OSI", osiContext, oracleCloudContext),
  contextualRule("oci", "OSI", "OSI", osiContext, oracleCloudContext),
  contextualRule("(?:оси|ози)", "OSI", "OSI", osiContext),
  contextualRule("(?:tsp/ip|тсп/ip|тсип|тсп\\s+айпи|тцп\\s+айпи)", "TCP/IP", "TCP/IP", /(?:протокол|стек|модел|уров|сет|networking|protocol|layer)/iu),
  contextualRule("уровень\\s+тцп", "уровень TCP", "TCP", /(?:сет|networking|protocol|layer|уров)/iu),

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

export function normalizeTechnicalTerms(
  text: string,
  context: TechnicalTermNormalizationContext = {}
): NormalizedTechnicalText {
  let normalizedText = text;
  const replacements: TechnicalTermReplacement[] = [];

  for (const normalizationRule of rules) {
    const contextText = [normalizedText, context.contextText, context.currentTopic].filter(Boolean).join(" ");
    if (normalizationRule.excludeContext?.test(contextText)) {
      continue;
    }
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

  normalizedText = normalizedText.replace(/\bOSI\s+модель(?=$|[^\p{L}\p{N}])/giu, "модель OSI");

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

function contextualRule(
  source: string,
  replacement: string,
  target: string,
  context: RegExp,
  excludeContext?: RegExp
): NormalizationRule {
  return {
    ...rule(source, replacement, target, context),
    excludeContext
  };
}

function repair(source: string, replacement: string): NormalizationRule {
  return {
    pattern: new RegExp(`(?<![\\p{L}\\p{N}])(?:${source})(?![\\p{L}\\p{N}])`, "giu"),
    replacement,
    target: replacement,
    reason: "Dockerfile-specific STT phrase repair"
  };
}

function phraseRepair(source: string, replacement: string, target: string): NormalizationRule {
  return {
    pattern: new RegExp(`(?<![\\p{L}\\p{N}])(?:${source})(?![\\p{L}\\p{N}])`, "giu"),
    replacement,
    target,
    reason: "Technical STT phrase repair"
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

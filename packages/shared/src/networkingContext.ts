export type NetworkingSubtopic =
  | "tcp_ip_model"
  | "osi_model"
  | "protocol_layers"
  | "firewall"
  | "ports"
  | "topology";

export type NetworkingFocusedEntity =
  | "TCP"
  | "UDP"
  | "IP"
  | "DNS"
  | "DHCP"
  | "ARP"
  | "VLAN"
  | "ICMP"
  | "OSI"
  | "TCP/IP";

export interface NetworkingContextSnapshot {
  broadTopic: "Networking" | null;
  subtopic?: NetworkingSubtopic;
  focusedEntity?: NetworkingFocusedEntity;
  lastValidQuestion?: string;
  updatedAt?: number;
  ageMs?: number;
}

export interface NetworkingContextDetection {
  subtopic?: NetworkingSubtopic;
  focusedEntity?: NetworkingFocusedEntity;
}

export interface NetworkingFollowUpResult {
  text: string;
  contextUsed: boolean;
  snapshot: NetworkingContextSnapshot;
}

export interface NetworkingContextTransition {
  previous: NetworkingContextSnapshot;
  detected: NetworkingContextDetection;
  effective: NetworkingContextSnapshot;
}

export interface NetworkingConversationContextOptions {
  ttlMs?: number;
}

export class NetworkingConversationContext {
  private readonly ttlMs: number;
  private state: NetworkingContextSnapshot = { broadTopic: null };

  constructor(options: NetworkingConversationContextOptions = {}) {
    this.ttlMs = options.ttlMs ?? 90_000;
  }

  getSnapshot(timestamp = Date.now()): NetworkingContextSnapshot {
    if (this.state.updatedAt === undefined || timestamp - this.state.updatedAt > this.ttlMs) {
      return { broadTopic: null };
    }
    return { ...this.state, ageMs: Math.max(0, timestamp - this.state.updatedAt) };
  }

  accept(text: string, timestamp = Date.now()): NetworkingContextTransition {
    const previous = this.getSnapshot(timestamp);
    const detected = detectNetworkingContext(text);
    if (!detected.subtopic && !detected.focusedEntity) {
      return { previous, detected, effective: previous };
    }

    const effective: NetworkingContextSnapshot = {
      broadTopic: "Networking",
      subtopic: detected.subtopic ?? previous.subtopic,
      focusedEntity: detected.focusedEntity ?? previous.focusedEntity,
      lastValidQuestion: cleanup(text),
      updatedAt: timestamp,
      ageMs: 0
    };
    this.state = effective;
    return { previous, detected, effective };
  }

  enrichFollowUp(text: string, timestamp = Date.now()): NetworkingFollowUpResult {
    const snapshot = this.getSnapshot(timestamp);
    if (snapshot.broadTopic !== "Networking") return { text, contextUsed: false, snapshot };

    const normalized = normalize(text);
    const punctuation = text.trim().match(/[?.!]$/)?.[0] ?? "?";
    if (/^сколько\s+уровней$/.test(normalized)) {
      if (snapshot.subtopic === "tcp_ip_model") {
        return { text: `Сколько уровней TCP/IP${punctuation}`, contextUsed: true, snapshot };
      }
      if (snapshot.subtopic === "osi_model") {
        return { text: `Сколько уровней OSI${punctuation}`, contextUsed: true, snapshot };
      }
    }

    if (/^(?:а\s+он\s+)?на\s+каком\s+уровне\s+работает$/.test(normalized) && snapshot.focusedEntity) {
      return { text: `На каком уровне работает ${snapshot.focusedEntity}${punctuation}`, contextUsed: true, snapshot };
    }

    const shortEntity = normalized.match(/^а\s+(tcp|udp|ip|dns|dhcp|arp|vlan|icmp)$/i)?.[1];
    if (shortEntity) {
      return {
        text: `На каком уровне работает ${shortEntity.toUpperCase()}${punctuation}`,
        contextUsed: true,
        snapshot
      };
    }

    return { text, contextUsed: false, snapshot };
  }

  clear(): void {
    this.state = { broadTopic: null };
  }
}

export function detectNetworkingContext(text: string): NetworkingContextDetection {
  const normalized = normalize(text);
  const focusedEntity = detectEntity(normalized);

  if (/\bosi\b/.test(normalized) && /(?:модел|схем|уровн)/.test(normalized)) {
    return { subtopic: "osi_model", focusedEntity: "OSI" };
  }
  if (/\btcp\/ip\b/.test(normalized) && /(?:модел|стек|уровн|протокол)/.test(normalized)) {
    return { subtopic: "tcp_ip_model", focusedEntity: "TCP/IP" };
  }
  if (/(?:на\s+каком\s+уровне|где\s+работает)/.test(normalized) && focusedEntity) {
    return { subtopic: "protocol_layers", focusedEntity };
  }
  if (/что\s+такое/.test(normalized) && /протокол/.test(normalized) && focusedEntity) {
    return { subtopic: "protocol_layers", focusedEntity };
  }
  if (/\b(?:firewall|ufw|firewalld|iptables)\b/.test(normalized)) {
    return { subtopic: "firewall", focusedEntity };
  }
  if (/(?:открыт|слуша|провер).{0,24}\bпорт|\bпорт(?:ы|ов)?\b/.test(normalized)) {
    return { subtopic: "ports", focusedEntity };
  }
  if (/(?:тополог|схем[аы]\s+сет)/.test(normalized)) {
    return { subtopic: "topology", focusedEntity };
  }
  if (focusedEntity && /^(?:а\s+)?(?:tcp|udp|ip|dns|dhcp|arp|vlan|icmp)[?.! ]*$/.test(normalized)) {
    return { subtopic: "protocol_layers", focusedEntity };
  }
  return { focusedEntity };
}

export type NetworkingFocusedResponseType =
  | "tcp_ip_level_count"
  | "osi_level_count"
  | "protocol_layer"
  | "tcp_ip_suite_layers"
  | "ip_protocol_definition";

export interface NetworkingFocusedResponse {
  type: NetworkingFocusedResponseType;
  text: string;
}

export function getNetworkingFocusedResponse(
  text: string,
  language: "ru" | "en"
): NetworkingFocusedResponse | undefined {
  const normalized = normalize(text);
  if (/сколько\s+уровн/.test(normalized) && /\btcp\/ip\b/.test(normalized)) {
    return {
      type: "tcp_ip_level_count",
      text: language === "ru"
        ? "Обычно в модели TCP/IP выделяют 4 уровня: Application, Transport, Internet и Network Access/Link."
        : "The TCP/IP model usually has 4 layers: Application, Transport, Internet, and Network Access/Link."
    };
  }
  if (/сколько\s+уровн/.test(normalized) && /\bosi\b/.test(normalized)) {
    return {
      type: "osi_level_count",
      text: language === "ru"
        ? "В модели OSI 7 уровней: Physical, Data Link, Network, Transport, Session, Presentation и Application."
        : "The OSI model has 7 layers: Physical, Data Link, Network, Transport, Session, Presentation, and Application."
    };
  }

  if (/на\s+каком\s+уровне/.test(normalized) && /\btcp\/ip\b/.test(normalized)) {
    return {
      type: "tcp_ip_suite_layers",
      text: language === "ru"
        ? "TCP/IP — это стек, а не один протокол: TCP работает на транспортном уровне, а IP — на Internet layer модели TCP/IP или сетевом уровне OSI."
        : "TCP/IP is a suite, not one protocol: TCP operates at Transport, while IP operates at the TCP/IP Internet layer or OSI Network layer."
    };
  }
  if (/что\s+такое\s+ip(?:-?протокол)?/.test(normalized)) {
    return {
      type: "ip_protocol_definition",
      text: language === "ru"
        ? "IP работает на сетевом/Internet уровне и отвечает за адресацию и маршрутизацию пакетов между сетями."
        : "IP operates at the Network/Internet layer and provides packet addressing and routing between networks."
    };
  }

  if (/(?:на\s+каком\s+уровне|где\s+работает)/.test(normalized)) {
    const entity = detectEntity(normalized);
    const layer = entity ? protocolLayer(entity, language) : undefined;
    if (entity && layer) return { type: "protocol_layer", text: layer };
  }
  return undefined;
}

function detectEntity(text: string): NetworkingFocusedEntity | undefined {
  if (/\btcp\/ip\b/.test(text)) return "TCP/IP";
  if (/\bosi\b/.test(text)) return "OSI";
  for (const entity of ["TCP", "UDP", "IP", "DNS", "DHCP", "ARP", "VLAN", "ICMP"] as const) {
    if (new RegExp(`(?:^|[^a-zа-я0-9])${entity.toLowerCase()}(?=$|[^a-zа-я0-9])`, "i").test(text)) return entity;
  }
  return undefined;
}

function protocolLayer(entity: NetworkingFocusedEntity, language: "ru" | "en"): string | undefined {
  const ru: Partial<Record<NetworkingFocusedEntity, string>> = {
    TCP: "TCP работает на транспортном уровне: Transport в OSI и TCP/IP.",
    UDP: "UDP работает на транспортном уровне: Transport в OSI и TCP/IP.",
    IP: "IP работает на сетевом уровне OSI и на Internet layer модели TCP/IP.",
    DNS: "DNS — протокол прикладного уровня; обычно он использует UDP или TCP на транспортном уровне.",
    DHCP: "DHCP — протокол прикладного уровня, работающий поверх UDP.",
    ARP: "ARP относят к канальному уровню OSI или Link layer TCP/IP.",
    VLAN: "VLAN работает на канальном уровне OSI, то есть Data Link.",
    ICMP: "ICMP работает на сетевом уровне OSI и на Internet layer TCP/IP."
  };
  const en: Partial<Record<NetworkingFocusedEntity, string>> = {
    TCP: "TCP operates at the Transport layer in both OSI and TCP/IP.",
    UDP: "UDP operates at the Transport layer in both OSI and TCP/IP.",
    IP: "IP operates at the OSI Network layer and the TCP/IP Internet layer.",
    DNS: "DNS is an Application-layer protocol that usually uses UDP or TCP as transport.",
    DHCP: "DHCP is an Application-layer protocol running over UDP.",
    ARP: "ARP belongs to the OSI Data Link layer or the TCP/IP Link layer.",
    VLAN: "VLAN operates at the OSI Data Link layer.",
    ICMP: "ICMP operates at the OSI Network layer and the TCP/IP Internet layer."
  };
  return (language === "ru" ? ru : en)[entity];
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/ё/g, "е").replace(/[?!.,;:]+/g, " ").replace(/\s+/g, " ").trim();
}

function cleanup(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

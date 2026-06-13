export interface KnowledgeCard {
  id: string;
  title: string;
  aliases: string[];
  category: "linux" | "docker" | "kubernetes" | "networking" | "active-directory";
  shortExplanation: string;
  bullets: string[];
  commands: string[];
  relatedTerms: string[];
}

export const knowledgeCards: KnowledgeCard[] = [
  card("linux-open-ports", "Проверка открытых портов в Linux", ["check open ports in linux", "как проверить открытые порты linux", "как проверить открытые порты в linux", "открытые порты linux", "listening ports linux"], "linux", "Показывает, какие процессы слушают сетевые порты и какие соединения активны.", ["Для новых систем обычно используют ss.", "Ключи -lntup показывают listening TCP/UDP-порты и процессы.", "Для проверки доступности извне дополнительно учитывайте firewall."], ["sudo ss -lntup", "sudo lsof -i -P -n"], ["ss", "netstat", "port"]),
  card("linux-ss", "Команда ss", ["ss command", "команда ss", "ss -lntup", "socket statistics"], "linux", "Современная Linux-утилита для просмотра сокетов, портов и сетевых соединений.", ["Работает быстрее netstat на больших системах.", "Может показывать TCP, UDP, listening-сокеты и связанные процессы."], ["ss -lnt", "sudo ss -lntup"], ["netstat", "port", "linux-open-ports"]),
  card("linux-netstat", "Команда netstat", ["netstat command", "команда netstat", "netstat -tulpn"], "linux", "Классическая утилита для сетевых соединений и таблиц маршрутизации; на новых Linux часто заменена на ss.", ["Полезна на старых системах и в знакомых runbook.", "Пакет net-tools может быть не установлен по умолчанию."], ["sudo netstat -tulpn", "netstat -rn"], ["ss", "routing", "port"]),
  card("linux-journalctl", "journalctl", ["journalctl command", "команда journalctl", "systemd logs", "логи systemd", "journalctl -u"], "linux", "Читает системный журнал systemd и логи служб.", ["Фильтрует записи по unit, времени и приоритету.", "Ключ -f показывает новые записи в реальном времени."], ["journalctl -u nginx --since today", "journalctl -f", "journalctl -p err -b"], ["systemctl", "logs", "systemd"]),
  card("linux-systemctl", "systemctl", ["systemctl command", "команда systemctl", "systemd service", "управление сервисами linux"], "linux", "Управляет службами и другими unit-объектами systemd.", ["Основные действия: status, start, stop, restart, enable.", "enable включает автозапуск, но не обязательно запускает сервис прямо сейчас."], ["systemctl status nginx", "sudo systemctl restart nginx", "sudo systemctl enable --now nginx"], ["journalctl", "systemd", "service"]),
  card("linux-df", "df -h", ["df -h command", "команда df -h", "проверить место на диске linux", "disk space linux"], "linux", "Показывает использование файловых систем в удобных для чтения единицах.", ["Смотрите столбцы Size, Used, Avail и Use%.", "df показывает файловые системы, а du помогает найти крупные каталоги."], ["df -h", "du -sh /var/* | sort -h"], ["disk", "filesystem", "du"]),
  card("linux-free", "free -h", ["free -h command", "команда free -h", "память linux", "linux memory usage"], "linux", "Показывает использование оперативной памяти и swap в Linux.", ["Поле available обычно полезнее, чем просто free.", "Linux использует свободную память под кеш и освобождает ее при необходимости."], ["free -h", "watch -n 2 free -h"], ["memory", "swap", "linux"]),

  card("docker-image", "Docker image", ["docker image", "образ docker", "docker образ", "что такое docker image"], "docker", "Неизменяемый шаблон с приложением, зависимостями и метаданными для запуска контейнеров.", ["Image строится слоями.", "Один image может запускать много контейнеров.", "Обычно хранится в registry."], ["docker image ls", "docker inspect IMAGE"], ["docker-container", "dockerfile", "registry"]),
  card("docker-container", "Docker container", ["docker container", "контейнер docker", "docker контейнер", "что такое контейнер"], "docker", "Запущенный или остановленный экземпляр Docker image с изолированными процессами и файловой системой.", ["Контейнер не является полноценной виртуальной машиной.", "Изменяемые данные лучше хранить в volume."], ["docker ps -a", "docker inspect CONTAINER"], ["docker-image", "docker-run", "volume"]),
  card("dockerfile", "Dockerfile", ["dockerfile", "docker file", "докерфайл", "что такое dockerfile"], "docker", "Текстовый рецепт сборки Docker image из последовательности инструкций.", ["FROM задает базовый image.", "COPY и RUN формируют слои.", "CMD или ENTRYPOINT задают запуск контейнера."], ["docker build -t my-app ."], ["docker-image", "docker-build"]),
  card("docker-build", "docker build", ["docker build", "собрать docker image", "сборка docker образа"], "docker", "Собирает Docker image по Dockerfile и build context.", ["Контекст обычно указывается последним аргументом.", "Тег -t делает image удобным для запуска и публикации."], ["docker build -t my-app:latest .", "docker build --no-cache -t my-app ."], ["dockerfile", "docker-image"]),
  card("docker-run", "docker run", ["docker run", "запустить docker контейнер", "run container"], "docker", "Создает контейнер из image и запускает его.", ["-d запускает в фоне.", "-p публикует порт, -v подключает volume, --rm удаляет контейнер после остановки."], ["docker run --rm -p 8080:80 nginx", "docker run -d --name app my-app"], ["docker-container", "docker-image"]),
  card("docker-ps", "docker ps", ["docker ps", "список docker контейнеров", "list docker containers"], "docker", "Показывает запущенные контейнеры и их состояние.", ["Без ключей видны только запущенные контейнеры.", "-a добавляет остановленные контейнеры."], ["docker ps", "docker ps -a", "docker ps --format \"table {{.Names}}\\t{{.Status}}\\t{{.Ports}}\""], ["docker-container", "docker-logs"]),
  card("docker-logs", "docker logs", ["docker logs", "логи docker контейнера", "container logs"], "docker", "Показывает stdout и stderr выбранного контейнера.", ["-f продолжает следить за новыми строками.", "--since ограничивает временной диапазон."], ["docker logs CONTAINER", "docker logs -f --tail 100 CONTAINER"], ["docker-container", "journalctl"]),

  card("kubernetes-pod", "Kubernetes pod", ["kubernetes pod", "k8s pod", "под kubernetes", "что такое pod", "что такое под в kubernetes"], "kubernetes", "Минимальная единица запуска в Kubernetes: один или несколько контейнеров с общей сетью и томами.", ["Pod обычно создается контроллером, а не вручную.", "Контейнеры внутри Pod используют один IP и могут обращаться через localhost.", "Pod считается временным объектом."], ["kubectl get pods", "kubectl describe pod POD"], ["deployment", "container", "service"]),
  card("kubernetes-deployment", "Kubernetes deployment", ["kubernetes deployment", "k8s deployment", "деплоймент kubernetes", "что такое deployment"], "kubernetes", "Контроллер, который поддерживает нужное число реплик Pod и выполняет обновления приложения.", ["Управляет ReplicaSet.", "Поддерживает rolling update и rollback.", "Желаемое состояние хранится в manifest."], ["kubectl get deployments", "kubectl rollout status deployment/APP", "kubectl rollout undo deployment/APP"], ["pod", "replicaset", "kubectl"]),
  card("kubernetes-service", "Kubernetes service", ["kubernetes service", "k8s service", "сервис kubernetes", "что такое service kubernetes"], "kubernetes", "Стабильная виртуальная точка доступа к группе Pod, выбранных selector-ом.", ["Service отделяет клиентов от временных IP Pod.", "Частые типы: ClusterIP, NodePort и LoadBalancer."], ["kubectl get services", "kubectl describe service SERVICE"], ["pod", "ingress", "dns"]),
  card("kubernetes-ingress", "Kubernetes ingress", ["kubernetes ingress", "k8s ingress", "ингресс kubernetes", "что такое ingress", "ingress"], "kubernetes", "Правила HTTP/HTTPS-маршрутизации внешнего трафика к Kubernetes Service.", ["Для работы нужен Ingress Controller.", "Обычно маршрутизирует по hostname и URL path.", "TLS настраивается через Secret и правила ingress."], ["kubectl get ingress", "kubectl describe ingress INGRESS"], ["service", "load balancer", "dns"]),
  card("kubectl-get-pods", "kubectl get pods", ["kubectl get pods", "список pod kubernetes", "показать поды", "list kubernetes pods"], "kubernetes", "Показывает Pod, их готовность, статус, перезапуски и возраст.", ["-A показывает все namespaces.", "-o wide добавляет node, IP и другие детали."], ["kubectl get pods", "kubectl get pods -A -o wide"], ["pod", "kubectl-describe", "kubectl-logs"]),
  card("kubectl-describe", "kubectl describe", ["kubectl describe", "описание ресурса kubernetes", "describe pod"], "kubernetes", "Показывает подробное состояние ресурса и связанные события Kubernetes.", ["Особенно полезно при Pending, CrashLoopBackOff и ошибках scheduling.", "События внизу часто объясняют причину проблемы."], ["kubectl describe pod POD", "kubectl describe deployment APP"], ["kubectl-get-pods", "events"]),
  card("kubectl-logs", "kubectl logs", ["kubectl logs", "логи pod kubernetes", "логи kubernetes", "pod logs"], "kubernetes", "Читает stdout и stderr контейнера внутри Pod.", ["Для нескольких контейнеров укажите -c.", "--previous показывает логи предыдущего упавшего контейнера."], ["kubectl logs POD", "kubectl logs -f POD -c CONTAINER", "kubectl logs POD --previous"], ["pod", "kubectl-describe", "logs"]),

  card("network-nat", "NAT", ["nat", "network address translation", "что такое nat", "трансляция сетевых адресов"], "networking", "Преобразует IP-адреса и иногда порты между сетями, часто между частной сетью и интернетом.", ["SNAT меняет адрес источника.", "DNAT меняет адрес назначения.", "PAT позволяет многим устройствам делить один внешний IP через разные порты."], ["iptables -t nat -L -n -v", "Get-NetNat"], ["port", "routing", "firewall"]),
  card("network-dns", "DNS", ["dns", "domain name system", "что такое dns", "как работает dns", "система доменных имен"], "networking", "Преобразует доменные имена в IP-адреса и хранит другие записи о доменах.", ["Клиент обычно обращается к recursive resolver.", "A/AAAA указывают адрес, CNAME — псевдоним, MX — почтовый сервер.", "Кеш и TTL влияют на скорость распространения изменений."], ["nslookup example.com", "dig example.com A"], ["nslookup", "active-directory-dns", "dhcp"]),
  card("network-dhcp", "DHCP", ["dhcp", "dynamic host configuration protocol", "что такое dhcp", "как работает dhcp"], "networking", "Автоматически выдает клиентам IP-настройки: адрес, маску, gateway, DNS и срок аренды.", ["Классическая последовательность: Discover, Offer, Request, Acknowledge.", "Reservation закрепляет адрес за конкретным клиентом."], ["ipconfig /all", "ipconfig /renew", "nmcli device show"], ["dns", "ip address", "dhcp-role"]),
  card("network-ping", "ping", ["ping command", "команда ping", "проверить доступность хоста", "icmp ping"], "networking", "Проверяет сетевую достижимость и приблизительную задержку с помощью ICMP Echo.", ["Успешный ping не гарантирует работу нужного TCP-порта.", "ICMP может быть заблокирован firewall, даже если сервис доступен."], ["ping 8.8.8.8", "ping example.com"], ["traceroute", "dns", "port"]),
  card("network-traceroute", "traceroute / tracert", ["traceroute", "tracert", "trace route", "трассировка маршрута", "как проверить маршрут"], "networking", "Показывает последовательность сетевых узлов до назначения и помогает искать участок задержки или потерь.", ["В Linux обычно используется traceroute или tracepath.", "В Windows используется tracert.", "Некоторые промежуточные узлы не отвечают на диагностические пакеты."], ["traceroute example.com", "tracert example.com"], ["ping", "routing"]),
  card("network-dns-tools", "nslookup / dig", ["nslookup", "dig command", "команда dig", "проверить dns", "dns lookup"], "networking", "Диагностические утилиты для запроса DNS-записей и проверки resolver-ов.", ["nslookup доступен на Windows и многих Unix-системах.", "dig дает более подробный и скриптуемый ответ."], ["nslookup example.com", "nslookup example.com 8.8.8.8", "dig example.com +short"], ["dns", "active-directory-dns"]),

  card("active-directory", "Active Directory", ["active directory", "актив директори", "что такое active directory", "ad domain"], "active-directory", "Каталог Microsoft для централизованного управления пользователями, компьютерами, группами и политиками домена.", ["Основной протокол каталога — LDAP, аутентификация обычно использует Kerberos.", "Структура включает forest, domain и organizational units.", "AD сильно зависит от корректного DNS."], ["Get-ADDomain", "Get-ADUser -Filter *"], ["domain-controller", "group-policy", "active-directory-dns"]),
  card("domain-controller", "Domain Controller", ["domain controller", "контроллер домена", "что такое domain controller", "dc active directory"], "active-directory", "Сервер с ролью AD DS, который аутентифицирует пользователей и хранит реплицируемую копию каталога.", ["Обычно также участвует в DNS домена.", "Несколько DC повышают отказоустойчивость.", "FSMO-роли распределяют отдельные обязанности."], ["Get-ADDomainController -Filter *", "dcdiag"], ["active-directory", "active-directory-dns", "kerberos"]),
  card("group-policy", "Group Policy", ["group policy", "групповая политика", "gpo", "что такое group policy"], "active-directory", "Механизм централизованной настройки пользователей и компьютеров Windows в домене.", ["Настройки хранятся в GPO и связываются с site, domain или OU.", "Порядок и наследование влияют на итоговую политику."], ["gpupdate /force", "gpresult /r", "Get-GPO -All"], ["active-directory", "organizational unit"]),
  card("active-directory-dns", "DNS в Active Directory", ["dns in ad", "dns в active directory", "ad dns", "dns active directory"], "active-directory", "DNS помогает клиентам находить контроллеры домена и службы AD через специальные SRV-записи.", ["Клиенты домена должны использовать DNS, знающий зону AD.", "Ошибочный внешний DNS часто ломает domain join и вход.", "AD-integrated зоны могут реплицироваться через каталог."], ["nslookup -type=SRV _ldap._tcp.dc._msdcs.DOMAIN", "dcdiag /test:dns"], ["active-directory", "domain-controller", "dns"]),
  card("dhcp-role", "DHCP role", ["dhcp role", "роль dhcp", "dhcp server windows", "dhcp в windows server"], "active-directory", "Серверная роль, которая централизованно выдает IP-конфигурацию клиентам сети.", ["Scope определяет пул адресов и параметры сети.", "В доменной среде DHCP-сервер обычно авторизуют в AD.", "Failover помогает обеспечить доступность выдачи адресов."], ["Get-DhcpServerv4Scope", "Get-DhcpServerInDC"], ["dhcp", "active-directory", "dns"])
];

const ambiguousAliases = new Set(["pod", "под", "log", "logs", "service", "сервис", "ss", "free"]);
const intentMarkers = ["что такое", "как работает", "для чего", "как проверить", "как настроить", "команда", "command", "explain", "check", "show", "list"];
const contextMarkers = ["linux", "docker", "container", "контейнер", "kubernetes", "k8s", "kubectl", "systemd", "порт", "port", "memory", "память"];

export function findKnowledgeCards(text: string): KnowledgeCard[] {
  const normalizedText = normalize(text);
  if (!normalizedText) return [];

  return knowledgeCards
    .map((knowledgeCard, index) => ({ knowledgeCard, index, score: scoreCard(knowledgeCard, normalizedText) }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, 3)
    .map((result) => result.knowledgeCard);
}

function scoreCard(knowledgeCard: KnowledgeCard, text: string): number {
  const candidates = [knowledgeCard.title, ...knowledgeCard.aliases].map(normalize);
  let score = 0;

  for (const candidate of candidates) {
    if (!candidate || !containsPhrase(text, candidate)) continue;
    if (ambiguousAliases.has(candidate) && !hasTechnicalContext(text, candidate)) continue;

    const exactBonus = text === candidate ? 40 : 0;
    const titleBonus = candidate === normalize(knowledgeCard.title) ? 20 : 0;
    score = Math.max(score, candidate.length + exactBonus + titleBonus);
  }

  return score;
}

function hasTechnicalContext(text: string, alias: string): boolean {
  if (intentMarkers.some((marker) => text.includes(marker))) return true;
  if (contextMarkers.some((marker) => marker !== alias && text.includes(marker))) return true;
  return text.split(" ").length >= 3;
}

function containsPhrase(text: string, phrase: string): boolean {
  return ` ${text} `.includes(` ${phrase} `);
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9+./-]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function card(
  id: string,
  title: string,
  aliases: string[],
  category: KnowledgeCard["category"],
  shortExplanation: string,
  bullets: string[],
  commands: string[],
  relatedTerms: string[]
): KnowledgeCard {
  return { id, title, aliases, category, shortExplanation, bullets, commands, relatedTerms };
}

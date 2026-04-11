/**
 * vipStickers.ts — Biblioteca de stickers e elementos gráficos da marca Barbearia VIP
 * Todos os elementos são SVGs inline no padrão premium: preto/grafite + dourado #D4AF37
 */

export type StickerCategory = "selos" | "badges" | "linhas" | "icones" | "molduras" | "textos";

export interface VipSticker {
  id: string;
  name: string;
  category: StickerCategory;
  svg: string; // SVG completo como string
  defaultWidth: number;
  defaultHeight: number;
}

// ── Paleta VIP ────────────────────────────────────────────────────────────────
const GOLD = "#D4AF37";
const GOLD_LIGHT = "#F0C040";
const DARK = "#0A0A0A";
const WHITE = "#FFFFFF";

// ── Selos ─────────────────────────────────────────────────────────────────────

const seloCircular: VipSticker = {
  id: "selo-circular",
  name: "Selo Circular VIP",
  category: "selos",
  defaultWidth: 120,
  defaultHeight: 120,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <circle cx="60" cy="60" r="56" fill="${DARK}" stroke="${GOLD}" stroke-width="2.5"/>
  <circle cx="60" cy="60" r="48" fill="none" stroke="${GOLD}" stroke-width="0.8" stroke-dasharray="3,3"/>
  <text x="60" y="52" text-anchor="middle" fill="${GOLD}" font-family="Georgia,serif" font-size="9" letter-spacing="3" font-weight="bold">BARBEARIA</text>
  <text x="60" y="66" text-anchor="middle" fill="${WHITE}" font-family="Arial,sans-serif" font-size="16" font-weight="900" letter-spacing="2">VIP</text>
  <text x="60" y="78" text-anchor="middle" fill="${GOLD}" font-family="Georgia,serif" font-size="7" letter-spacing="4">PREMIUM</text>
  <path d="M30,85 L90,85" stroke="${GOLD}" stroke-width="0.6" opacity="0.6"/>
</svg>`,
};

const seloEstrela: VipSticker = {
  id: "selo-estrela",
  name: "Selo Estrela Dourada",
  category: "selos",
  defaultWidth: 120,
  defaultHeight: 120,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <polygon points="60,8 73,42 110,42 81,63 92,97 60,76 28,97 39,63 10,42 47,42" fill="${DARK}" stroke="${GOLD}" stroke-width="2"/>
  <polygon points="60,18 71,46 100,46 77,62 86,90 60,73 34,90 43,62 20,46 49,46" fill="none" stroke="${GOLD}" stroke-width="0.5" opacity="0.5"/>
  <text x="60" y="57" text-anchor="middle" fill="${GOLD}" font-family="Arial,sans-serif" font-size="11" font-weight="900" letter-spacing="1">VIP</text>
  <text x="60" y="70" text-anchor="middle" fill="${WHITE}" font-family="Georgia,serif" font-size="7" letter-spacing="2">PREMIUM</text>
</svg>`,
};

const seloHexagonal: VipSticker = {
  id: "selo-hexagonal",
  name: "Selo Hexagonal",
  category: "selos",
  defaultWidth: 110,
  defaultHeight: 120,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 120">
  <polygon points="55,4 104,30 104,90 55,116 6,90 6,30" fill="${DARK}" stroke="${GOLD}" stroke-width="2.5"/>
  <polygon points="55,12 96,35 96,85 55,108 14,85 14,35" fill="none" stroke="${GOLD}" stroke-width="0.7" opacity="0.5"/>
  <text x="55" y="52" text-anchor="middle" fill="${GOLD}" font-family="Georgia,serif" font-size="8" letter-spacing="3">SINCE</text>
  <text x="55" y="68" text-anchor="middle" fill="${WHITE}" font-family="Arial,sans-serif" font-size="18" font-weight="900" letter-spacing="1">VIP</text>
  <text x="55" y="82" text-anchor="middle" fill="${GOLD}" font-family="Georgia,serif" font-size="8" letter-spacing="2">2015</text>
</svg>`,
};

const seloRombo: VipSticker = {
  id: "selo-rombo",
  name: "Selo Rombo Premium",
  category: "selos",
  defaultWidth: 120,
  defaultHeight: 120,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <polygon points="60,5 115,60 60,115 5,60" fill="${DARK}" stroke="${GOLD}" stroke-width="2.5"/>
  <polygon points="60,14 106,60 60,106 14,60" fill="none" stroke="${GOLD}" stroke-width="0.7" opacity="0.4"/>
  <text x="60" y="54" text-anchor="middle" fill="${GOLD}" font-family="Georgia,serif" font-size="8" letter-spacing="3">BARBEARIA</text>
  <text x="60" y="68" text-anchor="middle" fill="${WHITE}" font-family="Arial,sans-serif" font-size="16" font-weight="900" letter-spacing="2">VIP</text>
  <text x="60" y="80" text-anchor="middle" fill="${GOLD}" font-family="Georgia,serif" font-size="7" letter-spacing="3">LUXURY</text>
</svg>`,
};

// ── Badges ────────────────────────────────────────────────────────────────────

const badgeExclusivo: VipSticker = {
  id: "badge-exclusivo",
  name: "Badge Exclusivo",
  category: "badges",
  defaultWidth: 160,
  defaultHeight: 50,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 50">
  <rect x="1" y="1" width="158" height="48" rx="4" fill="${DARK}" stroke="${GOLD}" stroke-width="1.5"/>
  <rect x="5" y="5" width="150" height="40" rx="2" fill="none" stroke="${GOLD}" stroke-width="0.5" opacity="0.4"/>
  <text x="80" y="31" text-anchor="middle" fill="${GOLD}" font-family="Arial,sans-serif" font-size="14" font-weight="900" letter-spacing="4">EXCLUSIVO</text>
</svg>`,
};

const badgeVipMember: VipSticker = {
  id: "badge-vip-member",
  name: "Badge VIP Member",
  category: "badges",
  defaultWidth: 160,
  defaultHeight: 60,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 60">
  <rect x="1" y="1" width="158" height="58" rx="6" fill="${DARK}" stroke="${GOLD}" stroke-width="2"/>
  <rect x="6" y="6" width="148" height="48" rx="4" fill="none" stroke="${GOLD}" stroke-width="0.5" opacity="0.3"/>
  <text x="80" y="28" text-anchor="middle" fill="${GOLD}" font-family="Georgia,serif" font-size="9" letter-spacing="4">MEMBRO</text>
  <text x="80" y="46" text-anchor="middle" fill="${WHITE}" font-family="Arial,sans-serif" font-size="16" font-weight="900" letter-spacing="3">VIP</text>
</svg>`,
};

const badgePremium: VipSticker = {
  id: "badge-premium",
  name: "Badge Premium",
  category: "badges",
  defaultWidth: 140,
  defaultHeight: 50,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 50">
  <path d="M20,1 L120,1 L139,25 L120,49 L20,49 L1,25 Z" fill="${DARK}" stroke="${GOLD}" stroke-width="1.5"/>
  <path d="M22,5 L118,5 L135,25 L118,45 L22,45 L5,25 Z" fill="none" stroke="${GOLD}" stroke-width="0.5" opacity="0.3"/>
  <text x="70" y="30" text-anchor="middle" fill="${GOLD}" font-family="Arial,sans-serif" font-size="13" font-weight="900" letter-spacing="4">PREMIUM</text>
</svg>`,
};

const badgeNovo: VipSticker = {
  id: "badge-novo",
  name: "Badge NOVO",
  category: "badges",
  defaultWidth: 90,
  defaultHeight: 90,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 90">
  <circle cx="45" cy="45" r="42" fill="${GOLD}" stroke="${DARK}" stroke-width="2"/>
  <circle cx="45" cy="45" r="36" fill="none" stroke="${DARK}" stroke-width="0.8" opacity="0.3"/>
  <text x="45" y="52" text-anchor="middle" fill="${DARK}" font-family="Arial,sans-serif" font-size="20" font-weight="900" letter-spacing="1">NOVO</text>
</svg>`,
};

const badgeOferta: VipSticker = {
  id: "badge-oferta",
  name: "Badge Oferta Especial",
  category: "badges",
  defaultWidth: 100,
  defaultHeight: 100,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M50,3 L61,35 L95,35 L68,57 L79,89 L50,68 L21,89 L32,57 L5,35 L39,35 Z" fill="${GOLD}" stroke="${DARK}" stroke-width="1.5"/>
  <text x="50" y="48" text-anchor="middle" fill="${DARK}" font-family="Georgia,serif" font-size="7" font-weight="bold" letter-spacing="1">OFERTA</text>
  <text x="50" y="62" text-anchor="middle" fill="${DARK}" font-family="Arial,sans-serif" font-size="10" font-weight="900">ESPECIAL</text>
</svg>`,
};

// ── Linhas e Divisores ────────────────────────────────────────────────────────

const linhaDouradaSimples: VipSticker = {
  id: "linha-dourada-simples",
  name: "Linha Dourada",
  category: "linhas",
  defaultWidth: 200,
  defaultHeight: 12,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 12">
  <line x1="0" y1="6" x2="200" y2="6" stroke="${GOLD}" stroke-width="1.5"/>
</svg>`,
};

const linhaDouradaDupla: VipSticker = {
  id: "linha-dourada-dupla",
  name: "Linha Dupla Dourada",
  category: "linhas",
  defaultWidth: 200,
  defaultHeight: 16,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 16">
  <line x1="0" y1="4" x2="200" y2="4" stroke="${GOLD}" stroke-width="1.5"/>
  <line x1="0" y1="12" x2="200" y2="12" stroke="${GOLD}" stroke-width="0.6" opacity="0.5"/>
</svg>`,
};

const divisorOrnamental: VipSticker = {
  id: "divisor-ornamental",
  name: "Divisor Ornamental",
  category: "linhas",
  defaultWidth: 200,
  defaultHeight: 24,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 24">
  <line x1="0" y1="12" x2="80" y2="12" stroke="${GOLD}" stroke-width="1"/>
  <polygon points="100,4 108,12 100,20 92,12" fill="${GOLD}"/>
  <line x1="120" y1="12" x2="200" y2="12" stroke="${GOLD}" stroke-width="1"/>
</svg>`,
};

const linhaTracejada: VipSticker = {
  id: "linha-tracejada",
  name: "Linha Tracejada VIP",
  category: "linhas",
  defaultWidth: 200,
  defaultHeight: 10,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 10">
  <line x1="0" y1="5" x2="200" y2="5" stroke="${GOLD}" stroke-width="1.2" stroke-dasharray="8,4"/>
</svg>`,
};

const separadorDiamante: VipSticker = {
  id: "separador-diamante",
  name: "Separador Diamante",
  category: "linhas",
  defaultWidth: 200,
  defaultHeight: 20,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 20">
  <line x1="0" y1="10" x2="85" y2="10" stroke="${GOLD}" stroke-width="0.8"/>
  <rect x="91" y="4" width="12" height="12" transform="rotate(45 97 10)" fill="${GOLD}"/>
  <line x1="109" y1="10" x2="200" y2="10" stroke="${GOLD}" stroke-width="0.8"/>
  <line x1="0" y1="14" x2="85" y2="14" stroke="${GOLD}" stroke-width="0.4" opacity="0.4"/>
  <line x1="109" y1="14" x2="200" y2="14" stroke="${GOLD}" stroke-width="0.4" opacity="0.4"/>
</svg>`,
};

// ── Ícones de Barbearia ───────────────────────────────────────────────────────

const iconTesoura: VipSticker = {
  id: "icon-tesoura",
  name: "Tesoura",
  category: "icones",
  defaultWidth: 70,
  defaultHeight: 70,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 70">
  <circle cx="35" cy="35" r="32" fill="${DARK}" stroke="${GOLD}" stroke-width="1.5"/>
  <!-- Tesoura estilizada -->
  <circle cx="22" cy="28" r="7" fill="none" stroke="${GOLD}" stroke-width="1.5"/>
  <circle cx="22" cy="44" r="7" fill="none" stroke="${GOLD}" stroke-width="1.5"/>
  <line x1="27" y1="24" x2="50" y2="16" stroke="${GOLD}" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="27" y1="48" x2="50" y2="56" stroke="${GOLD}" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="35" cy="36" r="2" fill="${GOLD}"/>
</svg>`,
};

const iconNavalha: VipSticker = {
  id: "icon-navalha",
  name: "Navalha",
  category: "icones",
  defaultWidth: 70,
  defaultHeight: 70,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 70">
  <circle cx="35" cy="35" r="32" fill="${DARK}" stroke="${GOLD}" stroke-width="1.5"/>
  <!-- Navalha estilizada -->
  <path d="M18,50 L45,20 L52,24 L28,52 Z" fill="${GOLD}" opacity="0.9"/>
  <path d="M18,50 L22,46 L48,18 L52,24 L28,52 Z" fill="none" stroke="${DARK}" stroke-width="0.5"/>
  <rect x="46" y="18" width="8" height="14" rx="2" transform="rotate(30 50 25)" fill="${GOLD}" opacity="0.7"/>
  <line x1="18" y1="50" x2="22" y2="46" stroke="${DARK}" stroke-width="1"/>
</svg>`,
};

const iconPente: VipSticker = {
  id: "icon-pente",
  name: "Pente",
  category: "icones",
  defaultWidth: 70,
  defaultHeight: 70,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 70">
  <circle cx="35" cy="35" r="32" fill="${DARK}" stroke="${GOLD}" stroke-width="1.5"/>
  <!-- Pente estilizado -->
  <rect x="14" y="28" width="42" height="8" rx="2" fill="${GOLD}" opacity="0.9"/>
  <rect x="17" y="36" width="3" height="12" rx="1" fill="${GOLD}"/>
  <rect x="23" y="36" width="3" height="12" rx="1" fill="${GOLD}"/>
  <rect x="29" y="36" width="3" height="12" rx="1" fill="${GOLD}"/>
  <rect x="35" y="36" width="3" height="12" rx="1" fill="${GOLD}"/>
  <rect x="41" y="36" width="3" height="12" rx="1" fill="${GOLD}"/>
  <rect x="47" y="36" width="3" height="12" rx="1" fill="${GOLD}"/>
</svg>`,
};

const iconCoroa: VipSticker = {
  id: "icon-coroa",
  name: "Coroa VIP",
  category: "icones",
  defaultWidth: 80,
  defaultHeight: 70,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 70">
  <circle cx="40" cy="35" r="32" fill="${DARK}" stroke="${GOLD}" stroke-width="1.5"/>
  <!-- Coroa -->
  <path d="M15,48 L15,28 L26,38 L40,18 L54,38 L65,28 L65,48 Z" fill="${GOLD}"/>
  <rect x="15" y="48" width="50" height="6" rx="1" fill="${GOLD}"/>
  <circle cx="15" cy="28" r="3" fill="${GOLD_LIGHT}"/>
  <circle cx="40" cy="18" r="3" fill="${GOLD_LIGHT}"/>
  <circle cx="65" cy="28" r="3" fill="${GOLD_LIGHT}"/>
</svg>`,
};

const iconDiamante: VipSticker = {
  id: "icon-diamante",
  name: "Diamante",
  category: "icones",
  defaultWidth: 70,
  defaultHeight: 70,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 70">
  <circle cx="35" cy="35" r="32" fill="${DARK}" stroke="${GOLD}" stroke-width="1.5"/>
  <!-- Diamante -->
  <polygon points="35,15 52,30 35,55 18,30" fill="${GOLD}" opacity="0.9"/>
  <polygon points="35,15 52,30 35,30" fill="${GOLD_LIGHT}" opacity="0.6"/>
  <polygon points="18,30 35,30 35,55" fill="${GOLD}" opacity="0.7"/>
  <line x1="18" y1="30" x2="52" y2="30" stroke="${DARK}" stroke-width="0.8"/>
</svg>`,
};

const iconEstrela: VipSticker = {
  id: "icon-estrela",
  name: "Estrela Dourada",
  category: "icones",
  defaultWidth: 60,
  defaultHeight: 60,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60">
  <polygon points="30,4 36,22 55,22 40,33 46,51 30,40 14,51 20,33 5,22 24,22" fill="${GOLD}"/>
  <polygon points="30,10 35,24 49,24 38,32 43,46 30,37 17,46 22,32 11,24 25,24" fill="${GOLD_LIGHT}" opacity="0.4"/>
</svg>`,
};

// ── Molduras ──────────────────────────────────────────────────────────────────

const molduraCantos: VipSticker = {
  id: "moldura-cantos",
  name: "Moldura Cantos Dourados",
  category: "molduras",
  defaultWidth: 200,
  defaultHeight: 200,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <!-- Cantos ornamentais -->
  <path d="M10,10 L40,10 M10,10 L10,40" stroke="${GOLD}" stroke-width="2.5" fill="none" stroke-linecap="square"/>
  <path d="M190,10 L160,10 M190,10 L190,40" stroke="${GOLD}" stroke-width="2.5" fill="none" stroke-linecap="square"/>
  <path d="M10,190 L40,190 M10,190 L10,160" stroke="${GOLD}" stroke-width="2.5" fill="none" stroke-linecap="square"/>
  <path d="M190,190 L160,190 M190,190 L190,160" stroke="${GOLD}" stroke-width="2.5" fill="none" stroke-linecap="square"/>
  <!-- Detalhes nos cantos -->
  <rect x="10" y="10" width="5" height="5" fill="${GOLD}"/>
  <rect x="185" y="10" width="5" height="5" fill="${GOLD}"/>
  <rect x="10" y="185" width="5" height="5" fill="${GOLD}"/>
  <rect x="185" y="185" width="5" height="5" fill="${GOLD}"/>
</svg>`,
};

const molduraCompleta: VipSticker = {
  id: "moldura-completa",
  name: "Moldura Completa VIP",
  category: "molduras",
  defaultWidth: 200,
  defaultHeight: 200,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <rect x="4" y="4" width="192" height="192" rx="4" fill="none" stroke="${GOLD}" stroke-width="1.5"/>
  <rect x="10" y="10" width="180" height="180" rx="2" fill="none" stroke="${GOLD}" stroke-width="0.5" opacity="0.4"/>
  <!-- Cantos decorativos -->
  <path d="M4,30 L4,4 L30,4" stroke="${GOLD}" stroke-width="3" fill="none"/>
  <path d="M196,30 L196,4 L170,4" stroke="${GOLD}" stroke-width="3" fill="none"/>
  <path d="M4,170 L4,196 L30,196" stroke="${GOLD}" stroke-width="3" fill="none"/>
  <path d="M196,170 L196,196 L170,196" stroke="${GOLD}" stroke-width="3" fill="none"/>
</svg>`,
};

const molduraElegante: VipSticker = {
  id: "moldura-elegante",
  name: "Moldura Elegante",
  category: "molduras",
  defaultWidth: 200,
  defaultHeight: 200,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <rect x="6" y="6" width="188" height="188" rx="6" fill="none" stroke="${GOLD}" stroke-width="2"/>
  <rect x="14" y="14" width="172" height="172" rx="3" fill="none" stroke="${GOLD}" stroke-width="0.6" opacity="0.5"/>
  <!-- Ornamentos nos cantos -->
  <circle cx="6" cy="6" r="4" fill="${GOLD}"/>
  <circle cx="194" cy="6" r="4" fill="${GOLD}"/>
  <circle cx="6" cy="194" r="4" fill="${GOLD}"/>
  <circle cx="194" cy="194" r="4" fill="${GOLD}"/>
  <!-- Meio das bordas -->
  <rect x="96" y="4" width="8" height="4" fill="${GOLD}"/>
  <rect x="96" y="192" width="8" height="4" fill="${GOLD}"/>
  <rect x="4" y="96" width="4" height="8" fill="${GOLD}"/>
  <rect x="192" y="96" width="4" height="8" fill="${GOLD}"/>
</svg>`,
};

// ── Textos Decorativos ────────────────────────────────────────────────────────

const textoVipStyle: VipSticker = {
  id: "texto-vip-style",
  name: "VIP STYLE",
  category: "textos",
  defaultWidth: 180,
  defaultHeight: 50,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 50">
  <text x="90" y="36" text-anchor="middle" fill="${GOLD}" font-family="Georgia,serif" font-size="28" font-weight="900" letter-spacing="6">VIP STYLE</text>
</svg>`,
};

const textoLuxury: VipSticker = {
  id: "texto-luxury",
  name: "LUXURY",
  category: "textos",
  defaultWidth: 160,
  defaultHeight: 40,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 40">
  <text x="80" y="28" text-anchor="middle" fill="${GOLD}" font-family="Georgia,serif" font-size="20" font-weight="400" letter-spacing="10">LUXURY</text>
</svg>`,
};

const textoExclusivo: VipSticker = {
  id: "texto-exclusivo",
  name: "EXCLUSIVO",
  category: "textos",
  defaultWidth: 180,
  defaultHeight: 40,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 40">
  <text x="90" y="28" text-anchor="middle" fill="${WHITE}" font-family="Arial,sans-serif" font-size="18" font-weight="900" letter-spacing="6">EXCLUSIVO</text>
  <line x1="0" y1="34" x2="180" y2="34" stroke="${GOLD}" stroke-width="0.8"/>
</svg>`,
};

const textoPremiumQuality: VipSticker = {
  id: "texto-premium-quality",
  name: "PREMIUM QUALITY",
  category: "textos",
  defaultWidth: 200,
  defaultHeight: 50,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 50">
  <line x1="0" y1="12" x2="200" y2="12" stroke="${GOLD}" stroke-width="0.6" opacity="0.5"/>
  <text x="100" y="32" text-anchor="middle" fill="${GOLD}" font-family="Georgia,serif" font-size="14" letter-spacing="5">PREMIUM QUALITY</text>
  <line x1="0" y1="40" x2="200" y2="40" stroke="${GOLD}" stroke-width="0.6" opacity="0.5"/>
</svg>`,
};

const textoSinceAnno: VipSticker = {
  id: "texto-since",
  name: "SINCE 2015",
  category: "textos",
  defaultWidth: 140,
  defaultHeight: 40,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 40">
  <text x="70" y="16" text-anchor="middle" fill="${GOLD}" font-family="Georgia,serif" font-size="8" letter-spacing="5">SINCE</text>
  <text x="70" y="34" text-anchor="middle" fill="${WHITE}" font-family="Arial,sans-serif" font-size="16" font-weight="900" letter-spacing="4">2015</text>
</svg>`,
};

// ── Exportação ────────────────────────────────────────────────────────────────

export const VIP_STICKERS: VipSticker[] = [
  // Selos
  seloCircular,
  seloEstrela,
  seloHexagonal,
  seloRombo,
  // Badges
  badgeExclusivo,
  badgeVipMember,
  badgePremium,
  badgeNovo,
  badgeOferta,
  // Linhas
  linhaDouradaSimples,
  linhaDouradaDupla,
  divisorOrnamental,
  linhaTracejada,
  separadorDiamante,
  // Ícones
  iconTesoura,
  iconNavalha,
  iconPente,
  iconCoroa,
  iconDiamante,
  iconEstrela,
  // Molduras
  molduraCantos,
  molduraCompleta,
  molduraElegante,
  // Textos decorativos
  textoVipStyle,
  textoLuxury,
  textoExclusivo,
  textoPremiumQuality,
  textoSinceAnno,
];

export const STICKER_CATEGORIES: { id: StickerCategory; label: string; emoji: string }[] = [
  { id: "selos", label: "Selos", emoji: "🏅" },
  { id: "badges", label: "Badges", emoji: "🎖️" },
  { id: "linhas", label: "Linhas", emoji: "✦" },
  { id: "icones", label: "Ícones", emoji: "✂️" },
  { id: "molduras", label: "Molduras", emoji: "🖼️" },
  { id: "textos", label: "Textos", emoji: "✍️" },
];

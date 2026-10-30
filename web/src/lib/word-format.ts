import type { WordItem } from "@/lib/api/word";

/** 音标展示规则：美式优先、英式回落（与页面、卡片生成一致） */
export function wordPhonetic(entry: Pick<WordItem, "phonetic_us" | "phonetic_uk">): string {
  return (entry.phonetic_us || entry.phonetic_uk || "").trim();
}

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff]/;
/** 中文片段的起点：汉字或中文左括号/引号（〔空气、天气〕这种不能把括号切掉） */
const CJK_START_RE = /[\u3400-\u4dbf\u4e00-\u9fff〔【「『（《〈“‘]/;
/** 复制时保留的中文标点 */
const CN_PUNCT = "，。；：、！？…—～·（）〔〕【】「」『』《》〈〉“”‘’%／/[]";
/** 连续英文片段（含夹在中间的英文标点），整段删掉 */
const LATIN_RUN_RE = /[A-Za-z][A-Za-z'’-]*(?:[\s,.;:!?()"/]+[A-Za-z'’-]+)*/g;

/** 词典排版里的小号全角标点（U+FE50–FE5D），统一换成正常全角 */
const SMALL_FORM_MAP: Record<string, string> = {
  "\uFE50": "，",
  "\uFE51": "、",
  "\uFE52": "。",
  "\uFE54": "；",
  "\uFE55": "：",
  "\uFE56": "？",
  "\uFE57": "！",
  "\uFE59": "（",
  "\uFE5A": "）",
};

function keepChineseChars(text: string): string {
  let out = "";
  for (const ch of text) {
    const keep =
      /[\u3400-\u4dbf\u4e00-\u9fff0-9]/.test(ch) ||
      CN_PUNCT.includes(ch) ||
      (ch >= "\uFE50" && ch <= "\uFE5D");
    out += keep ? ch : " ";
  }
  return out;
}

function normalizePunct(text: string): string {
  return text.replace(/[\uFE50-\uFE5D]/g, (ch) => SMALL_FORM_MAP[ch] ?? ch);
}

/**
 * 单行释义取中文。
 *
 * 词典排版基本是「英文描述 + 中文对应词」，所以先删掉英文片段，再从第一个汉字
 * 处切起 —— 前面的序号、美元数字这类英文侧残渣就一起丢掉了。
 * 中英之间原本用标点分隔的地方会剩一个空格，正好当义项分隔符用。
 */
function chineseFromLine(line: string): string {
  const stripped = line
    .replace(/["']/g, "")
    .replace(LATIN_RUN_RE, " ")
    .replace(/,/g, "，")
    .replace(/;/g, "；")
    .replace(/:/g, "：");

  const start = stripped.search(CJK_START_RE);
  if (start < 0) return "";

  return normalizePunct(keepChineseChars(stripped.slice(start)))
    .replace(/\s+/g, " ")
    .replace(/\s+([；，。、：！？])/g, "$1")
    .replace(/^[\s；，。、—·-]+|[\s；，。、—·-]+$/g, "")
    .trim();
}

/**
 * 释义只留中文。
 *
 * 词典释义基本是「英文描述 + 中文对应词」混排，整段复制又长又难读，
 * 所以逐行剥掉英文，只留中文义项，义项之间用「；」连起来。
 * 纯英文释义（少数英英词典）就**不复制释义**了 —— 页面上仍能看到原文。
 */
export function toChineseDefinition(definition: string): string {
  const senses = (definition || "")
    .split(/\n+/)
    .map((line) => (CJK_RE.test(line) ? chineseFromLine(line) : ""))
    .filter(Boolean)
    // 有些词典同一义项会重复出现，去掉相邻重复
    .filter((sense, i, list) => sense !== list[i - 1]);

  if (!senses.length) return "";

  const MAX_SENSES = 3;
  const MAX_CHARS = 120;
  let picked = senses.slice(0, MAX_SENSES).join("；");
  if (senses.length > MAX_SENSES) picked += "…";
  if (picked.length > MAX_CHARS) {
    const cut = picked.lastIndexOf("；", MAX_CHARS);
    picked = `${picked.slice(0, cut > 40 ? cut : MAX_CHARS)}…`;
  }
  return picked;
}

/**
 * 把一条词条压成单行文本：`abandon /əˈbændən/ 抛弃，遗弃〔某人〕`
 *
 * 只复制「单词 + 音标 + 中文释义」：不带词性，释义也只留中文，
 * 粘到笔记里就是干净的一行。
 */
export function formatWordEntry(entry: WordItem, opts: { withSource?: boolean } = {}): string {
  const phonetic = wordPhonetic(entry);
  const head = phonetic ? `${entry.word} /${phonetic}/` : entry.word;

  const definition = toChineseDefinition(entry.definition);
  const line = definition ? `${head} ${definition}` : head;

  return opts.withSource && entry.source ? `${line}  —— ${entry.source}` : line;
}

/** 多词搜索结果里挑一条主词条：有音标和释义的优先，其余按词典顺序 */
export function pickPrimaryEntry(entries: WordItem[]): WordItem | undefined {
  if (!entries.length) return undefined;
  return (
    entries.find((e) => e.definition && wordPhonetic(e)) ??
    entries.find((e) => e.definition) ??
    entries[0]
  );
}

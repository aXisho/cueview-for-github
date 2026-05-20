// Gloss Markdown parser — returns a GlossChild[] tree (not HTML strings).
//
// Recognizes:
//   - GitHub Alert callouts: > [!NOTE|TIP|IMPORTANT|WARNING|CAUTION] title + body
//   - Alert-extended void directives: > [!toc title="..." depth=3]
//   - Fenced block directives: ```name attrs ... ```
//   - Nested container directives: ````tabs ... \n ```tab ... ``` ... ````
//   - Inline directives: `text`{name attrs}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GlossNode {
  kind: "cue";
  name: string;
  attrs: Record<string, string>;
  children: Array<GlossNode | TextNode>;
  inline: boolean;
  selfClosing: boolean;
}

export interface TextNode {
  kind: "text";
  content: string;
}

export type GlossChild = GlossNode | TextNode;

export const ALLOWED_COLORS = ["gray", "blue", "green", "yellow", "red", "purple"] as const;
export type AllowedColor = (typeof ALLOWED_COLORS)[number];

export const SAFE_URL_RE = /^(https?:\/\/|\.\.?\/|\/[^/]|#)/;

// ── Directive vocabulary ──────────────────────────────────────────────────────

const ALERT_TYPE_TO_DIRECTIVE: Record<string, string> = {
  NOTE: "info",
  TIP: "tip",
  IMPORTANT: "important",
  WARNING: "warning",
  CAUTION: "danger",
};

const BLOCK_DIRECTIVES = ["details", "card"];

// Heading promotion: a Markdown ATX heading whose only content is an inline
// `heading` directive promotes the directive's colour onto the heading itself.
// Captures: 1 = `#` count (1..6), 2 = inner text, 3 = attrs text.
const HEADING_PROMOTION_RE =
  /^(#{1,6})\s+`([^`\n]+)`\{heading(\s+[^}\n]*)?\}\s*$/i;
const CONTAINER_DIRECTIVES = ["tabs", "steps", "grid"];
const CHILD_DIRECTIVES = ["tab", "step", "cell"];
const VOID_DIRECTIVES = new Set(["toc"]);

// Directive names recognized as a fenced block (everything that may appear as
// a code-fence info string and become a GlossNode).
const FENCED_BLOCK_NAMES = new Set<string>([
  ...BLOCK_DIRECTIVES,
  ...CONTAINER_DIRECTIVES,
  ...CHILD_DIRECTIVES,
]);

// ── parseAttrs ────────────────────────────────────────────────────────────────

export function parseAttrs(attrsString: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!attrsString.trim()) return result;

  const re = /([a-z][a-z0-9_-]*)(?:=(?:"((?:[^"\\]|\\.)*)"|(\S*)))?/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(attrsString)) !== null) {
    const key = match[1].toLowerCase();
    let value: string;
    if (match[2] !== undefined) {
      value = match[2]
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\")
        .replace(/\\n/g, "\n");
    } else if (match[3] !== undefined) {
      value = match[3];
    } else {
      value = "true";
    }
    result[key] = value;
  }
  return result;
}

// ── Inline directive splitter ─────────────────────────────────────────────────
//
// Splits a single line into a mix of text segments and inline GlossNodes.
// Pattern: `text`{name attrs}
//   - The text portion is captured literally (no Markdown is interpreted here).
//   - The brace block must close on the same line. If it does not, the inline
//     code span and the unclosed brace block are left as plain text.

const INLINE_RE = /`([^`\n]+)`\{([a-z][a-z0-9-]*)(\s+[^}\n]*)?\}/gi;

function splitInline(line: string): GlossChild[] {
  const out: GlossChild[] = [];
  let lastIdx = 0;
  INLINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = INLINE_RE.exec(line)) !== null) {
    const matchStart = m.index;
    const text = m[1];
    const name = m[2].toLowerCase();
    const attrsStr = (m[3] ?? "").trim();

    if (matchStart > lastIdx) {
      out.push({ kind: "text", content: line.slice(lastIdx, matchStart) });
    }

    out.push({
      kind: "cue",
      name,
      attrs: parseAttrs(attrsStr),
      children: [{ kind: "text", content: text }],
      inline: true,
      selfClosing: false,
    });

    lastIdx = INLINE_RE.lastIndex;
  }

  if (lastIdx < line.length) {
    out.push({ kind: "text", content: line.slice(lastIdx) });
  }

  return out;
}

// Apply inline splitting to every line of a text body.
function applyInlineToText(text: string): GlossChild[] {
  if (!text) return [];
  // Quick path: no backticks at all → no inline directives possible.
  if (text.indexOf("`") < 0) return [{ kind: "text", content: text }];

  const lines = text.split("\n");
  const out: GlossChild[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isLast = i === lines.length - 1;
    const segments = splitInline(line);

    if (segments.length === 0) {
      if (!isLast) appendText(out, "\n");
      continue;
    }

    for (const seg of segments) out.push(seg);
    if (!isLast) appendText(out, "\n");
  }

  return mergeTextRuns(out);
}

function appendText(arr: GlossChild[], content: string): void {
  const last = arr[arr.length - 1];
  if (last && last.kind === "text") {
    last.content += content;
  } else {
    arr.push({ kind: "text", content });
  }
}

function mergeTextRuns(children: GlossChild[]): GlossChild[] {
  const out: GlossChild[] = [];
  for (const c of children) {
    if (c.kind === "text") {
      const last = out[out.length - 1];
      if (last && last.kind === "text") {
        last.content += c.content;
        continue;
      }
    }
    out.push(c);
  }
  return out;
}

// ── Alert block detection ─────────────────────────────────────────────────────
//
// A GitHub Alert is a blockquote whose first non-empty line starts with
// `[!TYPE]`. The TYPE may be a callout (NOTE/TIP/…) or a registered void
// directive name (toc, …).

const BLOCKQUOTE_LINE_RE = /^[ \t]{0,3}>[ \t]?(.*)$/;
const ALERT_FIRST_LINE_RE = /^\[!([A-Za-z][A-Za-z0-9-]*)((?:\s+[^=\s]+(?:=(?:"[^"]*"|\S*))?)*)?\]\s*(.*)$/;

interface AlertCapture {
  /** Number of source lines consumed (including the blockquote). */
  consumed: number;
  /** Raw type as written (used for diagnostics, kept lowercase here). */
  rawType: string;
  /** First-line attrs text (between `[!TYPE` and the closing `]`). */
  attrsText: string;
  /** Text after the closing `]` on the same line. */
  titleOrTail: string;
  /** Body lines with leading `> ` stripped. */
  bodyLines: string[];
}

/** Attempt to consume a blockquote starting at `lines[start]`. */
function captureBlockquote(lines: string[], start: number): { lines: string[]; end: number } | null {
  if (start >= lines.length) return null;
  const m0 = BLOCKQUOTE_LINE_RE.exec(lines[start]);
  if (!m0) return null;

  const captured: string[] = [m0[1] ?? ""];
  let i = start + 1;
  while (i < lines.length) {
    const m = BLOCKQUOTE_LINE_RE.exec(lines[i]);
    if (!m) break;
    captured.push(m[1] ?? "");
    i++;
  }
  return { lines: captured, end: i };
}

/** If the blockquote at `start` is an Alert, return its capture. */
function detectAlert(lines: string[], start: number): AlertCapture | null {
  const bq = captureBlockquote(lines, start);
  if (!bq) return null;

  // First non-empty line of the blockquote
  let head = -1;
  for (let i = 0; i < bq.lines.length; i++) {
    if (bq.lines[i].trim() !== "") {
      head = i;
      break;
    }
  }
  if (head < 0) return null;

  const m = ALERT_FIRST_LINE_RE.exec(bq.lines[head]);
  if (!m) return null;

  return {
    consumed: bq.end - start,
    rawType: m[1],
    attrsText: (m[2] ?? "").trim(),
    titleOrTail: m[3].trim(),
    bodyLines: bq.lines.slice(head + 1),
  };
}

// ── Fenced block detection ────────────────────────────────────────────────────
//
// Recognizes a code fence whose info string starts with a known directive
// name. Honors CommonMark's fence-length rule: a fence is closed only by a
// fence of the same character of equal or greater length.

const FENCE_OPEN_RE = /^([ \t]{0,3})(`{3,}|~{3,})\s*([a-z][a-z0-9-]*)(\s+[^\n]*)?$/i;

interface FenceCapture {
  /** Number of source lines consumed (including opening and closing fences). */
  consumed: number;
  /** Directive name on the info string. */
  name: string;
  /** Attribute text (everything after the name on the info line). */
  attrsText: string;
  /** Body lines between the opening and closing fence (closing not included). */
  bodyLines: string[];
  /** True if no matching closing fence was found (CUE001 condition). */
  unterminated: boolean;
}

function detectFence(lines: string[], start: number): FenceCapture | null {
  if (start >= lines.length) return null;
  const m = FENCE_OPEN_RE.exec(lines[start]);
  if (!m) return null;

  const indent = m[1];
  const marker = m[2];
  const name = m[3].toLowerCase();
  const attrsText = (m[4] ?? "").trim();

  // Match closing fence: same char, length ≥ opening, optionally indented.
  const fenceChar = marker[0];
  const minLen = marker.length;
  const closeRe = new RegExp(`^[ \\t]{0,3}\\${fenceChar}{${minLen},}\\s*$`);

  const body: string[] = [];
  let i = start + 1;
  let unterminated = true;

  while (i < lines.length) {
    if (closeRe.test(lines[i])) {
      unterminated = false;
      i++;
      break;
    }
    body.push(lines[i]);
    i++;
  }

  // Strip the opening fence's base indent from body lines (best-effort).
  const stripped = indent ? body.map((l) => (l.startsWith(indent) ? l.slice(indent.length) : l)) : body;

  return {
    consumed: i - start,
    name,
    attrsText,
    bodyLines: stripped,
    unterminated,
  };
}

// ── parse ─────────────────────────────────────────────────────────────────────

export function parseGlossMd(source: string): GlossChild[] {
  const lines = source.split("\n");
  return parseLines(lines);
}

function parseLines(lines: string[]): GlossChild[] {
  const out: GlossChild[] = [];
  /** Accumulated raw text awaiting flush. Lines are joined with `\n`. */
  let textBuf: string[] = [];
  let inFenceBuf = false;
  let fenceBufMarker = "";

  /** Flush accumulated text as TextNode(s), applying inline directive splitting. */
  const flushText = (): void => {
    if (textBuf.length === 0) return;
    const raw = textBuf.join("\n");
    textBuf = [];
    if (!raw) return;
    const parts = applyInlineToText(raw);
    for (const p of parts) out.push(p);
  };

  /** True if the line opens a non-cue fenced block we should pass through verbatim. */
  const isPassThroughFenceOpen = (line: string): { marker: string } | null => {
    // A normal Markdown fence (no cue directive name in info string).
    const m = /^[ \t]{0,3}(`{3,}|~{3,})\s*(\S+)?/.exec(line);
    if (!m) return null;
    const marker = m[1];
    const lang = m[2];
    if (lang && FENCED_BLOCK_NAMES.has(lang.toLowerCase())) return null; // handled separately
    return { marker };
  };

  for (let i = 0; i < lines.length; ) {
    const line = lines[i];

    // ── Inside a pass-through (non-cue) fenced code block ────────────────────
    if (inFenceBuf) {
      textBuf.push(line);
      const t = line.trim();
      if (t.startsWith(fenceBufMarker[0]) && /^[`~]+$/.test(t) && t.length >= fenceBufMarker.length) {
        inFenceBuf = false;
        fenceBufMarker = "";
      }
      i++;
      continue;
    }

    // ── Cue fenced block ─────────────────────────────────────────────────────
    if (line.trimStart().startsWith("`") || line.trimStart().startsWith("~")) {
      const fc = detectFence(lines, i);
      if (fc && FENCED_BLOCK_NAMES.has(fc.name)) {
        flushText();
        const innerChildren = parseLines(fc.bodyLines);
        out.push({
          kind: "cue",
          name: fc.name,
          attrs: parseAttrs(fc.attrsText),
          children: innerChildren,
          inline: false,
          selfClosing: false,
        });
        i += fc.consumed;
        continue;
      }
    }

    // ── Non-cue fence open: enter pass-through mode (text accumulation) ─────
    {
      const fo = isPassThroughFenceOpen(line);
      if (fo) {
        textBuf.push(line);
        inFenceBuf = true;
        fenceBufMarker = fo.marker;
        i++;
        continue;
      }
    }

    // ── Heading promotion: `# ` … `###### ` followed by `text`{heading …} ──
    {
      const hm = HEADING_PROMOTION_RE.exec(line);
      if (hm) {
        flushText();
        const level = hm[1].length;
        const text = hm[2];
        const attrsText = (hm[3] ?? "").trim();
        const attrs = parseAttrs(attrsText);
        attrs.level = String(level);
        out.push({
          kind: "cue",
          name: "heading",
          attrs,
          children: [{ kind: "text", content: text }],
          inline: false,
          selfClosing: false,
        });
        i++;
        continue;
      }
    }

    // ── Alert callout / void ─────────────────────────────────────────────────
    if (line.trimStart().startsWith(">")) {
      const ac = detectAlert(lines, i);
      if (ac) {
        const typeUpper = ac.rawType.toUpperCase();
        const typeLower = ac.rawType.toLowerCase();
        const directiveName = ALERT_TYPE_TO_DIRECTIVE[typeUpper];

        if (directiveName) {
          // Callout
          flushText();
          const attrs: Record<string, string> = ac.attrsText ? parseAttrs(ac.attrsText) : {};
          if (ac.titleOrTail) attrs.title = ac.titleOrTail;
          out.push({
            kind: "cue",
            name: directiveName,
            attrs,
            children: parseLines(ac.bodyLines),
            inline: false,
            selfClosing: false,
          });
          i += ac.consumed;
          continue;
        }

        if (VOID_DIRECTIVES.has(typeLower)) {
          // Void Alert (e.g. > [!toc title="..." depth=3])
          flushText();
          const attrs: Record<string, string> = ac.attrsText ? parseAttrs(ac.attrsText) : {};
          if (ac.titleOrTail) attrs.title = ac.titleOrTail;
          out.push({
            kind: "cue",
            name: typeLower,
            attrs,
            children: [],
            inline: false,
            selfClosing: true,
          });
          i += ac.consumed;
          continue;
        }
        // Otherwise fall through: leave as ordinary blockquote text.
      }
    }

    // ── Ordinary line: accumulate as text ────────────────────────────────────
    textBuf.push(line);
    i++;
  }

  flushText();
  return mergeTextRuns(out);
}

export const parseGlossMdToNodes = parseGlossMd;

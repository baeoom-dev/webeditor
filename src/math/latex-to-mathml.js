/**
 * LaTeX 서브셋 → MathML Core 변환기.
 *
 * 의존성 0 원칙에 따라 직접 구현한 재귀 하강 파서. 문자열 조립이 아니라
 * `createElementNS` 로 MathML DOM 을 직접 생성해 이스케이프 문제를 원천 차단한다.
 * 생성 요소는 전부 security/schema.js 의 MATHML_TAGS 화이트리스트 안에 있어야
 * getHTML() 새니타이즈 왕복에서 살아남는다.
 *
 * 지원 범위(v1)와 미지원 항목은 docs/formula-design.md 4장 참고.
 * 미지원 명령·괄호 불일치는 Error 를 throw 한다(다이얼로그가 잡아 표시).
 */

export const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/* ---------- 심볼 테이블 ---------- */

// 그리스 문자 → <mi>
const GREEK = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ',
  eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ',
  nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ',
  upsilon: 'υ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  varepsilon: 'ϵ', vartheta: 'ϑ', varphi: 'ϕ',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π',
  Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
};

// 연산자/관계 기호 → <mo>
const OPERATORS = {
  times: '×', div: '÷', pm: '±', mp: '∓', cdot: '⋅', ast: '∗',
  le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠',
  approx: '≈', equiv: '≡', sim: '∼', simeq: '≃', propto: '∝', cong: '≅',
  to: '→', rightarrow: '→', leftarrow: '←', leftrightarrow: '↔',
  Rightarrow: '⇒', Leftarrow: '⇐', Leftrightarrow: '⇔', mapsto: '↦',
  in: '∈', notin: '∉', ni: '∋', subset: '⊂', supset: '⊃',
  subseteq: '⊆', supseteq: '⊇', cup: '∪', cap: '∩', setminus: '∖',
  land: '∧', lor: '∨', neg: '¬', oplus: '⊕', otimes: '⊗',
  forall: '∀', exists: '∃', angle: '∠', perp: '⊥', parallel: '∥',
  therefore: '∴', because: '∵', mid: '∣',
  cdots: '⋯', ldots: '…', dots: '…', vdots: '⋮', ddots: '⋱',
  circ: '∘', star: '⋆', bullet: '∙',
};

// 기호형 식별자 → <mi>
const IDENTIFIERS = {
  infty: '∞', partial: '∂', nabla: '∇', emptyset: '∅', varnothing: '∅',
  hbar: 'ℏ', ell: 'ℓ', Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ', prime: '′', degree: '°',
};

// 큰 연산자: limits 형은 첨자를 munder/mover 로 상하에 붙인다.
const BIG_OPS = {
  sum: { text: '∑', limits: true }, prod: { text: '∏', limits: true },
  coprod: { text: '∐', limits: true }, bigcup: { text: '⋃', limits: true },
  bigcap: { text: '⋂', limits: true },
  int: { text: '∫', limits: false }, iint: { text: '∬', limits: false },
  iiint: { text: '∭', limits: false }, oint: { text: '∮', limits: false },
  lim: { text: 'lim', limits: true }, max: { text: 'max', limits: true },
  min: { text: 'min', limits: true }, sup: { text: 'sup', limits: true },
  inf: { text: 'inf', limits: true },
};

// 함수명 → 다문자 <mi> (MathML 이 자동으로 정립체 렌더).
const FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
  'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh',
  'log', 'ln', 'exp', 'det', 'dim', 'gcd', 'deg', 'arg', 'mod',
]);

// 장식(\hat{x} 등) → <mover>
const ACCENTS = {
  hat: '^', bar: '¯', vec: '→', tilde: '~', dot: '˙', ddot: '¨',
  overline: '¯', widehat: '^', widetilde: '~',
};

// 공백 명령 → <mtext> 의 NBSP 개수 (mspace width 는 속성 화이트리스트 밖이라 미사용).
const NBSP = ' ';
const SPACES = { ',': 1, ';': 1, ' ': 1, quad: 2, qquad: 4 };

// \left / \right 뒤에 올 수 있는 구분자 명령.
const DELIM_COMMANDS = { '{': '{', '}': '}', langle: '⟨', rangle: '⟩', '|': '∣', Vert: '∥' };

// 낱글자 연산자 문자.
const OP_CHARS = new Set('+-*/=<>()[]|,.;:!?');

/* ---------- 토크나이저 ---------- */

/**
 * @typedef {{type: 'cmd'|'char'|'num'|'op'|'brace'|'script'|'text', value: string}} Token
 */

/**
 * \text{...} 의 원문을 (중첩 중괄호 포함) 그대로 읽는다.
 * 토크나이저가 공백을 버리므로 이 단계에서 raw 로 잘라야 원문 공백이 보존된다.
 * @returns {{raw: string, end: number}} end 는 닫는 } 다음 인덱스
 */
function readTextGroup(src, start) {
  let i = start;
  while (i < src.length && /\s/.test(src[i])) i += 1;
  if (src[i] !== '{') throw new Error('\\text 는 {내용} 이 필요합니다.');
  let depth = 1;
  let j = i + 1;
  while (j < src.length && depth > 0) {
    if (src[j] === '{') depth += 1;
    else if (src[j] === '}') depth -= 1;
    j += 1;
  }
  if (depth !== 0) throw new Error('\\text 의 닫는 } 가 없습니다.');
  return { raw: src.slice(i + 1, j - 1), end: j };
}

/** @returns {Token[]} */
function tokenize(latex) {
  const tokens = [];
  let i = 0;
  const src = String(latex);
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (ch === '\\') {
      const rest = src.slice(i + 1);
      const m = /^[a-zA-Z]+/.exec(rest);
      if (m) {
        if (m[0] === 'text') {
          const { raw, end } = readTextGroup(src, i + 1 + m[0].length);
          tokens.push({ type: 'text', value: raw });
          i = end;
          continue;
        }
        tokens.push({ type: 'cmd', value: m[0] });
        i += 1 + m[0].length;
      } else if (rest.length) {
        // \{ \} \, \; \\ 등 한 글자 명령.
        tokens.push({ type: 'cmd', value: rest[0] });
        i += 2;
      } else {
        throw new Error('수식이 \\ 로 끝났습니다.');
      }
      continue;
    }
    if (ch === '{' || ch === '}') { tokens.push({ type: 'brace', value: ch }); i += 1; continue; }
    if (ch === '^' || ch === '_') { tokens.push({ type: 'script', value: ch }); i += 1; continue; }
    if (/[0-9]/.test(ch)) {
      const m = /^[0-9]+(\.[0-9]+)?/.exec(src.slice(i));
      tokens.push({ type: 'num', value: m[0] });
      i += m[0].length;
      continue;
    }
    if (OP_CHARS.has(ch) || ch === "'") { tokens.push({ type: 'op', value: ch }); i += 1; continue; }
    // 그 외 문자(영문자, 한글, 유니코드 기호)는 식별자 취급.
    tokens.push({ type: 'char', value: ch });
    i += 1;
  }
  return tokens;
}

/* ---------- MathML DOM 헬퍼 ---------- */

function el(name, text, children) {
  const node = document.createElementNS(MATHML_NS, name);
  if (text != null) node.textContent = text;
  if (children) for (const c of children) node.appendChild(c);
  return node;
}

/** 노드 목록을 하나의 노드로: 1개면 그대로, 여러 개면 mrow 로 감싼다. */
function asOne(nodes) {
  if (nodes.length === 1) return nodes[0];
  return el('mrow', null, nodes);
}

/* ---------- 파서 ---------- */

class Parser {
  /** @param {Token[]} tokens */
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek() { return this.tokens[this.pos] || null; }
  next() { return this.tokens[this.pos++] || null; }

  /**
   * 원자 시퀀스를 파싱한다.
   * @param {(t: Token) => boolean} [stop] 시퀀스를 끝낼 토큰 판정(토큰은 소비하지 않음)
   * @returns {Node[]}
   */
  parseSequence(stop) {
    const nodes = [];
    for (;;) {
      const t = this.peek();
      if (!t) break;
      if (stop && stop(t)) break;
      if (t.type === 'brace' && t.value === '}') break;
      nodes.push(this.parseScripted());
    }
    return nodes;
  }

  /** 원자 하나 + 뒤따르는 ^ _ ' 첨자를 처리한다. */
  parseScripted() {
    let base = this.parseAtom();
    let sub = null;
    let sup = null;
    for (;;) {
      const t = this.peek();
      if (t && t.type === 'script') {
        this.next();
        const script = asOne([this.parseArg()]);
        if (t.value === '^') {
          if (sup) throw new Error('^ 첨자가 중복되었습니다.');
          sup = script;
        } else {
          if (sub) throw new Error('_ 첨자가 중복되었습니다.');
          sub = script;
        }
        continue;
      }
      if (t && t.type === 'op' && t.value === "'") {
        // 프라임: 연속된 ' 를 모아 위첨자로.
        let primes = '';
        while (this.peek()?.type === 'op' && this.peek().value === "'") {
          this.next();
          primes += '′';
        }
        if (sup) throw new Error("' 와 ^ 첨자를 함께 쓸 수 없습니다.");
        sup = el('mo', primes);
        continue;
      }
      break;
    }
    if (!sub && !sup) return base;

    // limits 형 큰 연산자(∑, lim …)는 첨자를 상하로 붙인다.
    const limits = base._weLimits === true;
    if (sub && sup) return el(limits ? 'munderover' : 'msubsup', null, [base, sub, sup]);
    if (sub) return el(limits ? 'munder' : 'msub', null, [base, sub]);
    return el(limits ? 'mover' : 'msup', null, [base, sup]);
  }

  /** 명령 인자: {그룹} 또는 원자 하나 (\frac12 형태 허용). */
  parseArg() {
    const t = this.peek();
    if (!t) throw new Error('명령의 인자가 없습니다.');
    if (t.type === 'brace' && t.value === '{') return this.parseGroup();
    return this.parseAtom();
  }

  /** { ... } 그룹을 파싱해 단일 노드로 반환한다. */
  parseGroup() {
    const open = this.next();
    if (!open || open.type !== 'brace' || open.value !== '{') {
      throw new Error('{ 가 필요합니다.');
    }
    const nodes = this.parseSequence();
    const close = this.next();
    if (!close || close.type !== 'brace' || close.value !== '}') {
      throw new Error('닫는 } 가 없습니다.');
    }
    return asOne(nodes.length ? nodes : [el('mrow')]);
  }

  /** 원자 하나를 파싱한다. */
  parseAtom() {
    const t = this.next();
    if (!t) throw new Error('수식이 예기치 않게 끝났습니다.');

    switch (t.type) {
      case 'num': return el('mn', t.value);
      case 'char': return el('mi', t.value);
      case 'op': return el('mo', t.value);
      case 'text': return el('mtext', t.value);
      case 'brace':
        if (t.value === '{') { this.pos -= 1; return this.parseGroup(); }
        throw new Error('짝이 없는 } 가 있습니다.');
      case 'script':
        throw new Error(`${t.value} 앞에 대상이 없습니다.`);
      case 'cmd': return this.parseCommand(t.value);
      default:
        throw new Error('알 수 없는 토큰입니다.');
    }
  }

  /** \명령 을 파싱한다. */
  parseCommand(name) {
    if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
      const a = asOne([this.parseArg()]);
      const b = asOne([this.parseArg()]);
      return el('mfrac', null, [a, b]);
    }
    if (name === 'sqrt') {
      // 선택 인자 [n] → mroot.
      const t = this.peek();
      if (t && t.type === 'op' && t.value === '[') {
        this.next();
        const index = asOne(this.parseSequence((tk) => tk.type === 'op' && tk.value === ']'));
        const close = this.next();
        if (!close || close.value !== ']') throw new Error('\\sqrt 의 닫는 ] 가 없습니다.');
        return el('mroot', null, [asOne([this.parseArg()]), index]);
      }
      return el('msqrt', null, [asOne([this.parseArg()])]);
    }
    if (name === 'left') return this.parseFenced();
    if (name === 'right') throw new Error('\\left 없이 \\right 가 나왔습니다.');

    if (GREEK[name]) return el('mi', GREEK[name]);
    if (OPERATORS[name]) return el('mo', OPERATORS[name]);
    if (IDENTIFIERS[name]) return el('mi', IDENTIFIERS[name]);
    if (BIG_OPS[name]) {
      const node = el('mo', BIG_OPS[name].text);
      node._weLimits = BIG_OPS[name].limits; // parseScripted 가 참조하는 내부 플래그
      return node;
    }
    if (FUNCTIONS.has(name)) return el('mi', name);
    if (ACCENTS[name]) {
      return el('mover', null, [asOne([this.parseArg()]), el('mo', ACCENTS[name])]);
    }
    if (SPACES[name] != null) return el('mtext', NBSP.repeat(SPACES[name]));
    if (name === '{' || name === '}') return el('mo', name);

    throw new Error(`지원하지 않는 명령입니다: \\${name}`);
  }

  /** \left ( … \right ) — 신축 괄호. MathML Core 연산자 사전이 mrow 안에서 자동 신축. */
  parseFenced() {
    const open = el('mo', this.readDelimiter('left'));
    const inner = this.parseSequence((tk) => tk.type === 'cmd' && tk.value === 'right');
    const rightCmd = this.next();
    if (!rightCmd || rightCmd.type !== 'cmd' || rightCmd.value !== 'right') {
      throw new Error('\\left 에 대응하는 \\right 가 없습니다.');
    }
    const close = el('mo', this.readDelimiter('right'));
    const children = [open, ...inner, close];
    // '.' 은 보이지 않는 구분자 — 해당 mo 를 비운다.
    if (open.textContent === '.') open.textContent = '';
    if (close.textContent === '.') close.textContent = '';
    return el('mrow', null, children);
  }

  /** \left/\right 다음의 구분자 토큰을 읽는다. */
  readDelimiter(which) {
    const t = this.next();
    if (!t) throw new Error(`\\${which} 의 구분자가 없습니다.`);
    if (t.type === 'op') return t.value; // ( ) [ ] | .
    if (t.type === 'cmd' && DELIM_COMMANDS[t.value]) return DELIM_COMMANDS[t.value];
    throw new Error(`\\${which} 뒤에 올 수 없는 구분자입니다.`);
  }
}

/* ---------- 공개 API ---------- */

/**
 * LaTeX 서브셋 문자열을 <math> 요소로 변환한다.
 * @param {string} latex 수식 원문
 * @param {{display?: boolean}} [options] display: true 면 블록 수식
 * @returns {Element} MathML <math> 요소 (data-we-formula 에 원문 보존)
 * @throws {Error} 미지원 명령, 괄호 불일치, 빈 입력
 */
export function latexToMathML(latex, options = {}) {
  const source = String(latex ?? '').trim();
  if (!source) throw new Error('수식을 입력하세요.');

  const parser = new Parser(tokenize(source));
  const nodes = parser.parseSequence();
  if (parser.peek()) throw new Error('짝이 없는 } 가 있습니다.');
  if (!nodes.length) throw new Error('수식을 입력하세요.');

  const math = el('math', null, nodes);
  math.setAttribute('display', options.display ? 'block' : 'inline');
  math.setAttribute('data-we-formula', source);
  return math;
}

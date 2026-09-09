/**
 * The `agency` oxlint plugin: the money and ordering rules.
 *
 * These would be seven `no-restricted-syntax` selectors, and Plan A Task 3 wrote
 * them that way. oxlint 1.82.0 does not implement `no-restricted-syntax` — it
 * rejects the config outright with "Rule 'no-restricted-syntax' not found in
 * plugin 'eslint'" — so the same seven selectors are expressed here as visitors
 * over the ESTree AST, loaded through `jsPlugins`. The messages are verbatim
 * from the plan.
 *
 * Travels with `oxlint.base.json`: the `jsPlugins` path there is resolved
 * relative to that file, so copying the pair anywhere keeps the rules working.
 */

/** `a * b`, `a / b` — selector: BinaryExpression[operator=/^[*\/]$/] */
const noFloatArithmetic = {
  meta: {
    docs: { description: 'Money arithmetic belongs in @agency/dec.' },
  },
  create(context) {
    return {
      BinaryExpression(node) {
        if (node.operator === '*' || node.operator === '/') {
          context.report({
            node,
            message:
              'Money arithmetic belongs in @agency/dec (mul/div). A float cannot round-trip numeric(12,2).',
          });
        }
      },
    };
  },
};

/**
 * `a.amount > b.amount` — selector: BinaryExpression[operator=/^(<|>|<=|>=)$/].
 * THE rule of this task. A probe against yagoda-starter/backend/src/intakes/
 * measured `return a.amount > b.amount;` exiting 0 while `return a * b;` exited 1.
 */
const noDecimalComparison = {
  meta: {
    docs: { description: 'Relational operators on decimal strings are lexicographic.' },
  },
  create(context) {
    const RELATIONAL = new Set(['<', '>', '<=', '>=']);
    return {
      BinaryExpression(node) {
        if (RELATIONAL.has(node.operator)) {
          context.report({
            node,
            message:
              "Comparing decimal strings with < or > is lexicographic: ['9.00','10.00'].sort() -> 10.00, 9.00. Use dec.cmp/gt/gte/lt/lte.",
          });
        }
      },
    };
  },
};

/**
 * `Number(s)`, `parseFloat(s)`, `parseInt(s)`, `n.toFixed(2)` — plus the six
 * spellings of the same hazard that the first version of this rule permitted,
 * every one of which was measured exiting 0:
 *
 *   Number.parseFloat(s)   Number.parseInt(s)   globalThis.Number(s)
 *   new Number(s)          +s                   n.toPrecision(4)
 *
 * `Number.parseFloat` matters most: it is the form oxlint's own
 * `unicorn/prefer-number-properties` rewrites `parseFloat` INTO, so the two
 * rules together turned a caught violation into an uncaught one.
 *
 * `Number.isInteger`/`Number.isFinite` are deliberately NOT flagged — they are
 * predicates over a count, they return a boolean, and no value passes through
 * them. `packages/dec/src/dec.ts` guards its divisor with one.
 */
const COERCING_NUMBER_STATICS = new Set(['parseFloat', 'parseInt']);
const COERCING_METHODS = new Set(['toFixed', 'toPrecision']);

const noNumericCoercion = {
  meta: {
    docs: { description: 'Coercing a decimal string through a float loses precision silently.' },
  },
  create(context) {
    const coercion = (node) =>
      context.report({
        node,
        message: 'Number() on a decimal string loses precision silently. Use @agency/dec.',
      });

    return {
      UnaryExpression(node) {
        // `+s` is numeric coercion with no name on it: +'0.1' + +'0.2' is
        // 0.30000000000000004. Unary minus is left alone — it is how a negative
        // literal is written.
        if (node.operator === '+') {
          context.report({
            node,
            message:
              'Unary + coerces a decimal string through a float silently. Use @agency/dec.',
          });
        }
      },

      NewExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'Number') coercion(node);
      },

      CallExpression(node) {
        const callee = node.callee;

        if (callee.type === 'Identifier') {
          if (callee.name === 'Number') {
            coercion(node);
          } else if (callee.name === 'parseFloat' || callee.name === 'parseInt') {
            context.report({
              node,
              message:
                'parseFloat/parseInt on a decimal string loses precision silently. Use @agency/dec.',
            });
          }
          return;
        }

        if (callee.type !== 'MemberExpression' || callee.computed) return;
        if (callee.property.type !== 'Identifier') return;
        const property = callee.property.name;

        if (COERCING_METHODS.has(property)) {
          context.report({
            node,
            message: `${property} rounds through a float. Use dec.round(value, scale).`,
          });
          return;
        }

        if (callee.object.type !== 'Identifier') return;
        const object = callee.object.name;
        if (object === 'Number' && COERCING_NUMBER_STATICS.has(property)) {
          context.report({
            node,
            message:
              'parseFloat/parseInt on a decimal string loses precision silently. Use @agency/dec.',
          });
        } else if (object === 'globalThis' && property === 'Number') {
          coercion(node);
        }
      },
    };
  },
};

/**
 * `Math.random()` — and the two other unordered sources SPEC 11 means when it
 * says "seq() or ULID, store-assigned", both of which the first version of this
 * rule let through: `crypto.randomUUID()` and `crypto.getRandomValues()`.
 *
 * `Date.now()` is deliberately absent. It is a legitimate frame clock —
 * `packages/kit/src/animated-number.tsx` measures easing with it — so banning
 * it outright would need an exemption on day one, and an exemption is how a
 * rule starts being negotiated with instead of obeyed.
 */
const UNORDERED = {
  Math: new Set(['random']),
  crypto: new Set(['randomUUID', 'getRandomValues']),
};

const noUnorderedId = {
  meta: {
    docs: { description: 'Ids must be store-assigned and ordered.' },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type === 'MemberExpression' &&
          !callee.computed &&
          callee.object.type === 'Identifier' &&
          callee.property.type === 'Identifier' &&
          UNORDERED[callee.object.name]?.has(callee.property.name)
        ) {
          context.report({
            node,
            message:
              'Math.random() ids have no order. Two FIFO allocators were measured diverging by 1 200,00 UAH in 493 of 1000 runs. Use seq() or a ULID.',
          });
        }
      },
    };
  },
};

/**
 * `xs.sort()` — and the three ways to reach the same default comparator that
 * the `arguments.length === 0` + non-computed test used to miss:
 *
 *   xs.toSorted()      the copying twin, same default comparator
 *   xs.sort(undefined) one argument, and it is the default
 *   xs['sort']()       computed access
 *
 * `toSorted` matters because it is what a reviewer asking for immutability
 * suggests, and it silently reintroduces `['9.00','10.00'] -> ['10.00','9.00']`.
 */
const SORTS = new Set(['sort', 'toSorted']);

/** True when the only argument is literally the default comparator. */
const isDefaultComparator = (args) =>
  args.length === 0 ||
  (args.length === 1 &&
    ((args[0].type === 'Identifier' && args[0].name === 'undefined') ||
      (args[0].type === 'UnaryExpression' && args[0].operator === 'void')));

const noImplicitSort = {
  meta: {
    docs: { description: 'A bare .sort() is lexicographic and locale-blind.' },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!isDefaultComparator(node.arguments)) return;
        const callee = node.callee;
        if (callee.type !== 'MemberExpression') return;

        const name = callee.computed
          ? callee.property.type === 'Literal'
            ? callee.property.value
            : undefined
          : callee.property.type === 'Identifier'
            ? callee.property.name
            : undefined;

        if (typeof name === 'string' && SORTS.has(name)) {
          context.report({
            node,
            message:
              'A bare .sort() is lexicographic and locale-blind. Pass an explicit comparator; use dec.cmp for decimals.',
          });
        }
      },
    };
  },
};

export default {
  meta: { name: 'agency' },
  rules: {
    'no-float-arithmetic': noFloatArithmetic,
    'no-decimal-comparison': noDecimalComparison,
    'no-numeric-coercion': noNumericCoercion,
    'no-unordered-id': noUnorderedId,
    'no-implicit-sort': noImplicitSort,
  },
};

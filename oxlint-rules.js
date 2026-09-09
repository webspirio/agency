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
 * `Number(s)`, `parseFloat(s)`, `parseInt(s)`, `n.toFixed(2)` — selectors:
 * CallExpression[callee.name='Number'],
 * CallExpression[callee.name=/^parse(Float|Int)$/],
 * CallExpression[callee.property.name='toFixed'].
 */
const noNumericCoercion = {
  meta: {
    docs: { description: 'Coercing a decimal string through a float loses precision silently.' },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type === 'Identifier') {
          if (callee.name === 'Number') {
            context.report({
              node,
              message: 'Number() on a decimal string loses precision silently. Use @agency/dec.',
            });
          } else if (callee.name === 'parseFloat' || callee.name === 'parseInt') {
            context.report({
              node,
              message:
                'parseFloat/parseInt on a decimal string loses precision silently. Use @agency/dec.',
            });
          }
          return;
        }
        if (
          callee.type === 'MemberExpression' &&
          !callee.computed &&
          callee.property.type === 'Identifier' &&
          callee.property.name === 'toFixed'
        ) {
          context.report({
            node,
            message: 'toFixed rounds through a float. Use dec.round(value, scale).',
          });
        }
      },
    };
  },
};

/** `Math.random()` — selector: CallExpression[callee.object.name='Math'][callee.property.name='random'] */
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
          callee.object.name === 'Math' &&
          callee.property.type === 'Identifier' &&
          callee.property.name === 'random'
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

/** `xs.sort()` — selector: CallExpression[callee.property.name='sort'][arguments.length=0] */
const noImplicitSort = {
  meta: {
    docs: { description: 'A bare .sort() is lexicographic and locale-blind.' },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.arguments.length !== 0) return;
        const callee = node.callee;
        if (
          callee.type === 'MemberExpression' &&
          !callee.computed &&
          callee.property.type === 'Identifier' &&
          callee.property.name === 'sort'
        ) {
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

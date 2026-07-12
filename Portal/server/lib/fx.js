// Currency → QAR conversion (Val 2026-07-12: financial filters must work in QAR
// and convert USD/foreign values).
//
// Rule 2.1 discipline: the stored/displayed figure is ALWAYS the source's own
// verbatim value in its own currency — conversion is used ONLY to compare/filter,
// never to overwrite a reported number.
//   · USD → QAR is the OFFICIAL QCB peg, fixed at 3.64 since 2001 — a reliable,
//     source-stated rate, not an estimate.
//   · EUR/GBP FLOAT — the rates below are APPROXIMATE, as of FX_AS_OF, and any
//     QAR-equivalent using them is labelled approximate in the UI.
//   · Any other/unknown currency → NULL (excluded from a QAR range filter; never
//     guessed).

export const QAR_PER = {
  QAR: 1,
  USD: 3.64,   // official QCB peg — fixed since 2001 (reliable)
  EUR: 3.95,   // approximate — EUR floats
  GBP: 4.60,   // approximate — GBP floats
};
export const FX_AS_OF = '2026-07';
export const FX_PEGGED = new Set(['QAR', 'USD']);
export const FX_NOTE = 'In QAR. USD converted at the official 3.64 peg; EUR/GBP approximate.';

/** Convert a numeric amount in `currency` to QAR, or null if the currency is
 *  unknown (never guessed). Null/blank currency is treated as unknown. */
export function toQar(valueNum, currency) {
  if (valueNum == null || valueNum === '') return null;
  const rate = QAR_PER[String(currency || '').toUpperCase()];
  if (rate == null) return null;
  return Number(valueNum) * rate;
}

/** SQL expression converting (valueCol, curCol) to QAR. Unknown/NULL currency →
 *  NULL so it drops out of a range comparison (never guessed to be QAR). */
export function qarCaseSql(valueCol = 'value_num', curCol = 'currency') {
  const whens = Object.entries(QAR_PER)
    .map(([cur, rate]) => `WHEN '${cur}' THEN ${valueCol} * ${rate}`)
    .join(' ');
  return `(CASE upper(${curCol}) ${whens} ELSE NULL END)`;
}

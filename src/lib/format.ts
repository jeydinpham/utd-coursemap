/** Counts are zero-padded to two digits, per the design system's label style. */
export const pad2 = (n: number) => String(n).padStart(2, '0');

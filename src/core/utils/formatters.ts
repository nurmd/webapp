/**
 * Formats amount into Indian currency format (e.g., ₹ 1,23,456.78)
 * Gracefully preserves fractional paisa (up to 4 decimal places, e.g., ₹ 21.165)
 * when dealing with wholesale, building material, and hardware rates.
 */
export function formatINR(amount: number, showSymbol = true, decimalPlaces?: number): string {
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);

  let decimals = 2;
  if (decimalPlaces !== undefined) {
    decimals = decimalPlaces;
  } else {
    // If the number has fractional decimals beyond 2 places (e.g. 21.165), preserve up to 4 places
    const fraction = (absAmount * 100) % 1;
    if (Math.abs(fraction) > 0.0001) {
      const decStr = absAmount.toString().split('.')[1] || '';
      decimals = Math.min(4, Math.max(2, decStr.length));
    }
  }

  const parts = absAmount.toFixed(decimals).split('.');
  let lastThree = parts[0].substring(parts[0].length - 3);
  const otherNumbers = parts[0].substring(0, parts[0].length - 3);

  if (otherNumbers !== '') {
    lastThree = ',' + lastThree;
  }
  const formattedWhole = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;
  const result = `${formattedWhole}.${parts[1]}`;

  const prefix = showSymbol ? '₹ ' : '';
  return isNegative ? `-${prefix}${result}` : `${prefix}${result}`;
}

/**
 * Formats date into DD/MM/YYYY or readable string
 */
export function formatDate(dateString: string | Date): string {
  const d = typeof dateString === 'string' ? new Date(dateString) : dateString;
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

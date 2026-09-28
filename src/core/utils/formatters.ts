/**
 * Formats amount into Indian currency format (e.g., ₹ 1,23,456.78)
 */
export function formatINR(amount: number, showSymbol = true): string {
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  const parts = absAmount.toFixed(2).split('.');
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

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'
];

const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
];

function convertLessThanThousand(num: number): string {
  let result = '';
  if (num >= 100) {
    result += ONES[Math.floor(num / 100)] + ' Hundred ';
    num %= 100;
  }
  if (num >= 20) {
    result += TENS[Math.floor(num / 10)] + ' ';
    num %= 10;
  }
  if (num > 0) {
    result += ONES[num] + ' ';
  }
  return result.trim();
}

/**
 * Converts Indian Rupee number to words (Lakhs, Crores format).
 * E.g. 154200.50 -> "Rupees One Lakh Fifty Four Thousand Two Hundred and Fifty Paise Only"
 */
export function amountInWords(amount: number): string {
  if (amount === 0) return 'Rupees Zero Only';

  const parts = amount.toFixed(2).split('.');
  const wholePart = parseInt(parts[0], 10);
  const paisePart = parseInt(parts[1], 10);

  if (isNaN(wholePart)) return '';

  let crore = Math.floor(wholePart / 10000000);
  let remaining = wholePart % 10000000;

  let lakh = Math.floor(remaining / 100000);
  remaining %= 100000;

  let thousand = Math.floor(remaining / 1000);
  remaining %= 1000;

  let words = '';

  if (crore > 0) {
    words += convertLessThanThousand(crore) + ' Crore ';
  }
  if (lakh > 0) {
    words += convertLessThanThousand(lakh) + ' Lakh ';
  }
  if (thousand > 0) {
    words += convertLessThanThousand(thousand) + ' Thousand ';
  }
  if (remaining > 0) {
    words += convertLessThanThousand(remaining) + ' ';
  }

  words = words.trim();
  let result = words.length > 0 ? `Rupees ${words}` : '';

  if (paisePart > 0) {
    const paiseWords = convertLessThanThousand(paisePart);
    result += (result ? ' and ' : 'Rupees ') + `${paiseWords} Paise`;
  }

  return (result + ' Only').replace(/\s+/g, ' ');
}

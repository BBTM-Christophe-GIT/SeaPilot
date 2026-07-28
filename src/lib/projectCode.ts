function projectNumber(projectCode: string): string | null {
  const match = /\d+/.exec(projectCode.trim());
  if (!match) return null;
  return match[0].replace(/^0+(?=\d)/, '');
}

function compareNumericTextDescending(left: string, right: string): number {
  return right.length - left.length || right.localeCompare(left);
}

export function compareProjectCodesNewestFirst(left: string, right: string): number {
  const leftNumber = projectNumber(left);
  const rightNumber = projectNumber(right);

  if (leftNumber !== null && rightNumber !== null) {
    const numberComparison = compareNumericTextDescending(leftNumber, rightNumber);
    if (numberComparison) return numberComparison;
  } else if (leftNumber !== null) {
    return -1;
  } else if (rightNumber !== null) {
    return 1;
  }

  return right.localeCompare(left, 'fr', { numeric: true, sensitivity: 'base' });
}

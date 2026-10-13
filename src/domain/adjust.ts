/** 5.3 補正トータル = トータルe1RM × (基準体重 / その時点の週平均体重) ^ 指数 */
export function adjustedTotal(
  total: number,
  baseWeight: number,
  weekAvgWeight: number,
  exponent: number,
): number {
  return total * Math.pow(baseWeight / weekAvgWeight, exponent)
}

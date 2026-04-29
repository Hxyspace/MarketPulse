/**
 * 三大模块统一状态枚举。
 * - HOT  : 过热 / 高估 / 高温
 * - COLD : 过冷 / 低估 / 低温
 * - NORMAL: 适中 / 正常
 */
export enum StatusKind {
  HOT = 'hot',
  NORMAL = 'normal',
  COLD = 'cold',
}

/**
 * 初期世界(創世)の仕様。
 * iGPU(テスト機)でも滑らかに動く規模に絞る。Mac mini では統合側で
 * より大きな GenesisSpec を渡して引き上げてよい。
 */
import type { GenesisSpec } from "../contracts2";

export const GENESIS: GenesisSpec = {
  food: 9000, // 世界に散布する糧
  creatures: 2500, // 脳を持ついのちの初期数
  clusters: 6, // 初期の群れの塊数(始祖の系譜)
};

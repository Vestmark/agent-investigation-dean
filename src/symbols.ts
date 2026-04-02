import { getUniqueSymbols, addSymbolToDb, removeSymbolHoldings } from "./db.js";

export function loadSymbols(): string[] {
  return getUniqueSymbols();
}

export function addSymbol(symbol: string): string[] {
  const upper = symbol.toUpperCase();
  addSymbolToDb(upper);
  return loadSymbols();
}

export function removeSymbol(symbol: string): string[] {
  const upper = symbol.toUpperCase();
  removeSymbolHoldings(upper);
  return loadSymbols();
}

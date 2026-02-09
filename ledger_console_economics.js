const cost = ((Ledger.reads / 100000) * 0.06 + (Ledger.writes / 100000) * 0.18 + (Ledger.deletes / 100000) * 0.02).toFixed(5);
console.groupCollapsed(`💰 Manual Ledger Check`);
console.log(`Session Totals: ${Ledger.reads}R | ${Ledger.writes}W | ${Ledger.deletes}D`);
console.log(`Estimated Session Cost: $${cost}`);
console.table(Ledger.categories);
console.groupEnd();
/** Exact presentation only. Conversion policy and charge authority remain server-side. */
export function formatCustomerCredits(ledgerUnits:string,locale:string):string{
  try{
    const n=BigInt(ledgerUnits);
    const abs=n<0n?-n:n;
    const whole=abs/1000n;
    const fractional=abs%1000n;
    const decimal=new Intl.NumberFormat(locale).formatToParts(1.1).find(p=>p.type==="decimal")?.value??".";
    const part=fractional===0n?"":decimal+fractional.toString().padStart(3,"0").replace(/0+$/,"");
    return `${n<0n?"-":""}${whole.toLocaleString(locale)}${part}`;
  }catch{return "Unavailable";}
}
/** Fixed Stripe pack display: only label divisible ledger amounts as whole credits. */
export function formatPackCreditValue(ledgerUnits:string,locale:string):string{
  try{
    const n=BigInt(ledgerUnits);
    if(n<0n) return "Unavailable";
    return n%1000n===0n?`${(n/1000n).toLocaleString(locale)} credits`:`${n.toLocaleString(locale)} ledger units`;
  }catch{return "Unavailable";}
}

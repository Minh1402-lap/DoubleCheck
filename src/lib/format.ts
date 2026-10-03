const integerFormatter=new Intl.NumberFormat("en-US",{maximumFractionDigits:0});
const byteFormatter=new Intl.NumberFormat("en-US",{notation:"compact",style:"unit",unit:"byte",unitDisplay:"narrow"});
const usdFormatter=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:2});
const dateTimeFormatter=new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeStyle:"short",timeZone:"UTC"});

export const formatInteger=(value:number)=>integerFormatter.format(value);
export const formatCompactBytes=(value:number)=>byteFormatter.format(value);
export const formatUsd=(value:number)=>usdFormatter.format(value);
export const formatDateTimeUtc=(value:string|number|Date)=>dateTimeFormatter.format(new Date(value));

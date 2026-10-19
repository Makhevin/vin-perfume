(function(root){
  const activeDiscount=(p,now=Date.now())=>{
    if(p.promotionStart&&now<Date.parse(p.promotionStart)||p.promotionEnd&&now>=Date.parse(p.promotionEnd))return 0;
    return Math.min(90,Math.max(0,Number(p.discountPercent)||0));
  };
  const price=(p,size,now)=>Math.round(Number(p.prices[size])*(1-activeDiscount(p,now)/100)*100)/100;
  const stock=(p,size)=>Number.isInteger(p.stock?.[size])?Math.max(0,p.stock[size]):null;
  root.VinCatalogRules={activeDiscount,price,stock};
})(typeof window==='object'?window:globalThis);

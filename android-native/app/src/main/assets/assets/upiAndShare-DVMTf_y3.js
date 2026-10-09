function $(t,e,r){const a=(r||"").replace(/\D/g,""),o=a.length===10?`91${a}`:a,n=`*Tax Invoice from ${e.tradeName||e.businessName}*
------------------------------
*Invoice No:* ${t.invoiceNumber}
*Date:* ${t.date}
*Customer:* ${t.partyName}
*Grand Total:* ₹${t.grandTotal.toLocaleString("en-IN")}
*Balance Due:* ₹${t.balanceAmount.toLocaleString("en-IN")}
*Payment Status:* ${t.paymentStatus}
------------------------------
${e.upiId?`*Pay via UPI:* ${e.upiId}`:""}
${e.bankName?`*Bank:* ${e.bankName} | A/C: ${e.accountNumber} | IFSC: ${e.ifscCode}`:""}

Thank you for your business!`;return`https://wa.me/${o}?text=${encodeURIComponent(n)}`}function l(t,e,r,a,o){const n=(e||"").replace(/\D/g,""),s=n.length===10?`91${n}`:n,u=`Namaste ${t},

This is a gentle payment reminder from *${a}*.
Your outstanding balance is *₹${r.toLocaleString("en-IN")}*.

${o?`You can pay immediately via UPI: *${o}*`:""}

Please let us know once paid or if you have any questions regarding your ledger statement.

Thank you!`;return`https://wa.me/${s}?text=${encodeURIComponent(u)}`}export{$ as a,l as g};

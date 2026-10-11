function u(t,e,s){const a=(s||"").replace(/\D/g,""),n=a.length===10?`91${a}`:a,r=`*${e.isCompositionScheme?"Bill of Supply":e.isGstEnabled!==!1?"Tax Invoice":"Invoice"} from ${e.tradeName||e.businessName}*
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

Thank you for your business!`;return`https://wa.me/${n}?text=${encodeURIComponent(r)}`}function i(t,e,s,a,n){const o=(e||"").replace(/\D/g,""),r=o.length===10?`91${o}`:o,l=`Namaste ${t},

This is a gentle payment reminder from *${a}*.
Your outstanding balance is *₹${s.toLocaleString("en-IN")}*.

${n?`You can pay immediately via UPI: *${n}*`:""}

Please let us know once paid or if you have any questions regarding your ledger statement.

Thank you!`;return`https://wa.me/${r}?text=${encodeURIComponent(l)}`}export{u as a,i as g};

import{r as c}from"./vendor-react-BmrtlWLx.js";/**
 * @license lucide-react v1.48.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const E=t=>t==null?void 0:t.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase();/**
 * @license lucide-react v1.48.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */function I(t,e,n=[]){if(e==null)throw new Error("[lucide]: iconNode is required when icon name is used");return{name:E(t),size:24,node:e,...n.length>0?{aliases:n}:{}}}/**
 * @license lucide-react v1.48.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const j=t=>{let e="",n=!1;for(const o of t){if(o==="-"||o==="_"||o<=" "){n=e.length>0;continue}e.length===0?e+=o.toLowerCase():e+=n?o.toUpperCase():o,n=!1}return e};/**
 * @license lucide-react v1.48.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const P=t=>{const e=j(t);return e.charAt(0).toUpperCase()+e.slice(1)};/**
 * @license lucide-react v1.48.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const z=(...t)=>t.filter((e,n,o)=>!!e&&e.trim()!==""&&o.indexOf(e)===n).join(" ").trim();/**
 * @license lucide-react v1.48.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const r={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":2,"stroke-linecap":"round","stroke-linejoin":"round"};/**
 * @license lucide-react v1.48.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */function N(t){return t!=null}function _(t,e={}){var b,k;const n=e.attributeNames??{},o=i=>n[i]??i,l=t.size??t.width??r.width,u=t.size??t.height??r.height,h=((b=t.aliases)==null?void 0:b.filter(i=>typeof i=="string"&&i.trim()!=="").map(i=>`lucide-${i}`))??[],f=[...t.name?[`lucide-${t.name}`]:[],...h],s=((k=e.className)==null?void 0:k.split(" ").filter(Boolean))??[],w=e.includeDefaultClasses===!1?z(...s):z("lucide",...f,...s),x=e.absoluteStrokeWidth?Number(e.strokeWidth??r["stroke-width"])*Number(t.size??t.width??r.width)/Number(e.size??e.width??r.width):e.strokeWidth??r["stroke-width"];return["svg",{...Object.entries(r).reduce((i,[a,d])=>(i[o(a)]=d,i),{}),..."color"in e&&e.color&&{[o("stroke")]:e.color},..."size"in e&&N(e.size)&&{[o("width")]:e.size,[o("height")]:e.size},..."width"in e&&N(e.width)&&{[o("width")]:e.width},..."height"in e&&N(e.height)&&{[o("height")]:e.height},[o("stroke-width")]:x,...w&&{[o("class")]:w},[o("viewBox")]:`0 0 ${l} ${u}`,...e.hasA11yProp===!1?{[o("aria-hidden")]:"true"}:{},..."attributes"in e&&e.attributes},t.node.map(i=>{const[a,d,C]=i,g=e.nonScalingStroke?{[o("vector-effect")]:"non-scaling-stroke",...d}:d;return C?[a,g,C]:[a,g]})]}/**
 * @license lucide-react v1.48.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */function D(t,e={}){return _(t,{...e,attributeNames:{...e.attributeNames,class:"className","stroke-width":"strokeWidth","stroke-linecap":"strokeLinecap","stroke-linejoin":"strokeLinejoin","vector-effect":"vectorEffect"}})}/**
 * @license lucide-react v1.48.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const H=t=>{for(const e in t)if(e.startsWith("aria-")||e==="role"||e==="title")return!0;return!1},M=c.createContext({}),R=()=>c.useContext(M),F=c.forwardRef(({color:t,size:e,width:n,height:o,strokeWidth:l,absoluteStrokeWidth:u,nonScalingStroke:h,className:f="",children:s,iconNode:w=[],icon:x={node:w,aliases:[],size:24},...m},b)=>{const{size:k=24,strokeWidth:i=2,absoluteStrokeWidth:a=!1,nonScalingStroke:d=!1,color:C="currentColor",className:g=""}=R()??{},v=!!s||H(m),[W,L,p=[]]=D(x,{color:t??C,width:n??e??k,height:o??e??k,strokeWidth:l??i,absoluteStrokeWidth:u??a,nonScalingStroke:h??d,className:z(g,f),hasA11yProp:v,attributes:m});return c.createElement(W,{ref:b,...L},[...p.map(([B,$])=>c.createElement(B,$)),...Array.isArray(s)?s:[s]])});/**
 * @license lucide-react v1.48.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */function A(t,e=[],n=[]){const o=typeof t=="string"?I(t,e,n):t,l=c.forwardRef(({className:u,...h},f)=>c.createElement(F,{ref:f,icon:o,className:u,...h}));return o.name&&(l.displayName=P(o.name)),l}/**
 * @license lucide-react v1.48.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const S={name:"book-open",size:24,node:[["path",{d:"M12 5v16",key:"1f6ucr"}],["path",{d:"M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z",key:"1fyvmf"}]]};S.node;const q=A(S);/**
 * @license lucide-react v1.48.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const y={name:"circle-check-big",size:24,node:[["path",{d:"M21.801 10A10 10 0 1 1 17 3.335",key:"yps3ct"}],["path",{d:"m9 11 3 3L22 4",key:"1pflzl"}]],aliases:["check-circle"]};y.node;const K=A(y);export{q as B,K as C};

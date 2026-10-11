import { entry } from './utils.mjs';

export function getSection6Items() {
  const items = [];

  // Chapter 50: Silk
  const ch50 = [
    ['50010000', 'Silkworm cocoons suitable for reeling', 0],
    ['50020010', 'Raw silk (not thrown), mulberry raw silk yarn', 5],
    ['50020020', 'Raw silk: Tussar, eri and muga raw silk', 5],
    ['50030010', 'Silk waste (including cocoons unsuitable for reeling, yarn waste and garnetted stock), uncombed', 5],
    ['50040010', 'Silk yarn (other than yarn spun from silk waste) not put up for retail sale (mulberry filament thrown silk yarn)', 5],
    ['50050010', 'Yarn spun from silk waste, not put up for retail sale (spun silk yarn, noil yarn)', 5],
    ['50060010', 'Silk yarn and yarn spun from silk waste, put up for retail sale (embroidery silk skeins, sewing thread)', 5],
    ['50071000', 'Fabrics of noil silk', 5],
    ['50072010', 'Woven fabrics of silk containing 85% or more by weight of silk: Handloom pure silk saree fabric (Kanjeevaram, Banarasi, Mysore silk)', 5],
    ['50072090', 'Powerloom pure silk fabric (crepe de chine, georgette, chiffon, raw silk fabric)', 5],
    ['50079010', 'Fabrics of silk mixed with cotton or other fibres', 5],
  ];
  for (const [c, d, r] of ch50) items.push(entry(c, d, r));

  // Chapter 51: Wool, Fine or Coarse Animal Hair; Horsehair Yarn
  const ch51 = [
    ['51011100', 'Greasy wool, including fleece-washed wool, shorn (raw indigenous sheep wool)', 5],
    ['51012100', 'Degreased wool, not carbonised, shorn (scoured Australian merino wool)', 5],
    ['51021100', 'Fine animal hair, not carded or combed: Of Kashmir (cashmere / pashmina) goats', 5],
    ['51021910', 'Angora rabbit hair / mohair from Angora goats', 5],
    ['51031000', 'Noils of wool or of fine animal hair', 5],
    ['51051000', 'Carded wool', 5],
    ['51052100', 'Combed wool in fragments (wool tops, merino combed tops)', 5],
    ['51061010', 'Yarn of carded wool, not put up for retail sale: For carpet manufacturing (shoddy woollen yarn)', 5],
    ['51071000', 'Yarn of combed wool (worsted yarn for suiting fabrics)', 5],
    ['51081000', 'Yarn of fine animal hair (cashmere pashmina knitting yarn)', 5],
    ['51111110', 'Woven fabrics of carded wool or fine animal hair: Tweed, flannel, overcoat fabrics', 5],
    ['51121110', 'Woven fabrics of combed wool: Worsted suiting fabrics (pure wool and wool-rich blended suit lengths, Raymond type)', 5],
    ['51121910', 'Blended worsted blazer and trouser fabrics', 5],
    ['51130000', 'Woven fabrics of coarse animal hair or of horsehair (haircloth interlinings)', 5],
  ];
  for (const [c, d, r] of ch51) items.push(entry(c, d, r));

  // Chapter 52: Cotton
  const ch52 = [
    ['52010011', 'Cotton, not carded or combed: Raw unginned seed cotton (kapas)', 0],
    ['52010015', 'Cotton, ginned, medium staple (Shankar-6, Bunny, Brahma cotton bales)', 5],
    ['52010019', 'Cotton, ginned, long and extra-long staple (Suvin, DCH-32 cotton)', 5],
    ['52021000', 'Yarn waste (including thread waste) of cotton', 5],
    ['52029900', 'Garnetted stock and cotton blowroom waste', 5],
    ['52030000', 'Cotton, carded or combed (combed cotton silver for ring spinning)', 5],
    ['52041110', 'Cotton sewing thread, not put up for retail sale (grey or bleached)', 5],
    ['52042010', 'Cotton sewing thread, put up for retail sale (spools and tubes, Coats, Vardhman type)', 12],
    ['52051110', 'Cotton yarn (other than sewing thread), single yarn of uncombed fibres: Count up to 14s (coarse carded yarn for denim warp)', 5],
    ['52051210', 'Cotton yarn: Count between 14s and 30s (carded hosiery yarn)', 5],
    ['52052210', 'Cotton yarn, combed: Count 20s to 30s (combed knitting yarn for T-shirts)', 5],
    ['52052310', 'Cotton yarn, combed: Count 30s to 40s (compact combed yarn for shirting)', 5],
    ['52052410', 'Cotton yarn, combed: Count 40s to 60s (fine combed yarn)', 5],
    ['52052610', 'Cotton yarn, combed: Superfine count 80s, 100s, 120s (gassed mercerised yarn)', 5],
    ['52061200', 'Cotton blended yarn containing predominantly cotton mixed with polyester', 5],
    ['52071000', 'Cotton yarn put up for retail sale (crochet cotton yarn, knitting yarn balls)', 5],
    // Cotton fabrics 5208 - 5212
    ['52081110', 'Woven fabrics of cotton, unbleached (grey fabric, sheeting, kora cloth)', 5],
    ['52082110', 'Woven fabrics of cotton, bleached: Cambric, poplin and mull for shirts', 5],
    ['52083110', 'Woven fabrics of cotton, dyed: Solid dyed poplin, twill, gabardine', 5],
    ['52084110', 'Woven fabrics of cotton of yarns of different colours: Yarn-dyed checks and stripes shirting', 5],
    ['52085110', 'Woven fabrics of cotton, printed: Screen and rotary printed cotton dress fabric, voile, mulmul', 5],
    ['52091100', 'Woven fabrics of cotton weighing more than 200 g/m2: Unbleached cotton canvas / duck fabric', 5],
    ['52094200', 'Denim fabrics of cotton (indigo dyed cotton denim fabric, 10 oz, 12 oz, 14 oz denim for jeans)', 5],
    ['52095110', 'Heavy printed cotton fabrics for curtains and sofa upholstery', 5],
    ['52101110', 'Woven fabrics of cotton mixed with man-made fibres: Poly-cotton grey fabric', 5],
    ['52103110', 'Poly-cotton dyed uniform and shirting fabric', 5],
    ['52114200', 'Poly-cotton stretch denim fabrics containing elastane', 5],
    ['52121100', 'Other woven fabrics of cotton, handloom woven khadi fabric', 5],
  ];
  for (const [c, d, r] of ch52) items.push(entry(c, d, r));

  // Chapter 53: Other Vegetable Textile Fibres; Paper Yarn
  const ch53 = [
    ['53011000', 'Flax, raw or retted (raw linen fibre)', 5],
    ['53012100', 'Flax, broken or scutched', 5],
    ['53021000', 'True hemp (Cannabis sativa L.), raw or retted', 5],
    ['53031010', 'Jute, raw or retted (raw tossa jute, white jute fibres in unbaled / baled form)', 0],
    ['53039010', 'Jute cuttings and jute butt ends', 5],
    ['53050010', 'Coir fibre, raw (brown and white coconut coir fibre for mattresses)', 5],
    ['53050040', 'Sisal fibre and agave fibres, raw', 5],
    ['53061010', 'Flax yarn, single (pure linen yarn for apparel weaving)', 5],
    ['53071010', 'Yarn of jute or of other textile bast fibres of heading 5303: Single jute yarn (hessian quality, sacking yarn)', 5],
    ['53072000', 'Multiple (folded) or cabled jute yarn / twine', 5],
    ['53081010', 'Coir yarn (baled coir yarn for mats and geofabric)', 5],
    ['53091110', 'Woven fabrics of flax (pure linen shirting and suiting fabrics)', 5],
    ['53101011', 'Unbleached woven fabrics of jute: Hessian cloth (burlap fabric rolls)', 5],
    ['53101012', 'Jute sacking cloth for grain and potato bags (B-Twill sacking fabric)', 5],
    ['53109010', 'Dyed or laminated decorative jute fabrics for carry bags and handicrafts', 5],
    ['53110010', 'Woven fabrics of ramie or true hemp', 5],
  ];
  for (const [c, d, r] of ch53) items.push(entry(c, d, r));

  // Chapter 54: Man-Made Filaments; Synthetic Filament Yarn and Fabrics
  const ch54 = [
    ['54011000', 'Sewing thread of synthetic filaments, whether or not put up for retail sale (spun polyester thread, nylon bonded thread)', 12],
    ['54021110', 'High tenacity yarn of nylon or other polyamides for tyre cord', 18],
    ['54022010', 'High tenacity yarn of polyesters (industrial polyester yarn for seatbelts and conveyor belts)', 18],
    ['54023300', 'Textured yarn of polyesters: Draw textured yarn (DTY 75/36, 150/48, 300/96 for knitting and weaving)', 12],
    ['54024400', 'Elastomeric filament yarn (spandex / Lycra yarn for stretch garments)', 12],
    ['54024700', 'Polyester partially oriented yarn (POY) for texturising', 18],
    ['54024800', 'Fully drawn polyester yarn (FDY bright, semi-dull, trilobal for warp)', 12],
    ['54025100', 'Single yarn of nylon or other polyamides, twisted (monofilament yarn)', 12],
    ['54031000', 'High tenacity yarn of viscose rayon for industrial reinforcement', 18],
    ['54033100', 'Viscose filament yarn (VFY / bright rayon yarn for embroidery and zari)', 12],
    ['54041100', 'Elastomeric monofilament of 67 decitex or more', 18],
    ['54041200', 'Polypropylene monofilament for brush bristles and agricultural netting', 18],
    ['54049010', 'Polypropylene slit film tape (PP raffia tape for woven sacks)', 12],
    ['54060010', 'Synthetic filament yarn put up for retail sale (polyester embroidery yarn cones)', 12],
    ['54071010', 'Woven fabrics obtained from high tenacity yarn of nylon: Parachute cloth and ballistic nylon fabric', 12],
    ['54072010', 'Woven fabrics obtained from strip or the like: Polypropylene woven fabric rolls (PP woven tubular cloth, HDPE tarpaulin fabric)', 12],
    ['54075100', 'Woven fabrics containing 85% or more by weight of textured polyester: Polyester georgette, crepe, chiffon, moss crepe fabrics for women dresses and sarees', 5],
    ['54075210', 'Solid dyed polyester suiting and uniform fabric', 5],
    ['54075410', 'Printed polyester saree and dress fabric (Surat printed georgette)', 5],
    ['54076110', 'Woven fabrics containing 85% or more of non-textured polyester filaments: Polyester micro-fibre fabrics for sportswear and jackets', 5],
    ['54082210', 'Woven fabrics of artificial filament yarn: Viscose rayon dyed lining fabric and satin cloth', 5],
    ['54083410', 'Printed rayon fabric for kurtis and ethnic tops', 5],
  ];
  for (const [c, d, r] of ch54) items.push(entry(c, d, r));

  // Chapter 55: Man-Made Staple Fibres
  const ch55 = [
    ['55011000', 'Synthetic filament tow: Of nylon or other polyamides', 18],
    ['55012000', 'Synthetic filament tow of polyesters', 18],
    ['55013000', 'Acrylic or modacrylic filament tow', 18],
    ['55031100', 'Synthetic staple fibres, not carded: Of aramids (Kevlar, Nomex fibres for fireproof protective apparel)', 18],
    ['55032000', 'Polyester staple fibres (PSF virgin and recycled / rPET fibres from PET bottles for spinning and nonwovens)', 18],
    ['55033000', 'Acrylic staple fibres (ASF for wool-substitute blankets, sweaters, shawls)', 18],
    ['55034000', 'Polypropylene staple fibres for geo-textiles and carpet pile', 18],
    ['55041000', 'Artificial staple fibres: Viscose rayon staple fibres (VSF for soft modal and viscose spun yarn)', 18],
    ['55042000', 'Lyocell / modal cellulosic staple fibres (Tencel)', 18],
    ['55051000', 'Waste of synthetic fibres (including noils, yarn waste and garnetted stock)', 18],
    ['55081000', 'Sewing thread of synthetic staple fibres (poly-poly corespun sewing thread)', 12],
    ['55092100', 'Yarn (other than sewing thread) containing 85% or more by weight of polyester staple fibres: Single spun polyester yarn', 12],
    ['55093100', 'Yarn containing 85% or more of acrylic staple fibres (cashmilon acrylic knitting yarn)', 12],
    ['55095100', 'Polyester-viscose blended yarn (PV yarn 65:35 for suiting fabrics)', 12],
    ['55095300', 'Polyester-cotton blended yarn (PC yarn 67:33)', 12],
    ['55101100', 'Yarn of artificial staple fibres (100% spun viscose yarn)', 12],
    ['55121110', 'Woven fabrics of synthetic staple fibres containing 85% or more of polyester: Polyester spun fabrics for shirting and trousers', 5],
    ['55122110', 'Woven acrylic fabrics for warm winter shawls and stoles', 5],
    ['55151110', 'Woven fabrics of polyester staple fibres mixed with viscose: PV suiting fabrics (polyester-viscose formal pant pieces)', 5],
    ['55151210', 'PV fabrics mixed with man-made filaments for blazers and coats', 5],
    ['55161200', 'Woven fabrics of artificial staple fibres: 100% spun viscose dyed fabrics for ladies kurtas and palazzo', 5],
    ['55161400', 'Printed spun rayon fabric for ethnic wear', 5],
  ];
  for (const [c, d, r] of ch55) items.push(entry(c, d, r));

  // Chapter 56: Wadding, Felt, Nonwovens; Ropes, Twines and Cordage
  const ch56 = [
    ['56012110', 'Wadding of textile materials: Cotton wadding for quilts, mattresses and cosmetic pads', 12],
    ['56012200', 'Wadding of man-made fibres: Polyester wadding (polyfill sheet for winter jackets and comforters)', 12],
    ['56013000', 'Textile flock and dust and mill neps (flocking powder for velvet effect)', 12],
    ['56021000', 'Needleloom felt and stitch-bonded fibre fabrics (industrial felt seals, automotive acoustic felt)', 12],
    ['56022100', 'Wool felt sheets for musical instruments and padding', 12],
    ['56031100', 'Nonwovens, whether or not impregnated, coated or laminated: Of man-made filaments, weighing not more than 25 g/m2 (spunbond nonwoven for medical 3-ply face masks, hygiene top sheets)', 12],
    ['56031200', 'Spunbond nonwoven fabric weighing more than 25 g/m2 but not more than 70 g/m2 (nonwoven fabric rolls for D-cut carry bags and shoe covers)', 12],
    ['56031300', 'Spunbond and meltblown nonwovens for surgical gowns, PPE kits and filtration', 12],
    ['56039200', 'Spunlace nonwoven fabric for wet baby wipes and facial cleansing sheets', 12],
    ['56039400', 'Needle-punched geo-textile nonwoven fabric for road stabilization and drainage', 12],
    ['56041000', 'Rubber thread and cord, textile covered (covered elastic cord / bungee cord)', 12],
    ['56050010', 'Metallised yarn: Real zari thread (gold and silver zari yarn for sarees)', 12],
    ['56050020', 'Imitation metallic zari yarn (polyester metallised yarn in gold, silver, metallic colours)', 12],
    ['56072100', 'Binder or baler twine, of sisal', 12],
    ['56074100', 'Binder or baler twine, of polyethylene or polypropylene', 12],
    ['56074900', 'Twine, cordage, ropes and cables of polyethylene or polypropylene (HDPE monofilament ropes, PP danline ropes for marine fishing and packaging)', 12],
    ['56075010', 'Nylon ropes and braided ropes for climbing, safety harnesses and cargo lashing', 12],
    ['56081110', 'Knotted netting of twine, cordage or rope: Made up fishing nets of nylon filament (gill nets, trawl nets)', 12],
    ['56081900', 'Sports nets: Tennis nets, football goal nets, cricket practice nets', 12],
    ['56090010', 'Articles of yarn, strip, twine, cordage, rope: Slings, cargo lashing belts and marine dock lines', 12],
  ];
  for (const [c, d, r] of ch56) items.push(entry(c, d, r));

  // Chapter 57: Carpets and Other Textile Floor Coverings
  const ch57 = [
    ['57011010', 'Carpets and other textile floor coverings, knotted: Hand-knotted woollen carpets (Kashmir silk-on-wool carpets, Bhadohi hand-knotted Persian carpets)', 12],
    ['57011020', 'Tibetan and Nepalese knotted wool rugs', 12],
    ['57019010', 'Hand-knotted silk carpets (pure silk pile hand-knotted floor carpets)', 12],
    ['57021000', 'Kelem, Schumacks, Karamanie and similar hand-woven flatweave rugs (cotton dhurries, woollen kilim rugs)', 12],
    ['57022010', 'Floor coverings of coconut fibres (coir mats, coir corridor mattings, coir mesh geofabric)', 5],
    ['57023110', 'Carpets of wool or fine animal hair, woven, not tufted: Wilton and Axminster commercial woven carpets for hotels', 12],
    ['57024210', 'Woven carpets of man-made textile materials: Polypropylene heat-set prayer carpets (musalla / masjid carpets)', 12],
    ['57031010', 'Tufted carpets of wool or fine animal hair (hand-tufted custom rugs)', 12],
    ['57032010', 'Tufted carpets of nylon: Modular carpet tiles with PVC or bitumen backing for modern corporate offices', 18],
    ['57033010', 'Tufted carpets of polypropylene: Wall-to-wall exhibition carpets, rib carpets for trade fairs', 12],
    ['57033090', 'Synthetic turf artificial grass mats for balconies, landscaping and sports grounds', 18],
    ['57041000', 'Tiles of felt, having a maximum surface area of 0.3 m2', 12],
    ['57050011', 'Other carpets and floor coverings: Cotton bathmats, braided rag rugs, rubber-backed printed welcome door mats', 12],
    ['57050021', 'Handmade jute floor rugs and circular braided jute floor mats', 5],
  ];
  for (const [c, d, r] of ch57) items.push(entry(c, d, r));

  // Chapter 58: Special Woven Fabrics; Tufted Fabrics; Lace; Embroidery
  const ch58 = [
    ['58011000', 'Woven pile fabrics and chenille fabrics: Of wool or fine animal hair', 12],
    ['58012100', 'Uncut web pile fabrics of cotton (cotton corduroy fabric)', 5],
    ['58012200', 'Cut corduroy of cotton', 5],
    ['58013600', 'Chenille fabrics of man-made fibres (upholstery sofa chenille fabric)', 12],
    ['58013710', 'Velvet fabric of synthetic filaments (micro-velvet 9000 for bridal lehengas and upholstery)', 12],
    ['58021100', 'Terry towelling and similar woven terry fabrics, of cotton, unbleached', 5],
    ['58021910', 'Woven cotton terry towelling fabric in rolls, dyed or bleached (plush bath towel terry cloth)', 5],
    ['58041000', 'Tulles and other net fabrics (nylon net, bridal veil net)', 12],
    ['58042100', 'Mechanically made lace: Of man-made fibres (lace trims, jacquard lace fabric)', 12],
    ['58050010', 'Hand-woven tapestries of the type Gobelins, Flanders, Aubusson and needle-worked tapestries', 12],
    ['58061000', 'Narrow woven fabrics: Woven pile fabrics and chenille fabrics (velvet ribbons)', 12],
    ['58062000', 'Narrow woven fabrics containing by weight 5% or more of elastomeric yarn (woven elastic webbing for underwear and sportswear)', 12],
    ['58063200', 'Satin ribbons of man-made fibres for gift wrapping and hair bows (single and double face satin ribbons)', 18],
    ['58063910', 'Tapes, webbings and narrow fabrics of cotton for garment drawstrings and binding', 12],
    ['58071010', 'Labels, badges and similar articles of textile materials, woven: Woven brand labels and wash care labels for garments', 12],
    ['58081010', 'Braids in the piece (cotton and nylon braided cords for hoodies and jackets)', 12],
    ['58101000', 'Embroidery without visible ground (chemical lace embroidery)', 12],
    ['58109100', 'Embroidery on cotton fabric: Chikankari embroidery, thread work embroidery on cotton cambric', 12],
    ['58109210', 'Embroidery on man-made fibres with zari, sequins and stones (zari embroidered fabrics for sherwanis and sarees)', 12],
    ['58110000', 'Quilted textile products in the piece (quilted jacket lining, mattress protector quilted fabric)', 12],
  ];
  for (const [c, d, r] of ch58) items.push(entry(c, d, r));

  // Chapter 59: Impregnated, Coated, Covered or Laminated Textile Fabrics
  const ch59 = [
    ['59011000', 'Textile fabrics coated with gum or amylaceous substances, of a kind used for the outer covers of books (bookbinding cloth)', 12],
    ['59019010', 'Tracing cloth and prepared painting canvas for artists', 12],
    ['59021000', 'Tyre cord fabric of high tenacity yarn of nylon or other polyamides (nylon tyre cord fabric / NTCF)', 18],
    ['59022000', 'Tyre cord fabric of high tenacity yarn of polyesters', 18],
    ['59031010', 'Textile fabrics impregnated, coated, covered or laminated with polyvinyl chloride: PVC artificial leather cloth (rexine for vehicle seat covers, sofas and shoes)', 18],
    ['59032010', 'Textile fabrics coated with polyurethane (PU synthetic leather for jackets, bags and footballs)', 18],
    ['59041000', 'Linoleum, whether or not cut to shape; Floor coverings consisting of a coating or covering applied on a textile backing', 18],
    ['59061000', 'Rubberised textile fabrics: Adhesive tape of a width not exceeding 20 cm (friction tape, fabric insulation tape)', 18],
    ['59069100', 'Rubberised knitted or crocheted fabrics for hospital rubber mackintosh bed sheeting', 12],
    ['59070012', 'Oilcloth and fabrics coated with oil preparations', 18],
    ['59080000', 'Textile wicks, woven, plaited or knitted, for lamps, stoves, lighters, candles (cotton diya wicks / candle wicks)', 5],
    ['59090010', 'Textile hosepiping and similar textile tubing: Fire hoses, with or without lining, armour or accessories of other materials (canvas fire hose pipe)', 12],
    ['59100000', 'Transmission or conveyor belts or belting, of textile material, whether or not impregnated, coated, covered or laminated with plastics (canvas elevator belt)', 18],
    ['59111000', 'Textile fabrics, felt and felt-lined woven fabrics, coated or laminated with rubber, leather for card clothing', 18],
    ['59112000', 'Bolting cloth, whether or not made up (polyester screen printing bolting mesh)', 18],
    ['59119010', 'Filter cloth and press cloths for industrial filter presses in chemical and pharma plants', 18],
  ];
  for (const [c, d, r] of ch59) items.push(entry(c, d, r));

  // Chapter 60: Knitted or Crocheted Fabrics
  const ch60 = [
    ['60011010', 'Long pile knitted fabrics (sherpa fleece, plush blanket fabric)', 5],
    ['60012100', 'Looped pile knitted fabrics of cotton (cotton French terry knit fabric for sweatshirts)', 5],
    ['60019200', 'Polar fleece knitted fabrics of man-made fibres for jackets and tracksuits', 5],
    ['60024000', 'Knitted or crocheted fabrics containing by weight 5% or more of elastomeric yarn: Cotton lycra single jersey (4-way stretch knit fabric for leggings)', 5],
    ['60032000', 'Knitted fabrics of a width not exceeding 30 cm, of cotton', 5],
    ['60041000', 'Warp knit fabrics containing elastomeric yarn: Powernet and tricot fabric for swimwear and sportswear', 5],
    ['60052100', 'Warp knit fabrics (including those made on galloon knitting machines), of cotton', 5],
    ['60053600', 'Warp knit polyester mosquito net fabric', 5],
    ['60062100', 'Circular knit unbleached single jersey fabrics of cotton', 5],
    ['60062200', 'Circular knit dyed fabrics of cotton: Cotton single jersey, rib 1x1, interlock, pique knit for polo shirts (180 GSM, 220 GSM)', 5],
    ['60062400', 'Printed cotton knitted fabrics for nightwear and kids wear', 5],
    ['60063200', 'Knitted fabrics of synthetic fibres: Polyester dry-fit mesh knit fabric for sports jerseys', 5],
    ['60064200', 'Knitted fabrics of artificial fibres: Modal and rayon single jersey for ladies tops', 5],
  ];
  for (const [c, d, r] of ch60) items.push(entry(c, d, r));

  // Chapter 61: Articles of Apparel and Clothing Accessories, Knitted or Crocheted
  const ch61 = [
    ['61012000', 'Mens or boys overcoats, car-coats, capes, cloaks, anoraks, wind-cheaters, knitted or crocheted, of cotton', 12],
    ['61013000', 'Mens or boys wind-cheaters, ski-jackets, of man-made fibres, knitted', 12],
    ['61022000', 'Womens or girls overcoats, car-coats, cloaks, wind-cheaters, knitted, of cotton', 12],
    ['61031000', 'Mens or boys suits, knitted or crocheted', 12],
    ['61032200', 'Mens or boys ensembles, of cotton, knitted', 12],
    ['61033200', 'Mens or boys jackets and blazers, of cotton, knitted', 12],
    ['61034200', 'Mens or boys trousers, bib and brace overalls, breeches and shorts, of cotton, knitted (track pants, joggers, sweatpants, Bermuda shorts)', 5],
    ['61041910', 'Womens or girls suits, knitted (knitted kurti-pant sets)', 5],
    ['61043200', 'Womens or girls jackets and blazers, of cotton, knitted', 12],
    ['61044200', 'Womens or girls dresses, of cotton, knitted (maxi dresses, t-shirt dresses)', 5],
    ['61045200', 'Womens or girls skirts and divided skirts, of cotton, knitted', 5],
    ['61046200', 'Womens or girls trousers, leggings and tights, of cotton, knitted (cotton lycra ankle-length leggings, churidar leggings)', 5],
    ['61051000', 'Mens or boys polo shirts, knitted, of cotton (collared polo t-shirts)', 5],
    ['61052000', 'Mens or boys shirts, knitted, of man-made fibres (polyester golf shirts)', 5],
    ['61061000', 'Womens or girls blouses, shirts and shirt-blouses, knitted, of cotton', 5],
    ['61071100', 'Mens or boys underpants and briefs, knitted or crocheted, of cotton (mens cotton briefs, trunks, boxers)', 5],
    ['61071200', 'Mens underpants and briefs, of man-made fibres (microfibre boxer briefs)', 5],
    ['61072100', 'Mens or boys nightshirts and pyjamas, of cotton, knitted (cotton sleepwear pyjama sets)', 5],
    ['61079100', 'Mens bathrobes, dressing gowns, of cotton, knitted', 12],
    ['61081100', 'Womens or girls slips and petticoats, knitted', 5],
    ['61082100', 'Womens or girls panties and briefs, of cotton, knitted (cotton hipster panties, seamless briefs)', 5],
    ['61083100', 'Womens or girls nightdresses and pyjamas, of cotton, knitted (night suits, capri sets)', 5],
    ['61089200', 'Womens bathrobes and dressing gowns, of man-made fibres, knitted', 12],
    // T-shirts, jerseys, pullovers 6109 - 6110
    ['61091000', 'T-shirts, singlets and other vests, knitted or crocheted, of cotton (round neck cotton T-shirts, crew neck T-shirts, sleeveless gym vests, banian)', 5],
    ['61099010', 'T-shirts, singlets and other vests, of synthetic fibres (dry-fit polyester sportswear gym T-shirts)', 5],
    ['61101110', 'Jerseys, pullovers, cardigans, waistcoats and similar articles: Of wool (woollen sweaters, cardigans, v-neck pullovers)', 5],
    ['61101200', 'Pullovers and sweaters of Kashmir (cashmere) goats', 12],
    ['61102000', 'Jerseys, pullovers, sweatshirts, hoodies, of cotton, knitted (cotton fleece hooded sweatshirts / hoodies)', 5],
    ['61103000', 'Sweaters and cardigans of man-made fibres (acrylic knit sweaters)', 5],
    ['61112000', 'Babies garments and clothing accessories, knitted, of cotton (infant onesies, rompers, baby bibs, baby mittens)', 5],
    ['61121100', 'Track suits, of cotton, knitted (warm-up tracksuit sets)', 5],
    ['61121200', 'Track suits, of synthetic fibres (polyester training tracksuits)', 5],
    ['61123100', 'Mens or boys swimwear, of synthetic fibres, knitted (swimming trunks, jammer shorts)', 12],
    ['61124100', 'Womens or girls swimwear, of synthetic fibres, knitted (one-piece swimming suits, bikinis)', 12],
    ['61142000', 'Other garments, knitted, of cotton (gym leotards, martial arts uniforms)', 5],
    ['61151000', 'Graduated compression hosiery (medical varicose vein compression stockings)', 12],
    ['61152100', 'Other panty hose and tights, of synthetic fibres (sheer nylon stockings, pantyhose)', 5],
    ['61159500', 'Socks, ankle socks and sports socks, of cotton, knitted (cushioned cotton sports socks, formal dress socks)', 5],
    ['61161000', 'Gloves, mittens and mitts, knitted, impregnated, coated with plastics or rubber (PU coated assembly gloves, nitrile coated knit gloves)', 12],
    ['61169200', 'Knitted winter gloves, of cotton or acrylic', 5],
    ['61171010', 'Shawls, scarves, mufflers, mantillas, veils, knitted: Of wool (woollen mufflers, neck scarves)', 5],
    ['61178010', 'Ties, bow ties and cravats, knitted', 12],
    ['61178040', 'Knitted headbands, wristbands and sweatbands for tennis and running', 12],
  ];
  for (const [c, d, r] of ch61) items.push(entry(c, d, r));

  // Chapter 62: Articles of Apparel and Clothing Accessories, Not Knitted (Woven)
  const ch62 = [
    ['62011100', 'Mens or boys overcoats, raincoats, car-coats, of wool or fine animal hair (overcoats, trench coats)', 12],
    ['62011300', 'Mens overcoats, raincoats, of man-made fibres (waterproof polyester raincoats with hood)', 12],
    ['62021100', 'Womens or girls overcoats, raincoats, of wool', 12],
    ['62029300', 'Womens padded winter puffer jackets, of man-made fibres', 12],
    ['62031100', 'Mens or boys suits: Of wool or fine animal hair (pure wool two-piece and three-piece business suits)', 12],
    ['62031200', 'Mens suits of synthetic fibres (poly-viscose formal suits, tuxedo)', 12],
    ['62032200', 'Mens ensembles of cotton (safari suits, workwear overalls)', 5],
    ['62033100', 'Mens jackets and blazers, of wool (tweed blazers, navy blue wool blazers)', 12],
    ['62033200', 'Mens jackets and blazers, of cotton (casual cotton blazers, linen blazers)', 12],
    ['62034200', 'Mens or boys trousers, bib overalls, breeches and shorts, of cotton: Mens denim jeans (stretch denim jeans, cotton chino trousers, cargo pants)', 5],
    ['62034300', 'Mens trousers and shorts of synthetic fibres (formal poly-viscose trousers)', 5],
    ['62041200', 'Womens or girls suits, of cotton (woven salwar kameez sets, pant suits)', 5],
    ['62042210', 'Womens ethnic ensembles: Kurta with pyjama / churidar', 5],
    ['62043200', 'Womens jackets and blazers, of cotton (formal corporate blazers)', 12],
    ['62044220', 'Womens dresses, of cotton (maxi dresses, a-line dresses, cotton frock)', 5],
    ['62045200', 'Womens skirts and divided skirts, of cotton', 5],
    ['62046200', 'Womens trousers, bib overalls and shorts, of cotton: Womens jeans, cotton trousers, capris', 5],
    ['62052000', 'Mens or boys shirts, woven, of cotton (mens formal office shirts, casual cotton shirts, half sleeve / full sleeve shirts)', 5],
    ['62053000', 'Mens shirts of man-made fibres (polyester blended formal shirts)', 5],
    ['62063000', 'Womens or girls blouses, shirts and shirt-blouses, of cotton (woven tops, peplum tops, crop shirts)', 5],
    ['62064000', 'Womens blouses of man-made fibres (designer chiffon tops, georgette partywear tops)', 5],
    ['62071100', 'Mens underpants and briefs, woven, of cotton (cotton boxer shorts with elastic waist)', 5],
    ['62072100', 'Mens nightshirts and pyjamas, woven, of cotton (cotton night pyjama sets, kurta pyjama lounge sets)', 5],
    ['62079110', 'Mens lungies and dhotis, of cotton (traditional South Indian white cotton dhoti / veshti, lungi)', 5],
    ['62082100', 'Womens nightdresses and pyjamas, woven, of cotton (cotton nighty / maxi gowns)', 5],
    ['62089110', 'Womens cotton petticoats for sarees', 5],
    ['62092000', 'Babies garments and clothing accessories, woven, of cotton (baby shirts, baby frocks, cotton nappies)', 5],
    ['62101000', 'Garments made up of fabrics of heading 5602 or 5603 (disposable nonwoven medical surgical gowns, lab coats)', 12],
    ['62102000', 'Mens raincoats, capes, made of rubberised or plastic-coated fabrics', 12],
    ['62111100', 'Mens or boys swimwear, woven (board shorts)', 12],
    ['62113200', 'Other garments, mens or boys, of cotton: Mens traditional kurtas, sherwanis, nehru jackets', 5],
    ['62114210', 'Womens traditional garments: Sarees of cotton (Chanderi, Maheshwari, Kota doria, handloom cotton sarees)', 5],
    ['62114310', 'Sarees of synthetic fibres: Georgette sarees, chiffon sarees, printed crepe sarees', 5],
    ['62114910', 'Sarees of pure silk with zari border (Kanchipuram silk sarees, Banarasi silk sarees, Tussar silk sarees)', 5],
    ['62121000', 'Brassieres (bras: padded bras, sports bras, t-shirt bras, wire-free bras)', 5],
    ['62122000', 'Girdles and panty-girdles (shapewear)', 12],
    ['62123000', 'Corselettes and body suits', 12],
    ['62132000', 'Handkerchiefs, woven, of cotton (mens white cotton handkerchiefs, pocket squares)', 5],
    ['62141010', 'Shawls, scarves, mufflers, mantillas, veils: Of silk (pure silk stoles, dupattas)', 5],
    ['62142010', 'Kashmiri woollen shawls (pashmina shawls, embroidered jamawar shawls, kani shawls)', 12],
    ['62149010', 'Dupattas and chunnis, of cotton or synthetic chiffon (printed dupatta, bandhani dupatta)', 5],
    ['62151000', 'Ties, bow ties and cravats: Of silk or silk waste (pure silk formal neckties)', 18],
    ['62152000', 'Ties and bow ties of man-made fibres (microfibre jacquard neckties)', 18],
    ['62160010', 'Gloves, mittens and mitts, woven (winter cotton gloves, drivers gloves)', 12],
    ['62171010', 'Clothing accessories: Belts of woven fabric, suspenders, armbands, garters', 12],
    ['62171020', 'Face masks of textile material (washable 2-ply and 3-ply cotton cloth face masks)', 5],
  ];
  for (const [c, d, r] of ch62) items.push(entry(c, d, r));

  // Chapter 63: Other Made Up Textile Articles; Sets; Worn Clothing
  const ch63 = [
    ['63011000', 'Electric blankets', 18],
    ['63012000', 'Blankets (other than electric blankets) and travelling rugs, of wool or fine animal hair (pure wool hospital blankets, military blankets)', 5],
    ['63013000', 'Blankets and travelling rugs, of cotton (cotton thermal blankets, baby blankets)', 5],
    ['63014000', 'Blankets of synthetic fibres (mink blankets, polar fleece double bed blankets, Solaron type)', 12],
    ['63021000', 'Bed linen, knitted or crocheted (fitted stretch bedsheets)', 5],
    ['63022110', 'Bed linen, of cotton, printed (cotton double bedsheets with pillow covers, Jaipur printed bed covers)', 5],
    ['63023100', 'Bed linen, of cotton, other than printed (white hospital bedsheets, hotel plain satin stripe bedsheets)', 5],
    ['63023200', 'Bed linen of man-made fibres (microfibre printed bedsheets)', 5],
    ['63025100', 'Table linen, of cotton (cotton tablecloths, table placemats, dining napkins)', 5],
    ['63026000', 'Toilet linen and kitchen linen, of terry towelling or similar terry fabrics, of cotton (cotton bath towels, hand towels, face towels, kitchen dish towels)', 5],
    ['63031200', 'Curtains (including drapes) and interior blinds: Of synthetic fibres (polyester eyelet window curtains, blackout curtains, sheer organza curtains)', 12],
    ['63039100', 'Curtains and draperies, of cotton', 5],
    ['63041910', 'Bedspreads, bed covers, sofa throw covers, of cotton', 5],
    ['63049200', 'Cushion covers, pillow shams, of cotton (embroidered decorative cushion covers)', 5],
    ['63051010', 'Sacks and bags, of a kind used for the packing of goods: Of jute or other textile bast fibres (jute gunny bags, B-Twill bags for wheat and paddy packaging)', 5],
    ['63052000', 'Sacks and bags, of cotton (cotton flour bags, shopping bags)', 5],
    ['63053200', 'Flexible intermediate bulk containers (FIBC / jumbo bulk bags, 1 tonne capacity, of polypropylene)', 12],
    ['63053300', 'Sacks and bags of polyethylene or polypropylene strip (HDPE woven sacks for fertilizer, cement and feed)', 12],
    ['63061200', 'Tarpaulins, awnings and sunblinds: Of synthetic fibres (multi-layer cross-laminated tarpaulins, HDPE waterproof truck covers / tirpal)', 18],
    ['63062200', 'Tents, of synthetic fibres (camping dome tents, disaster relief tents)', 12],
    ['63064000', 'Pneumatic mattresses (inflatable air beds of textile)', 18],
    ['63071010', 'Floor-cloths, dish-cloths, dusters and similar cleaning cloths (cotton floor pocha, microfibre cleaning cloths for cars and glass)', 5],
    ['63072000', 'Life-jackets and life-belts of textile material', 12],
    ['63079010', 'Textile face masks (N95 particulate respirator masks, surgical masks of nonwoven material conforming to IS 16289)', 5],
    ['63080000', 'Sets consisting of woven fabric and yarn, whether or not with accessories, for making up into rugs, tapestries, embroidered table cloths', 12],
    ['63090000', 'Worn clothing and other worn articles, packed in bulk bales', 5],
    ['63101010', 'Used or new rags, scrap twine, cordage, rope of textile materials, sorted (cotton hosiery wiping rags for machines)', 5],
  ];
  for (const [c, d, r] of ch63) items.push(entry(c, d, r));

  // Chapter 64: Footwear, Gaiters and Parts Thereof
  const ch64 = [
    ['64011000', 'Waterproof footwear incorporating a protective metal toe-cap (rubber gumboots with steel toe for construction)', 18],
    ['64019200', 'Waterproof rubber boots covering the ankle but not covering the knee (agricultural gumboots, monsoon gumboots)', 12],
    ['64019910', 'Rubber overshoes and non-protective rain boots', 5],
    ['64021200', 'Ski-boots, cross-country ski footwear', 18],
    ['64021910', 'Sports footwear with outer soles and uppers of rubber or plastics: Running shoes, training shoes, tennis sneakers', 12],
    ['64022010', 'Footwear with upper straps or thongs assembled to the sole by means of plugs (Hawaiian rubber chappals, flip-flops, bathroom slippers)', 5],
    ['64029110', 'Ankle-length boots and safety boots of plastics', 12],
    ['64029910', 'Casual sandals, floaters, clogs and slip-on shoes with outer soles and uppers of rubber or plastics (EVA injection molded slippers, Crocs type)', 5],
    ['64029990', 'Moulded plastic shoes and PVC school shoes', 5],
    ['64031900', 'Sports footwear with outer soles of rubber, plastics, leather and uppers of leather (leather football boots, cricket shoes, golf shoes)', 12],
    ['64032000', 'Footwear with outer soles of leather, and uppers consisting of leather straps across the instep and around the big toe (Kolhapuri chappals, leather mojari, jutti)', 5],
    ['64035111', 'Footwear with outer soles of leather: Ankle-length leather formal shoes (mens leather Chelsea boots, dress boots)', 18],
    ['64035911', 'Footwear with outer soles of leather: Mens formal leather oxford shoes, derby shoes, brogues, loafers (Bata, Woodland, Clarks type)', 18],
    ['64039110', 'Footwear with outer soles of rubber and uppers of leather: Industrial safety shoes with steel toe cap (Karam, Allen Cooper safety boots)', 18],
    ['64039910', 'Leather casual shoes, leather sandals and leather slippers for men and women', 12],
    ['64041100', 'Sports footwear; Tennis shoes, basketball shoes, gym shoes with outer soles of rubber or plastics and uppers of textile materials (canvas sneakers, running trainers, Nike, Adidas, Puma type)', 12],
    ['64041910', 'Casual canvas shoes with vulcanised rubber sole (Converse type canvas shoes, white school PT shoes)', 5],
    ['64041990', 'Textile upper sandals, slip-ons, mesh casual walking shoes (Skechers type)', 12],
    ['64042000', 'Footwear with outer soles of leather or composition leather and uppers of textile materials', 12],
    ['64051000', 'Other footwear with uppers of leather or composition leather', 12],
    ['64052000', 'Other footwear with uppers of textile materials (embroidered bridal sandals, velvet slippers)', 12],
    ['64059000', 'Other footwear (wooden clogs, hand-crafted folk footwear)', 5],
    ['64061010', 'Uppers and parts thereof, other than stiffeners: Prepared leather shoe uppers', 12],
    ['64062000', 'Outer soles and heels, of rubber or plastics (TPR shoe soles, PU soles, EVA shoe sheet outsoles)', 18],
    ['64069010', 'Removable in-soles, heel cushions, arch supports (orthopedic silicone insoles)', 12],
    ['64069020', 'Gaiters, leggings and similar articles and parts thereof', 18],
  ];
  for (const [c, d, r] of ch64) items.push(entry(c, d, r));

  // Chapter 65: Headgear and Parts Thereof
  const ch65 = [
    ['65010000', 'Hat-forms, hat bodies and hoods of felt, neither blocked to shape nor with made brims', 12],
    ['65040000', 'Hats and other headgear, plaited or made by assembling strips of any material (straw sun hats)', 12],
    ['65050010', 'Knitted winter caps, beanies, woollen monkey caps (balaclavas)', 5],
    ['65050090', 'Baseball caps, golf caps, sun visors of woven textile fabric', 12],
    ['65061010', 'Safety headgear: Industrial safety helmets conforming to IS 2925 for construction and factory workers (hard hats)', 18],
    ['65061020', 'Motorcycle crash helmets conforming to IS 4151 (full face and open face rider helmets, Studds, Steelbird, Vega type)', 18],
    ['65061030', 'Sports safety helmets: Cricket batting helmets, bicycle helmets, skating helmets', 12],
    ['65069100', 'Bathing caps, of rubber or plastics (silicone swimming caps)', 12],
    ['65069900', 'Disposable nonwoven bouffant caps and surgeon caps for cleanrooms and kitchens', 12],
    ['65070000', 'Head-bands, linings, covers, hat foundations, hat frames, peaks and chinstraps, for headgear', 12],
  ];
  for (const [c, d, r] of ch65) items.push(entry(c, d, r));

  // Chapter 66: Umbrellas, Walking-Sticks, Seat-Sticks, Whips
  const ch66 = [
    ['66011000', 'Garden or similar umbrellas (large patio sun umbrellas, beach umbrellas)', 12],
    ['66019100', 'Umbrellas having a telescopic shaft (2-fold and 3-fold compact rain umbrellas)', 12],
    ['66019900', 'Standard long stick umbrellas (mens golf umbrellas, traditional black cane handle umbrellas)', 12],
    ['66020000', 'Walking-sticks, seat-sticks, whips, riding-crops and the like (wooden walking canes, adjustable aluminium walking sticks for seniors)', 12],
    ['66032000', 'Umbrella frames, including frames mounted on shafts (ribs and stretchers for umbrella manufacture)', 12],
    ['66039010', 'Handles and knobs for umbrellas and walking sticks', 12],
  ];
  for (const [c, d, r] of ch66) items.push(entry(c, d, r));

  // Chapter 67: Prepared Feathers, Artificial Flowers, Articles of Human Hair
  const ch67 = [
    ['67010010', 'Articles of feather or down (feather dusters)', 18],
    ['67021000', 'Artificial flowers, foliage and fruit and parts thereof: Of plastics (plastic artificial plants, decorative flower garlands, bonsai pots)', 18],
    ['67029010', 'Artificial flowers of silk, satin, velvet and other textile fabrics', 18],
    ['67030010', 'Human hair, dressed, thinned, bleached or otherwise worked; Wool or other animal hair prepared for use in making wigs', 12],
    ['67041100', 'Complete wigs of synthetic textile materials', 18],
    ['67041900', 'Hairpieces, false beards, eyebrows, eyelashes, switches of synthetic textile materials (synthetic false eye lashes, hair extensions)', 18],
    ['67042010', 'Wigs, false beards, toupees of human hair', 18],
  ];
  for (const [c, d, r] of ch67) items.push(entry(c, d, r));

  return items;
}

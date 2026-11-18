# Brand fonts: GQR Healthcare and UnitiMed

## GQR Healthcare: NOT verified
I could not read the GQR website. gqrhealthcare.com does not connect (secure connection fails). The real site appears to be www.gqr.com, which answers automated requests with "403 Forbidden", so I could not see its fonts. I did not guess. Nothing is marked "GQR" yet.

To finish: open www.gqr.com in Chrome, right-click a heading, choose Inspect, and note the "font-family" shown (Computed tab). Send me the names, or just a screenshot, and I will bundle them.

## UnitiMed (unitimed.com): verified
The site uses **Futura** (a Futura family, loaded through the "Use Any Font" WordPress plugin).
- Headings, buttons: Futura (regular, bold, bold oblique). Evidence: `h1,h2,h3,h4,h5,h6{font-family:'futura',Georgia,...}` and `.et_pb_button{font-family:'futura',...}`
- Body text and form fields: Futura Book (`body,input,textarea,select{font-family:'futura-boo',...}`)
- Small headings: Futura Light Oblique (`h4{font-family:'futura-ligobl'}`)
- Also defined: Futura Medium/Demi/Extra Bold and Futura Condensed.
- Evidence URLs: https://unitimed.com/wp-content/uploads/useanyfont/uaf.css and https://unitimed.com/wp-content/et-cache/6916/et-core-unified-6916.min.css

**Licence:** Futura is a commercial font. We cannot bundle it.

**Stand-in:** Jost (free, SIL Open Font License), which has a very similar geometric look. It is bundled in `public/fonts/` (regular and italic, weights 300-700) and labelled "UnitiMed, stand-in for Futura". A font pair "UnitiMed brand (Futura stand-in)" is available.

**To use the real Futura:** BJ would need to buy a web/app licence for Futura (for example from Fonts.com or Adobe Fonts via Monotype), or supply the licensed WOFF2 files, covering the weights above. Adobe Fonts cannot be bundled into our app.

Total added size: about 60 KB (two files).

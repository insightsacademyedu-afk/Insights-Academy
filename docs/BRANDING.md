# Insights Academy login branding

The login page follows the supplied navy-and-gold study-desk reference. Live HTML provides the sign-in form, academy name, tagline and slogan. The photograph contains the book lettering. Authentication and password reset behavior remain connected to the existing API.

Assets saved in this project:

- `client/public/branding/academy-cover-v2.png`: current panoramic background, refined with the built-in image-generation tool to match the cover photo's black-and-gold books, darker walnut desk and narrow right-hand window. Top to bottom, the spines read **KNOWLEDGE**, **DISCIPLINE**, **SUCCESS**.
- `client/public/branding/academy-study-books.png`: earlier background variant with book lettering.
- `client/public/branding/academy-study-background.png`: original generated background before the book-lettering edit.
- `client/public/branding/insights-academy-original.jpeg`: preserved copy of the supplied academy logo.
- `client/public/branding/insights-mark.svg` and `client/src/components/AcademyBrand.jsx`: scalable rendering of the supplied triangular reader/book mark and academy wordmark. The dark-surface variation uses an ivory mark with the coral accent. Used on the login page, desktop/mobile navigation, browser favicon, and receipt header.

## Background generation prompt

Use case: photorealistic-natural. Asset type: full-bleed desktop background photograph for an academy sign-in webpage, wide landscape 16:9. Create a refined, realistic study desk scene inspired by an upscale academy office: dark midnight navy painted wall across most of the image, polished warm walnut desk across the bottom quarter, three stacked elegant dark leather-bound books on the far lower left and a black fountain pen with subtle brass accents resting beside them. Small leafy plant in a pale pot at the far left. A partially visible open laptop at the far lower right, cropped by the right image edge. On the far right is a tall window with warm late-afternoon sunlight and softly blurred trees outside. Cinematic soft natural lighting, restrained gold highlights, rich navy shadows, realistic wood grain. Composition: keep the entire central vertical 40% of the frame as clean dark navy negative space above a clear desk surface, so a real HTML logo and sign-in form can later be overlaid. Keep upper-left-middle wall free for a real HTML slogan. No form, no UI, no logos, no emblems, NO TEXT anywhere, no lettering on books, no watermark. Photograph only, no graphic overlays. Symmetrical, calm academy mood, eye level camera, sharp foreground objects, premium editorial photography.

## Final book-lettering edit prompt

Edit this academy study-desk background photograph. Preserve the exact scene, framing, navy wall, plant, laptop, window, desk, lighting and central empty space. Change only the three stacked book spines at the lower left: add elegant, correctly spelled embossed gold uppercase lettering centered on the visible spine of each book. Top book: KNOWLEDGE. Middle book: DISCIPLINE. Bottom book: SUCCESS. Lettering should follow the perspective and curvature of each spine naturally, restrained refined serif typography, highly legible. Do not add any other text, logos, forms, icons or objects. Keep all other pixels/composition as close to the original as possible.

The built-in tool was used; no external stock image URLs or API key are required. Background assets are served locally by the app. Responsive CSS adjusts the page for narrow screens and shorter windows. Interactive browser preview was unavailable in this session; build and automated UI checks were used for verification.

## Cover-photo refinement prompt

Refine this background to closely match a premium academy login cover photograph. Preserve a clean deep midnight navy wall, warm desk, books on lower left, laptop on lower right, narrow sunlit window along far right. Make the three book bindings BLACK charcoal leather, not brown, with thin refined brass trim and exact embossed gold serif titles: top KNOWLEDGE, middle DISCIPLINE, bottom SUCCESS. Make the desk a darker polished reddish walnut rather than bright orange. Plant should be smaller, softly blurred and darker on the far-left edge, not dominate the scene. Keep the window confined to the rightmost 15 percent and its trees softly blurred, with warm sunlight. Laptop remains foreground lower-right with black keyboard and warm highlights. Desk starts around 73 percent down the frame. Keep all of the center and upper wall empty midnight navy for real HTML logo and form. Elegant restrained cinematic photograph, closer to a dark navy-and-gold school office cover. Wide panoramic landscape composition around 2.2:1. No logo, no form, no other typography except the three book spine titles. Preserve the camera eye level and photorealism. Do not add extra books, objects or decorative graphics.

The login uses a monochrome gold rendering of the supplied academy mark, an ivory serif wordmark, gold divider rules, the reference slogan, and a filled cap/book watermark. Desktop framing preserves the full cover composition; narrower screens use a cropped background with a readable centered form.

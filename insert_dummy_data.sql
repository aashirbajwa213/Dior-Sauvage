-- Clear existing database tables
DELETE FROM order_items;
DELETE FROM reviews;
DELETE FROM product_packs;
DELETE FROM orders;
DELETE FROM products;

-- Reset autoincrement sequences
DELETE FROM sqlite_sequence WHERE name IN ('products', 'product_packs', 'order_items', 'reviews');

-- 1. Insert Single Product: Dior Sauvage Eau de Parfum 100ml
INSERT INTO products (
    id, slug, title, base_price, original_price, description, long_description, badge, meta_title, meta_description, images, specs, features, compatibility, faqs, review_count, rating
) VALUES (
    1,
    'dior-sauvage-100ml',
    'Dior Sauvage Eau de Parfum - 100ml',
    4599.0,
    8500.0,
    'Direct Brand Leftover Stock Lot: Experience the identical scent profile, beast-mode projection, and 12+ hours monster longevity of Dior Sauvage Eau de Parfum 100ml. Sourced from brand leftover surplus stock lots with signature weighted magnetic cap bottle, offered at direct surplus pricing with Free Express Delivery, Cash on Delivery and Open Parcel Checking Warranty across Pakistan.',
    '<p>Unleash the magnetic power of <strong>Dior Sauvage Eau de Parfum 100ml</strong> sourced from our exclusive <strong>Brand Leftover Stock Lot</strong>. Sourced in surplus inventory to deliver the exact same intoxicating sillage, monster projection, and 12+ hours lasting power as the retail showroom bottle at an honest, accessible price.</p><p>Opening with the crisp, zesty burst of sun-drenched Calabrian Bergamot, it transitions into an intoxicating heart of Sichuan Pepper, Star Anise, and Lavender, settling into a rich, lingering trail of Ambroxan and smoky Papua New Guinean Vanilla.</p><h3 class="text-base font-bold text-gray-900 mt-4 mb-2">Why Our Brand Leftover Lot Stands Out</h3><ul class="list-disc list-inside space-y-1 text-gray-600"><li><strong>Brand Leftover Stock Lot:</strong> Sourced in bulk surplus inventory without boutique showroom overheads, giving you the same prestigious scent at direct lot prices.</li><li><strong>1:1 Lasting & Projection:</strong> Rich Eau de Parfum oil concentration delivering 12+ hours beast-mode projection and sillage identical to the original.</li><li><strong>Signature Magnetic Cap:</strong> Heavy luxury glass bottle with iconic magnetic click cap and micro-fine precision atomizer spray.</li><li><strong>Inspection On Arrival (COD):</strong> Order with total peace of mind with Free Delivery, Cash on Delivery and Open Parcel Check Warranty in Pakistan.</li></ul>',
    'Brand Leftover Lot',
    'Dior Sauvage 100ml Price in Pakistan | Brand Leftover Lot EDP Fragrance',
    'Buy Dior Sauvage Eau de Parfum 100ml in Pakistan for Rs. 4,599 with Free Delivery. Identical 12+ hours monster lasting, projection, and Cash on Delivery with open parcel check warranty.',
    '["/images/sauvage-dior/sauvage-4.jpg","/images/sauvage-dior/sauvage-2.webp","/images/sauvage-dior/sauvage-3.webp","/images/sauvage-dior/sauvage-5.jpg","/images/sauvage-dior/sauvage-6.webp","/images/sauvage-dior/sauvage-1.webp","/images/sauvage-dior/sauvage-bottle.jpg"]',
    '[{"label":"Product Lot","value":"Brand Leftover Stock Lot"},{"label":"Fragrance Name","value":"Dior Sauvage"},{"label":"Concentration","value":"Eau de Parfum (EDP)"},{"label":"Volume","value":"100ml / 3.4 FL.OZ."},{"label":"Fragrance Family","value":"Fresh Aromatic Fougère & Warm Amber"},{"label":"Top Notes","value":"Calabrian Bergamot, Spicy Pepper"},{"label":"Heart Notes","value":"Sichuan Pepper, Lavender, Star Anise, Nutmeg"},{"label":"Base Notes","value":"Ambroxan, Papua New Guinean Vanilla, Cedarwood"},{"label":"Longevity","value":"10 - 14+ Hours"},{"label":"Origin","value":"Brand Leftover Surplus Lot"},{"label":"Batch Code","value":"Verifiable on CheckFresh"}]',
    '[{"title":"Brand Leftover Lot (1:1 Quality)","description":"Premium surplus lot delivering the identical scent formulation, sillage, and magnetic cap bottle."},{"title":"12+ Hours Monster Longevity","description":"Rich EDP concentration delivering captivating sillage and all-day projection identical to retail."},{"title":"Calabrian Bergamot & Amber","description":"Radiant burst of fresh citrus intertwined with sensual vanilla absolute and ambroxan."},{"title":"Open Parcel Check Warranty","description":"Inspect your bottle upon arrival before paying Cash on Delivery across Pakistan."}]',
    '["All Weather & Four-Season Wear","Evening Galas & Formal Gatherings","Daily Office & Executive Wear","Signature Date Night Scent","Ideal Luxury Gift for Men"]',
    '[{"question":"What is a Brand Leftover Lot and why is the price so reasonable?","answer":"Brand leftover lots are surplus inventory batches received in bulk. Because brand leftover lots bypass luxury boutique showroom markups and high mall overheads, we are able to provide the exact same fragrance formulation, magnetic cap bottle, and 12+ hours lasting power at very reasonable prices."},{"question":"Does it have the same lasting and projection as the original?","answer":"Yes, 100%! It features the identical scent formulation with sun-drenched Calabrian bergamot, magnetic ambroxan, and smoky Papua vanilla, delivering 12+ hours monster longevity and head-turning projection."},{"question":"Can I check the parcel before paying (Open Parcel / Checking Warranty)?","answer":"Yes! We offer a full Cash on Delivery Checking Warranty. You can inspect the parcel upon delivery before handing over payment."},{"question":"How long does the fragrance last?","answer":"It delivers phenomenal beast-mode performance: easily 10 to 14+ hours of longevity on skin and over 24 hours on clothes, with strong projection."},{"question":"What are the delivery charges and delivery times?","answer":"We deliver nationwide across all cities in Pakistan within 2 to 4 working days via TCS and Leopards Courier with 100% FREE express shipping!"},{"question":"What is your refund or exchange policy?","answer":"We offer a 7-day hassle-free return and exchange guarantee if the item is damaged or does not meet authenticity standards."}]',
    1840,
    4.9
);

-- 2. Insert Product Packs (Exclusive Bulk/Bundle Offers)
INSERT INTO product_packs (product_id, pack_label, unit_count, pack_price, free_shipping) VALUES 
(1, 'Single Pack', 1, 4599.0, 1),
(1, 'Duo Pack', 2, 8499.0, 1),
(1, 'Trio Pack', 3, 11999.0, 1);

-- 3. Insert Reviews for Dior Sauvage 100ml
INSERT INTO reviews (product_id, rating, title, text, author, location, is_visible) VALUES
(1, 5.0, '100% Original - Verified Batch Code!', 'Ordered with slight hesitation but it is completely genuine! Checked the batch code on CheckFresh and verified the magnetic cap click. The projection is insane, lasted over 14 hours on my shirt.', 'Hamza Tariq', 'Lahore, DHA', 1),
(1, 5.0, 'Best perfume in Pakistan hands down', 'Dior Sauvage is my all-time signature scent. The bergamot opening and vanilla dry-down are unmatched. Courier delivered in 2 days in Karachi, excellent service.', 'Daniyal Khan', 'Karachi, Clifton', 1),
(1, 5.0, 'Massive compliments from everyone', 'Wore it to a wedding reception and at least 5 people asked me what I was wearing. Genuine product, super fast delivery and great packaging.', 'Usman Farooq', 'Islamabad, F-10', 1),
(1, 4.8, 'Worth every rupee', 'Delivery was prompt via TCS and COD was hassle-free. Authentic fragrance with strong sillage. Will definitely buy the Duo pack next time for my brother.', 'Shahzaib Ali', 'Rawalpindi, Bahria Town', 1),
(1, 5.0, 'Exceptional longevity and sillage', 'Smells rich, magnetic and luxurious. Spray atomizer is so smooth. Thank you for providing genuine perfumes in Pakistan at reasonable prices.', 'Dr. Bilal Arshad', 'Faisalabad', 1);

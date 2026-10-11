export interface ProductPack {
    id: number;
    product_id: number;
    pack_label: string;
    unit_count: number;
    pack_price: number;
    free_shipping: number;
}

export interface ReviewItem {
    id: number;
    product_id: number;
    rating: number;
    title: string;
    text: string;
    author: string;
    location: string;
    is_visible: number;
    created_at?: string;
}

export interface ProductType {
    id: number;
    slug: string;
    title: string;
    base_price: number;
    original_price: number;
    rating: number;
    review_count: number;
    badge: string;
    description: string;
    long_description: string;
    meta_title: string;
    meta_description: string;
    images: string[];
    specs: { label: string; value: string }[];
    features: { title: string; description: string }[];
    compatibility: string[];
    faqs: { question: string; answer: string }[];
    packs: ProductPack[];
    reviews: ReviewItem[];
}

export const singleSauvageProduct: ProductType = {
    id: 1,
    slug: "dior-sauvage-100ml",
    title: "Dior Sauvage Eau de Parfum - 100ml",
    base_price: 4599,
    original_price: 8500,
    rating: 4.9,
    review_count: 1840,
    badge: "Brand Leftover Lot",
    description: "Direct Brand Leftover Lot: Experience the identical scent profile, beast-mode projection, and 12+ hours monster longevity of Dior Sauvage Eau de Parfum 100ml. Sourced from brand leftover surplus stock lots with signature weighted magnetic cap bottle, offered at direct surplus pricing with Free Express Delivery, Cash on Delivery and Open Parcel Checking Warranty across Pakistan.",
    long_description: `<p>Unleash the magnetic power of <strong>Dior Sauvage Eau de Parfum 100ml</strong> sourced from our exclusive <strong>Brand Leftover Stock Lot</strong>. Sourced in surplus inventory to deliver the exact same intoxicating sillage, monster projection, and 12+ hours lasting power as the retail showroom bottle at an honest, accessible price.</p><p>Opening with the crisp, zesty burst of sun-drenched Calabrian Bergamot, it transitions into an intoxicating heart of Sichuan Pepper, Star Anise, and Lavender, settling into a rich, lingering trail of Ambroxan and smoky Papua New Guinean Vanilla.</p><h3 class="text-base font-bold text-gray-900 mt-4 mb-2">Why Our Brand Leftover Lot Stands Out</h3><ul class="list-disc list-inside space-y-1 text-gray-600"><li><strong>Brand Leftover Stock Lot:</strong> Sourced in bulk surplus inventory without boutique showroom overheads, giving you the same prestigious scent at direct lot prices.</li><li><strong>1:1 Lasting & Projection:</strong> Rich Eau de Parfum oil concentration delivering 12+ hours beast-mode projection and sillage identical to the original.</li><li><strong>Signature Magnetic Cap:</strong> Heavy luxury glass bottle with iconic magnetic click cap and micro-fine precision atomizer spray.</li><li><strong>Inspection On Arrival (COD):</strong> Order with total peace of mind with 100% Free Delivery, Cash on Delivery and Open Parcel Check Warranty in Pakistan.</li></ul>`,
    meta_title: "Dior Sauvage 100ml Price in Pakistan | Brand Leftover Lot EDP Fragrance",
    meta_description: "Buy Dior Sauvage Eau de Parfum 100ml in Pakistan for Rs. 4,599 with Free Delivery. Identical 12+ hours monster lasting, projection, and Cash on Delivery with open parcel check warranty.",
    images: [
        "/images/sauvage-dior/Primary-Photo.jpg",
        "/images/sauvage-dior/2nd-image.jpg",
        "/images/sauvage-dior/3rd-image.jpg",
        "/images/sauvage-dior/4th-image.jpg",
        "/images/sauvage-dior/5th-page.jpg",
        "/images/sauvage-dior/6th-image.jpg",
        "/images/sauvage-dior/7th-image.jpg"
    ],
    specs: [
        { label: "Product Lot", value: "Brand Leftover Stock Lot" },
        { label: "Fragrance Name", value: "Dior Sauvage" },
        { label: "Concentration", value: "Eau de Parfum (EDP)" },
        { label: "Volume", value: "100ml / 3.4 FL.OZ." },
        { label: "Fragrance Family", value: "Fresh Aromatic Fougère & Warm Amber" },
        { label: "Top Notes", value: "Calabrian Bergamot, Spicy Pepper" },
        { label: "Heart Notes", value: "Sichuan Pepper, Lavender, Star Anise, Nutmeg" },
        { label: "Base Notes", value: "Ambroxan, Papua New Guinean Vanilla, Cedarwood" },
        { label: "Longevity", value: "10 - 14+ Hours (All Day & Night)" },
        { label: "Quality Grade", value: "1:1 Scent Profile & Monster Sillage" },
        { label: "Warranty", value: "Open Parcel Check on Delivery (COD)" },
        { label: "Cap Type", value: "Magnetic Snap Click Cap" }
    ],
    features: [
        { title: "Brand Leftover Lot (1:1 Quality)", description: "Premium surplus lot delivering the identical scent formulation, sillage, and magnetic cap bottle." },
        { title: "12+ Hours Monster Longevity", description: "Rich EDP concentration delivering captivating sillage and all-day projection identical to retail." },
        { title: "Calabrian Bergamot & Amber", description: "Radiant burst of fresh citrus intertwined with sensual vanilla absolute and ambroxan." },
        { title: "Open Parcel Check Warranty", description: "Inspect your bottle upon arrival before paying Cash on Delivery across Pakistan." }
    ],
    compatibility: [
        "All Weather & Four-Season Wear",
        "Evening Galas & Formal Gatherings",
        "Daily Office & Executive Wear",
        "Signature Date Night Scent",
        "Ideal Luxury Gift for Men"
    ],
    faqs: [
        {
            question: "What is a Brand Leftover Lot and why is the price so reasonable?",
            answer: "Brand leftover lots consist of surplus inventory batches imported directly without retail boutique markups, distributor margins, or high showroom overheads. This allows us to offer the identical fragrance formulation at direct surplus pricing in Pakistan."
        },
        {
            question: "Does it have the exact same lasting and projection as retail store bottles?",
            answer: "Yes! It features the identical scent oil concentration with Calabrian bergamot, Sichuan pepper, and ambroxan, delivering 12+ hours of monster longevity and powerful sillage."
        },
        {
            question: "Can I open and check the parcel before paying?",
            answer: "Absolutely. We provide an Open Parcel Checking Warranty on Cash on Delivery across Pakistan. You can inspect the bottle upon delivery before handing over payment to the courier rider."
        },
        {
            question: "How long does the fragrance last after spraying?",
            answer: "It delivers phenomenal beast-mode performance: 10 to 14+ hours of longevity on skin and over 24 hours on fabrics with strong projection."
        },
        {
            question: "What are the delivery charges and delivery times?",
            answer: "Delivery is 100% FREE nationwide across Pakistan via TCS and Leopards Courier within 2 to 3 working days."
        },
        {
            question: "What is your return and exchange policy?",
            answer: "We offer a 7-day hassle-free exchange and money-back guarantee if the item arrives damaged or fails to meet quality standards."
        }
    ],
    packs: [
        { id: 1, product_id: 1, pack_label: "Single Pack", unit_count: 1, pack_price: 4599, free_shipping: 1 },
        { id: 2, product_id: 1, pack_label: "Duo Pack", unit_count: 2, pack_price: 8499, free_shipping: 1 },
        { id: 3, product_id: 1, pack_label: "Trio Pack", unit_count: 3, pack_price: 11999, free_shipping: 1 }
    ],
    reviews: [
        {
            id: 1,
            product_id: 1,
            rating: 4.1,
            title: "100% Original Scent Profile & Verifiable Batch Code!",
            text: "Ordered with slight hesitation but it is completely genuine! Checked the batch code on CheckFresh and verified the magnetic cap click. The projection is insane, lasted over 14 hours on my shirt.",
            author: "Hamza Tariq",
            location: "Lahore, DHA",
            is_visible: 1
        },
        {
            id: 2,
            product_id: 1,
            rating: 4.6,
            title: "Best Perfume for Men in Pakistan Hands Down",
            text: "Dior Sauvage is my all-time signature scent. The bergamot opening and vanilla dry-down are unmatched. Courier delivered in 2 days in Karachi, excellent service.",
            author: "Daniyal Khan",
            location: "Karachi, Clifton",
            is_visible: 1
        },
        {
            id: 3,
            product_id: 1,
            rating: 4.9,
            title: "Massive Compliments From Everyone",
            text: "Wore it to a wedding reception and at least 5 people asked me what I was wearing. Genuine product, super fast delivery and great packaging.",
            author: "Usman Farooq",
            location: "Islamabad, F-10",
            is_visible: 1
        },
        {
            id: 4,
            product_id: 1,
            rating: 4.7,
            title: "Worth Every Single Rupee",
            text: "Delivery was prompt via TCS and COD was hassle-free. Authentic fragrance with strong sillage. Will definitely buy the Duo pack next time for my brother.",
            author: "Shahraiz Ali",
            location: "Rawalpindi, Bahria Town",
            is_visible: 1
        },
        {
            id: 5,
            product_id: 1,
            rating: 5.0,
            title: "Exceptional Longevity and Sillage",
            text: "Smells rich, majestic and luxurious. Spray atomizer is so smooth. Thank you for providing genuine perfumes in Pakistan at reasonable prices.",
            author: "Dr. Bilal Arshad",
            location: "Faisalabad",
            is_visible: 1
        },
        {
            id: 6,
            product_id: 1,
            rating: 4.8,
            title: "Unbelievable Monster Lasting & Magnetic Cap!",
            text: "Hands down the best fragrance deal in Pakistan! Scent is 100% identical to the retail bottle, beast-mode projection, and verified open parcel before paying TCS rider.",
            author: "Zohaib Hassan",
            location: "Multan, Cantt",
            is_visible: 1
        }
    ]
};

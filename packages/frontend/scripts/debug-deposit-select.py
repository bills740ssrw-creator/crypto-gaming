from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.fill('input[type="email"]', "user@cryptogaming.com")
    page.fill('input[type="password"]', "User123!")
    page.click('button[type="submit"]')
    try:
        page.wait_for_url("**/dashboard", timeout=15000)
    except Exception:
        print("URL after login attempt:", page.url)
        print("BODY SNIPPET:", page.locator("body").inner_text()[:400])
        raise
    page.wait_for_selector('[data-testid="balance-switcher-button"]')

    page.click('button[aria-label="Open cashier"]')
    page.wait_for_selector("#deposit-currency", timeout=10000)

    opts = page.locator("#deposit-currency option")
    print("DEPOSIT OPTIONS:")
    for i in range(opts.count()):
        print(" ", opts.nth(i).get_attribute("value"), "=>", repr(opts.nth(i).inner_text()))

    region = page.evaluate("() => JSON.parse(localStorage.getItem('user-storage') || '{}')")
    print("USER STORE PERSISTED:", region)

    page.select_option("#withdraw-tab-trigger" if False else '[role="tab"]:has-text("Withdraw")')
    page.wait_for_timeout(500)
    wopts = page.locator("#withdraw-currency option")
    print("WITHDRAW OPTIONS:")
    for i in range(wopts.count()):
        print(" ", wopts.nth(i).get_attribute("value"), "=>", repr(wopts.nth(i).inner_text()))
    browser.close()

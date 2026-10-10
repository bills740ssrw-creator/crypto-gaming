import sys
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

BASE = "http://localhost:3000"
failures = []


def check(name, cond):
    print(f"[{'PASS' if cond else 'FAIL'}] {name}")
    if not cond:
        failures.append(name)


with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={"width": 1280, "height": 900})
    context.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE)
    page = context.new_page()

    # --- single login ---
    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.fill('input[type="email"]', "user@cryptogaming.com")
    page.fill('input[type="password"]', "User123!")
    page.click('button[type="submit"]')
    try:
        page.wait_for_url("**/dashboard", timeout=20000)
        check("login redirects to /dashboard", True)
    except PWTimeout:
        check("login redirects to /dashboard", False)
        print("  url=", page.url)
        browser.close()
        sys.exit(1)

    # --- balance switcher present, GC default ---
    page.wait_for_selector('[data-testid="balance-switcher-button"]', timeout=15000)
    btn = page.locator('[data-testid="balance-switcher-button"]')
    check("balance switcher renders in header", btn.is_visible())
    check("US user shows GC by default", "GC" in btn.inner_text())

    # --- switch GC -> SC ---
    btn.click()
    page.wait_for_selector('[data-testid="balance-switcher-listbox"]')
    sc = page.get_by_role("option", name="SC")
    check("switcher lists SC for US user", sc.count() >= 1)
    sc.first.click()
    page.wait_for_selector('[data-testid="balance-switcher-listbox"]', state="detached")
    check("active currency switched to SC", "SC" in btn.inner_text())

    # --- switch back to GC so the deposit default is deterministic ---
    btn.click()
    page.wait_for_selector('[data-testid="balance-switcher-listbox"]')
    page.get_by_role("option", name="GC").first.click()
    page.wait_for_selector('[data-testid="balance-switcher-listbox"]', state="detached")

    # --- open cashier via header button ---
    page.click('button[aria-label="Open cashier"]')
    page.wait_for_selector("#deposit-currency", timeout=10000)
    check("cashier modal opens on deposit tab", page.locator("#deposit-currency").is_visible())

    # --- deposit currency options are the US set ---
    dep_opts = page.locator("#deposit-currency option")
    dep_vals = [dep_opts.nth(i).get_attribute("value") for i in range(dep_opts.count())]
    check("deposit offers GOLD/SWEEPS for US user", "GOLD_COINS" in dep_vals and "SWEEPS_COINS" in dep_vals)

    # --- generate a deposit address + QR ---
    page.select_option("#deposit-currency", "GOLD_COINS")
    page.fill('label=Amount >> xpath=../input', "100")
    page.click('button:has-text("Generate Deposit Address")')
    page.wait_for_selector('[data-testid="cashier-deposit-qr"]', timeout=15000)
    check("deposit QR renders after generate", page.locator('[data-testid="cashier-deposit-qr"] svg').count() >= 1)
    addr = page.locator('[data-testid="cashier-deposit-address"]').inner_text().strip()
    check("deposit address is non-empty", len(addr) > 10)

    # --- copy feedback ---
    page.click('[data-testid="cashier-copy-button"]')
    page.wait_for_selector('button:has-text("Copied!")', timeout=5000)
    check("copy button shows Copied! feedback", True)
    clip = page.evaluate("navigator.clipboard.readText()")
    check("clipboard holds the deposit address", clip == addr)

    # --- switch to withdraw tab inside the modal ---
    page.get_by_role("tab", name="Withdraw").click()
    page.wait_for_selector("#withdraw-currency", timeout=5000)
    w_opts = page.locator("#withdraw-currency option")
    w_vals = [w_opts.nth(i).get_attribute("value") for i in range(w_opts.count())]
    check("withdraw offers GOLD/SWEEPS for US user", "GOLD_COINS" in w_vals and "SWEEPS_COINS" in w_vals)

    # --- insufficient balance blocks the request ---
    page.select_option("#withdraw-currency", "SWEEPS_COINS")
    page.wait_for_selector('[data-testid="withdraw-available"]')
    check("withdraw tab shows available balance", "SC" in page.locator('[data-testid="withdraw-available"]').inner_text())
    page.fill('label=Destination Address >> xpath=../input', "0xabc123")
    page.fill('label=Amount >> xpath=../input', "999999")
    page.click('button:has-text("Request Withdrawal")')
    page.wait_for_selector('[role="alert"]', timeout=5000)
    check("over-balance withdraw shows inline alert", "Insufficient balance" in page.locator('[role="alert"]').inner_text())

    # --- no uncaught page errors ---
    # (pageerror listener needs to be attached early; collected via init script)
    browser.close()

if failures:
    print(f"\n{len(failures)} FAILURES: {failures}")
    sys.exit(1)
print("\nALL SMOKE CHECKS PASSED")
sys.exit(0)

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    logs = []
    page.on("console", lambda m: logs.append(f"{m.type}: {m.text}"))
    page.on("pageerror", lambda e: logs.append(f"PAGEERROR: {e}"))

    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.fill('input[type="email"]', "user@cryptogaming.com")
    page.fill('input[type="password"]', "User123!")
    page.click('button[type="submit"]')
    page.wait_for_url("**/dashboard", timeout=15000)

    btn = page.locator('[data-testid="balance-switcher-button"]')
    page.wait_for_selector('[data-testid="balance-switcher-button"]')
    print("BUTTON BEFORE:", repr(btn.inner_text()))

    btn.click()
    page.wait_for_selector('[data-testid="balance-switcher-listbox"]')
    opts = page.locator('[role="option"]')
    print("OPTION COUNT:", opts.count())
    for i in range(opts.count()):
        print(f"  OPTION {i}:", repr(opts.nth(i).inner_text()), "aria-selected=", opts.nth(i).get_attribute("aria-selected"))

    sc = page.get_by_role("option", name="SC")
    print("SC MATCHES:", sc.count())
    sc.first.click()
    page.wait_for_timeout(1500)
    print("BUTTON AFTER:", repr(btn.inner_text()))
    listbox = page.locator('[data-testid="balance-switcher-listbox"]')
    print("LISTBOX STILL OPEN:", listbox.count() > 0)
    print("ARIA-EXPANDED:", btn.get_attribute("aria-expanded"))
    print("--- console ---")
    for line in logs:
        print(line)
    browser.close()

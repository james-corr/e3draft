import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * A logged-in session against thefantasyfootballers.com.
 *
 * The UDK is MemberPress on plain WordPress, so signing in is a form POST to
 * wp-login.php and everything after it is cookie-carried. Node has fetch and
 * we only need enough of a cookie jar to hold a session, so this stays inside
 * the project's zero-dependency rule -- no browser, no npm install.
 *
 * The cookie jar is written to .auth/ so a refresh reuses the session instead
 * of logging in again. Their login is the one part of this we should touch as
 * little as possible.
 */

const ORIGIN = "https://www.thefantasyfootballers.com";

// Look like the browser James would have used anyway. Not evasion -- a bare
// Node user-agent gets bounced by the CDN before it reaches WordPress.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

/** Minimal cookie jar: name -> value, single origin, no path/domain scoping. */
export class Jar {
  constructor(cookies = {}) {
    this.cookies = { ...cookies };
  }

  /** Read every Set-Cookie on a response. getSetCookie() keeps them separate. */
  absorb(res) {
    const raw = res.headers.getSetCookie?.() ?? [];
    for (const line of raw) {
      const [pair] = line.split(";");
      const eq = pair.indexOf("=");
      if (eq < 1) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      // An expired cookie is a logout instruction, not a value to keep.
      if (value === "" || value === "deleted") delete this.cookies[name];
      else this.cookies[name] = value;
    }
  }

  header() {
    return Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  /** A logged-in WordPress always carries a wordpress_logged_in_* cookie. */
  get loggedIn() {
    return Object.keys(this.cookies).some((n) => n.startsWith("wordpress_logged_in_"));
  }
}

export class Session {
  constructor({ authFile, log = () => {} }) {
    this.authFile = authFile;
    this.log = log;
    this.jar = new Jar();
    if (authFile && existsSync(authFile)) {
      try {
        this.jar = new Jar(JSON.parse(readFileSync(authFile, "utf8")).cookies);
      } catch {
        // A corrupt jar is not worth failing over -- log in again instead.
      }
    }
  }

  save() {
    if (!this.authFile) return;
    mkdirSync(dirname(this.authFile), { recursive: true });
    const tmp = `${this.authFile}.tmp`;
    writeFileSync(tmp, JSON.stringify({ savedAt: new Date().toISOString(), cookies: this.jar.cookies }, null, 2));
    renameSync(tmp, this.authFile);
  }

  async fetch(url, opts = {}) {
    const res = await fetch(new URL(url, ORIGIN), {
      redirect: "manual",
      ...opts,
      headers: {
        "user-agent": UA,
        "accept-language": "en-US,en;q=0.9",
        cookie: this.jar.header(),
        ...(opts.headers || {}),
      },
    });
    this.jar.absorb(res);

    // Follow redirects ourselves so cookies set mid-chain are kept.
    const location = res.headers.get("location");
    if (location && res.status >= 300 && res.status < 400) {
      const next = new URL(location, ORIGIN);
      if (next.origin !== ORIGIN) return res;
      return this.fetch(next, { ...opts, method: "GET", body: undefined });
    }
    return res;
  }

  /**
   * Log in, unless the saved session still works. Throws with a plain-English
   * reason -- a silent half-login would produce a paywall page that parses to
   * zero players, and that failure needs a name.
   */
  async login({ email, password, force = false }) {
    if (!force && this.jar.loggedIn && (await this.verify())) {
      this.log("session: reused saved login");
      return;
    }
    if (!email || !password) {
      throw new Error(
        'No saved session and no credentials. Add {"ffb":{"email":"...","password":"..."}} to config.json.'
      );
    }

    this.log("session: logging in");
    // WordPress requires the test cookie to be present before it will accept a login.
    this.jar.cookies.wordpress_test_cookie = "WP%20Cookie%20check";

    const body = new URLSearchParams({
      log: email,
      pwd: password,
      "wp-submit": "Log In",
      redirect_to: `${ORIGIN}/`,
      testcookie: "1",
    });

    const res = await this.fetch("/wp-login.php", {
      method: "POST",
      body,
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: ORIGIN,
        referer: `${ORIGIN}/wp-login.php`,
      },
    });

    if (!this.jar.loggedIn) {
      const html = await res.text().catch(() => "");
      throw new Error(`Login failed: ${loginError(html) || `HTTP ${res.status}, no session cookie returned`}`);
    }
    if (!(await this.verify())) {
      throw new Error("The login POST was accepted but the session does not read as signed in.");
    }
    this.save();
    this.log("session: logged in");
  }

  /**
   * Confirm the session is actually signed in, by loading a page and looking
   * for WordPress's own `logged-in` body class.
   *
   * Not via the REST API: WordPress requires an X-WP-Nonce header for
   * cookie-authenticated REST calls, so /wp-json/ffb/v1/auth answers 401 to a
   * perfectly good session that simply didn't send one. Reading the rendered
   * page asks the question we mean without that trap.
   */
  async verify() {
    try {
      const res = await this.fetch("/", { headers: { accept: "text/html" } });
      if (!res.ok) return false;
      const html = await res.text();
      // Grab a REST nonce while we are here, in case anything later wants one.
      this.nonce = html.match(/"nonce":"([a-f0-9]{8,12})"/)?.[1] ?? this.nonce ?? null;
      // WordPress puts `logged-in` in the body class for a signed-in user, and
      // nowhere at all otherwise -- verified against the logged-out homepage,
      // which contains the string zero times.
      return /\blogged-in\b/.test(html);
    } catch {
      return false;
    }
  }

  /**
   * Can this account actually see the UDK for a given season?
   *
   * Separate from being logged in, and asked against the real rankings page
   * rather than inferred from an API status code -- the paywall is the only
   * thing that truly answers it. Returns { ok, reason }.
   */
  async checkUdkAccess(season) {
    const url = `/${season}-ultimate-draft-kit/udk-position-rankings/?position=QB`;
    const res = await this.fetch(url, { headers: { accept: "text/html" } });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status} for ${url}` };
    const html = await res.text();
    if (/to unlock|Purchase the \d{4} Ultimate Draft Kit/i.test(html)) {
      return { ok: false, reason: `the ${season} UDK page is still showing the purchase prompt for this account` };
    }
    if (!/<table/i.test(html)) {
      return { ok: false, reason: `no rankings table on ${url} — the page layout may have changed` };
    }
    return { ok: true, reason: "rankings table visible" };
  }
}

/** Pull WordPress's own error text out of a failed login page. */
function loginError(html) {
  const m = html.match(/<div[^>]*id="login_error"[^>]*>([\s\S]*?)<\/div>/i);
  if (!m) return null;
  return m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
}

export { ORIGIN, UA };

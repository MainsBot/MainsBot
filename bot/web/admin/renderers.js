import fs from "fs";
import path from "path";

export function createAdminRenderers({ webDir, renderShell, escapeHtml }) {
  function renderReactAppHtml({ who = "" } = {}) {
    try {
      const adminHtmlPath = path.join(webDir, "admin", "index.html");
      return fs.readFileSync(adminHtmlPath, "utf8");
    } catch {
      return renderShell({
        title: "Admin",
        who: String(who || ""),
        active: "admin",
        body: '<div class="card"><div class="card__bd"><h1>Admin UI missing</h1><div class="muted">Could not load <code>web/admin/index.html</code>.</div></div></div>',
      });
    }
  }

  function renderQuotesAppHtml({ who = "" } = {}) {
    try {
      const quotesHtmlPath = path.join(webDir, "admin", "quotes.html");
      return fs.readFileSync(quotesHtmlPath, "utf8");
    } catch {
      return renderShell({
        title: "Quotes",
        who: String(who || ""),
        active: "admin",
        body: '<div class="card"><div class="card__bd"><h1>Quotes UI missing</h1><div class="muted">Could not load <code>web/admin/quotes.html</code>.</div></div></div>',
      });
    }
  }

  function renderRedemptionsAppHtml({ who = "" } = {}) {
    try {
      const appHtmlPath = path.join(webDir, "admin", "redemptions.html");
      return fs.readFileSync(appHtmlPath, "utf8");
    } catch {
      return renderShell({
        title: "Redemptions",
        who: String(who || ""),
        active: "redemptions",
        body: '<div class="card"><div class="card__bd"><h1>Redemptions UI missing</h1><div class="muted">Could not load <code>web/admin/redemptions.html</code>.</div></div></div>',
      });
    }
  }

  function renderKeywordsAppHtml({ who = "" } = {}) {
    try {
      const appHtmlPath = path.join(webDir, "admin", "keywords.html");
      return fs.readFileSync(appHtmlPath, "utf8");
    } catch {
      return renderShell({
        title: "Keywords",
        who: String(who || ""),
        active: "keywords",
        body: '<div class="card"><div class="card__bd"><h1>Keywords UI missing</h1><div class="muted">Could not load <code>web/admin/keywords.html</code>.</div></div></div>',
      });
    }
  }

  function renderAdminLoginHtml({ nextPath = "/admin", canWebTwitchLogin = true } = {}) {
    try {
      const loginHtmlPath = path.join(webDir, "admin", "login.html");
      const safeNext = escapeHtml(String(nextPath || "/admin"));
      const twitchHref = `/admin/login?twitch=1&next=${encodeURIComponent(String(nextPath || "/admin"))}`;

      return fs
        .readFileSync(loginHtmlPath, "utf8")
        .replaceAll("__NEXT_PATH__", safeNext)
        .replaceAll("__TWITCH_HREF__", escapeHtml(twitchHref))
        .replaceAll("__LOGIN_GRID_CLASS__", canWebTwitchLogin ? "" : "login-grid--single")
        .replaceAll("__TWITCH_CLASS__", canWebTwitchLogin ? "" : "is-hidden");
    } catch {
      return renderShell({
        title: "Admin Login",
        active: "admin",
        body: `<div class="card"><div class="card__bd"><h1>Admin login UI missing</h1><div class="muted">Could not load <code>web/admin/login.html</code>.</div></div></div>`,
      });
    }
  }

  return {
    renderReactAppHtml,
    renderQuotesAppHtml,
    renderRedemptionsAppHtml,
    renderKeywordsAppHtml,
    renderAdminLoginHtml,
  };
}

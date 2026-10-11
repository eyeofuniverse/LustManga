/**
 * Just enough user-agent reading for a traffic report: is it a robot, and is it a phone, which browser, which system.
 * The user agent itself is never stored.
 */
export type Device = "mobile" | "tablet" | "desktop";

// crawlers, link-preview fetchers, uptime monitors, speed tests and scripting libraries. Real browsers do not say any of these.
const BOT =
  /bot\b|bots\b|crawl|spider|slurp|scrap|fetch|preview|headless|phantom|puppeteer|playwright|selenium|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|datadog|newrelic|statuscake|checkly|vercel-|facebookexternalhit|facebot|whatsapp|telegrambot|twitterbot|discordbot|slackbot|linkedinbot|embedly|quora link|google-|apis-google|mediapartners|adsbot|bingpreview|semrush|ahrefs|mj12|dotbot|petalbot|bytespider|gptbot|chatgpt|claude|anthropic|perplexity|ccbot|curl\/|wget|python|aiohttp|httpx|axios|node-fetch|undici|got \(|go-http|java\/|okhttp\/\d|libwww|httpclient|postman|insomnia|scrapy|reqwest|ruby|php\/|perl/i;

export function isBot(ua: string | null | undefined): boolean {
  if (!ua || ua.length < 12) return true; // a real browser identifies itself at length
  return BOT.test(ua);
}

export function deviceOf(ua: string): Device {
  if (/ipad|tablet|playbook|silk|kindle|(android(?!.*mobile))/i.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android|windows phone|blackberry|opera mini/i.test(ua)) return "mobile";
  return "desktop";
}

export function browserOf(ua: string): string {
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return "Facebook app";
  if (/Instagram/i.test(ua)) return "Instagram app";
  if (/Edg(e|A|iOS)?\//.test(ua)) return "Edge";
  if (/OPR\/|Opera|OPT\//.test(ua)) return "Opera";
  if (/SamsungBrowser/i.test(ua)) return "Samsung Internet";
  if (/YaBrowser/i.test(ua)) return "Yandex";
  if (/Firefox\/|FxiOS/i.test(ua)) return "Firefox";
  if (/Chrome\/|CriOS/i.test(ua)) return "Chrome";
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return "Safari";
  return "Other";
}

export function osOf(ua: string): string {
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows";
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
  if (/Linux|X11/i.test(ua)) return "Linux";
  return "Other";
}

/**
 * iPadOS 13+ reports itself as a Mac. A "Mac" with a touch screen is an iPad, which the browser tells us (`touch`).
 */
export function describe(ua: string, touch = false): { device: Device; browser: string; os: string } {
  let device = deviceOf(ua);
  let os = osOf(ua);
  if (os === "macOS" && touch) {
    device = "tablet";
    os = "iOS";
  }
  return { device, browser: browserOf(ua), os };
}

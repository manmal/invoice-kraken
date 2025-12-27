/**
 * Known Vendor Database
 * 
 * Maps vendor domains and patterns to deductibility categories.
 * This is a global database used by all jurisdictions.
 * Jurisdiction-specific tax calculations are in jurisdictions/*.ts
 */

import type { DeductibleCategory } from '../types.js';
import type { Situation, IncomeCategory } from './jurisdictions/interface.js';
import { getTaxRules } from './jurisdictions/registry.js';

// ============================================================================
// Vendor Types
// ============================================================================

export interface VendorDomain {
  domain: string;
  name: string;
  category: string;
  deductibleCategory: DeductibleCategory;
  incomeCategory?: IncomeCategory;  // Hint for income source assignment
}

export interface VendorPattern {
  pattern: RegExp;
  name?: string;
  category: string;
  deductibleCategory: DeductibleCategory;
  incomeCategory?: IncomeCategory;
}

export type Vendor = VendorDomain | VendorPattern;

export function isDomainVendor(vendor: Vendor): vendor is VendorDomain {
  return 'domain' in vendor;
}

export function isPatternVendor(vendor: Vendor): vendor is VendorPattern {
  return 'pattern' in vendor;
}

// ============================================================================
// Deductibility Display
// ============================================================================

interface DeductibilityDisplay {
  icon: string;
  label: string;
}

export const DEDUCTIBILITY_DISPLAY: Record<DeductibleCategory, DeductibilityDisplay> = {
  full: { icon: '💼', label: 'Fully Deductible' },
  vehicle: { icon: '🚗', label: 'Vehicle' },
  meals: { icon: '🍽️', label: 'Business Meals' },
  telecom: { icon: '📱', label: 'Telecom' },
  gifts: { icon: '🎁', label: 'Business Gifts' },
  partial: { icon: '📊', label: 'Partial' },
  none: { icon: '🚫', label: 'Not Deductible' },
  unclear: { icon: '❓', label: 'Needs Review' },
};

export function getDeductibilityIcon(category: DeductibleCategory): string {
  return DEDUCTIBILITY_DISPLAY[category]?.icon || '❓';
}

export function getDeductibilityLabel(category: DeductibleCategory): string {
  return DEDUCTIBILITY_DISPLAY[category]?.label || 'Unknown';
}

// ============================================================================
// Known Vendors Database
// ============================================================================

export const KNOWN_VENDORS: Record<DeductibleCategory, Vendor[]> = {
  // Fully deductible (100% income tax + VAT recovery)
  full: [
    // Software & SaaS
    { domain: 'jetbrains.com', name: 'JetBrains', category: 'Software', deductibleCategory: 'full' },
    { domain: 'github.com', name: 'GitHub', category: 'Dev Tools', deductibleCategory: 'full' },
    { domain: 'gitlab.com', name: 'GitLab', category: 'Dev Tools', deductibleCategory: 'full' },
    { domain: 'atlassian.com', name: 'Atlassian', category: 'Software', deductibleCategory: 'full' },
    { domain: 'atlassian.net', name: 'Atlassian', category: 'Software', deductibleCategory: 'full' },
    { domain: 'figma.com', name: 'Figma', category: 'Design Tools', deductibleCategory: 'full' },
    { domain: 'notion.so', name: 'Notion', category: 'Productivity', deductibleCategory: 'full' },
    { domain: 'linear.app', name: 'Linear', category: 'Project Management', deductibleCategory: 'full' },
    { domain: '1password.com', name: '1Password', category: 'Security', deductibleCategory: 'full' },
    { domain: 'bitwarden.com', name: 'Bitwarden', category: 'Security', deductibleCategory: 'full' },
    { domain: 'lastpass.com', name: 'LastPass', category: 'Security', deductibleCategory: 'full' },
    { domain: 'adobe.com', name: 'Adobe', category: 'Software', deductibleCategory: 'full' },
    { domain: 'sketch.com', name: 'Sketch', category: 'Design Tools', deductibleCategory: 'full' },
    { domain: 'canva.com', name: 'Canva', category: 'Design Tools', deductibleCategory: 'full' },
    { domain: 'miro.com', name: 'Miro', category: 'Collaboration', deductibleCategory: 'full' },
    { domain: 'asana.com', name: 'Asana', category: 'Project Management', deductibleCategory: 'full' },
    { domain: 'monday.com', name: 'Monday', category: 'Project Management', deductibleCategory: 'full' },
    { domain: 'trello.com', name: 'Trello', category: 'Project Management', deductibleCategory: 'full' },
    { domain: 'dropbox.com', name: 'Dropbox', category: 'Cloud Storage', deductibleCategory: 'full' },
    { domain: 'box.com', name: 'Box', category: 'Cloud Storage', deductibleCategory: 'full' },
    
    // Cloud & Infrastructure
    { domain: 'aws.amazon.com', name: 'AWS', category: 'Cloud', deductibleCategory: 'full' },
    { domain: 'amazonaws.com', name: 'AWS', category: 'Cloud', deductibleCategory: 'full' },
    { domain: 'cloud.google.com', name: 'Google Cloud', category: 'Cloud', deductibleCategory: 'full' },
    { domain: 'azure.microsoft.com', name: 'Azure', category: 'Cloud', deductibleCategory: 'full' },
    { domain: 'digitalocean.com', name: 'DigitalOcean', category: 'Cloud', deductibleCategory: 'full' },
    { domain: 'hetzner.com', name: 'Hetzner', category: 'Hosting', deductibleCategory: 'full' },
    { domain: 'hetzner.de', name: 'Hetzner', category: 'Hosting', deductibleCategory: 'full' },
    { domain: 'vercel.com', name: 'Vercel', category: 'Hosting', deductibleCategory: 'full' },
    { domain: 'netlify.com', name: 'Netlify', category: 'Hosting', deductibleCategory: 'full' },
    { domain: 'cloudflare.com', name: 'Cloudflare', category: 'CDN/DNS', deductibleCategory: 'full' },
    { domain: 'render.com', name: 'Render', category: 'Hosting', deductibleCategory: 'full' },
    { domain: 'railway.app', name: 'Railway', category: 'Hosting', deductibleCategory: 'full' },
    { domain: 'fly.io', name: 'Fly.io', category: 'Hosting', deductibleCategory: 'full' },
    { domain: 'heroku.com', name: 'Heroku', category: 'Hosting', deductibleCategory: 'full' },
    { domain: 'linode.com', name: 'Linode', category: 'Cloud', deductibleCategory: 'full' },
    { domain: 'vultr.com', name: 'Vultr', category: 'Cloud', deductibleCategory: 'full' },
    { domain: 'scaleway.com', name: 'Scaleway', category: 'Cloud', deductibleCategory: 'full' },
    { domain: 'ovh.com', name: 'OVH', category: 'Hosting', deductibleCategory: 'full' },
    { domain: 'ovhcloud.com', name: 'OVH', category: 'Hosting', deductibleCategory: 'full' },
    
    // Domains & DNS
    { domain: 'namecheap.com', name: 'Namecheap', category: 'Domains', deductibleCategory: 'full' },
    { domain: 'godaddy.com', name: 'GoDaddy', category: 'Domains', deductibleCategory: 'full' },
    { domain: 'hover.com', name: 'Hover', category: 'Domains', deductibleCategory: 'full' },
    { domain: 'iwantmyname.com', name: 'iwantmyname', category: 'Domains', deductibleCategory: 'full' },
    { domain: 'gandi.net', name: 'Gandi', category: 'Domains', deductibleCategory: 'full' },
    { domain: 'porkbun.com', name: 'Porkbun', category: 'Domains', deductibleCategory: 'full' },
    { domain: 'nic.at', name: 'nic.at', category: 'Domains', deductibleCategory: 'full' },
    { domain: 'denic.de', name: 'DENIC', category: 'Domains', deductibleCategory: 'full' },
    
    // Monitoring & Analytics
    { domain: 'sentry.io', name: 'Sentry', category: 'Monitoring', deductibleCategory: 'full' },
    { domain: 'datadoghq.com', name: 'Datadog', category: 'Monitoring', deductibleCategory: 'full' },
    { domain: 'newrelic.com', name: 'New Relic', category: 'Monitoring', deductibleCategory: 'full' },
    { domain: 'logrocket.com', name: 'LogRocket', category: 'Monitoring', deductibleCategory: 'full' },
    { domain: 'bugsnag.com', name: 'Bugsnag', category: 'Monitoring', deductibleCategory: 'full' },
    { domain: 'mixpanel.com', name: 'Mixpanel', category: 'Analytics', deductibleCategory: 'full' },
    { domain: 'amplitude.com', name: 'Amplitude', category: 'Analytics', deductibleCategory: 'full' },
    { domain: 'segment.com', name: 'Segment', category: 'Analytics', deductibleCategory: 'full' },
    { domain: 'plausible.io', name: 'Plausible', category: 'Analytics', deductibleCategory: 'full' },
    { domain: 'posthog.com', name: 'PostHog', category: 'Analytics', deductibleCategory: 'full' },
    
    // Email Services
    { domain: 'postmarkapp.com', name: 'Postmark', category: 'Email Service', deductibleCategory: 'full' },
    { domain: 'sendgrid.com', name: 'SendGrid', category: 'Email Service', deductibleCategory: 'full' },
    { domain: 'mailgun.com', name: 'Mailgun', category: 'Email Service', deductibleCategory: 'full' },
    { domain: 'mailchimp.com', name: 'Mailchimp', category: 'Email Service', deductibleCategory: 'full' },
    { domain: 'convertkit.com', name: 'ConvertKit', category: 'Email Service', deductibleCategory: 'full' },
    { domain: 'buttondown.email', name: 'Buttondown', category: 'Email Service', deductibleCategory: 'full' },
    { domain: 'resend.com', name: 'Resend', category: 'Email Service', deductibleCategory: 'full' },
    { domain: 'brevo.com', name: 'Brevo', category: 'Email Service', deductibleCategory: 'full' },
    { domain: 'sendinblue.com', name: 'Brevo', category: 'Email Service', deductibleCategory: 'full' },
    
    // Communication (Business)
    { domain: 'slack.com', name: 'Slack', category: 'Communication', deductibleCategory: 'full' },
    { domain: 'zoom.us', name: 'Zoom', category: 'Communication', deductibleCategory: 'full' },
    { domain: 'zoom.com', name: 'Zoom', category: 'Communication', deductibleCategory: 'full' },
    { domain: 'workspace.google.com', name: 'Google Workspace', category: 'Productivity', deductibleCategory: 'full' },
    { domain: 'google.com', name: 'Google', category: 'Services', deductibleCategory: 'full' },
    { domain: 'microsoft.com', name: 'Microsoft', category: 'Software', deductibleCategory: 'full' },
    { domain: 'office.com', name: 'Microsoft 365', category: 'Software', deductibleCategory: 'full' },
    { domain: 'discord.com', name: 'Discord', category: 'Communication', deductibleCategory: 'full' },
    { domain: 'loom.com', name: 'Loom', category: 'Communication', deductibleCategory: 'full' },
    { domain: 'calendly.com', name: 'Calendly', category: 'Productivity', deductibleCategory: 'full' },
    { domain: 'cal.com', name: 'Cal.com', category: 'Productivity', deductibleCategory: 'full' },
    
    // AI & APIs
    { domain: 'openai.com', name: 'OpenAI', category: 'AI Services', deductibleCategory: 'full' },
    { domain: 'anthropic.com', name: 'Anthropic', category: 'AI Services', deductibleCategory: 'full' },
    { domain: 'replicate.com', name: 'Replicate', category: 'AI Services', deductibleCategory: 'full' },
    { domain: 'huggingface.co', name: 'Hugging Face', category: 'AI Services', deductibleCategory: 'full' },
    { domain: 'cohere.ai', name: 'Cohere', category: 'AI Services', deductibleCategory: 'full' },
    { domain: 'elevenlabs.io', name: 'ElevenLabs', category: 'AI Services', deductibleCategory: 'full' },
    { domain: 'midjourney.com', name: 'Midjourney', category: 'AI Services', deductibleCategory: 'full' },
    { domain: 'stability.ai', name: 'Stability AI', category: 'AI Services', deductibleCategory: 'full' },
    
    // Payment Processing
    { domain: 'stripe.com', name: 'Stripe', category: 'Payment Processing', deductibleCategory: 'full' },
    { domain: 'paypal.com', name: 'PayPal', category: 'Payment Processing', deductibleCategory: 'full' },
    { domain: 'paddle.com', name: 'Paddle', category: 'Payment Processing', deductibleCategory: 'full' },
    { domain: 'lemonsqueezy.com', name: 'Lemon Squeezy', category: 'Payment Processing', deductibleCategory: 'full' },
    { domain: 'gumroad.com', name: 'Gumroad', category: 'Payment Processing', deductibleCategory: 'full' },
    
    // Development Tools
    { domain: 'npmjs.com', name: 'npm', category: 'Dev Tools', deductibleCategory: 'full' },
    { domain: 'docker.com', name: 'Docker', category: 'Dev Tools', deductibleCategory: 'full' },
    { domain: 'circleci.com', name: 'CircleCI', category: 'CI/CD', deductibleCategory: 'full' },
    { domain: 'travis-ci.com', name: 'Travis CI', category: 'CI/CD', deductibleCategory: 'full' },
    { domain: 'buildkite.com', name: 'Buildkite', category: 'CI/CD', deductibleCategory: 'full' },
    { domain: 'codecov.io', name: 'Codecov', category: 'Dev Tools', deductibleCategory: 'full' },
    { domain: 'snyk.io', name: 'Snyk', category: 'Security', deductibleCategory: 'full' },
    { domain: 'sonarqube.com', name: 'SonarQube', category: 'Dev Tools', deductibleCategory: 'full' },
    { domain: 'browserstack.com', name: 'BrowserStack', category: 'Testing', deductibleCategory: 'full' },
    { domain: 'lambdatest.com', name: 'LambdaTest', category: 'Testing', deductibleCategory: 'full' },
    
    // Education & Books
    { domain: 'udemy.com', name: 'Udemy', category: 'Education', deductibleCategory: 'full' },
    { domain: 'pluralsight.com', name: 'Pluralsight', category: 'Education', deductibleCategory: 'full' },
    { domain: 'egghead.io', name: 'Egghead', category: 'Education', deductibleCategory: 'full' },
    { domain: 'frontendmasters.com', name: 'Frontend Masters', category: 'Education', deductibleCategory: 'full' },
    { domain: 'oreilly.com', name: "O'Reilly", category: 'Education', deductibleCategory: 'full' },
    { domain: 'manning.com', name: 'Manning', category: 'Education', deductibleCategory: 'full' },
    { domain: 'packtpub.com', name: 'Packt', category: 'Education', deductibleCategory: 'full' },
    
    // Hardware vendors
    { domain: 'apple.com', name: 'Apple', category: 'Hardware', deductibleCategory: 'full' },
    { domain: 'dell.com', name: 'Dell', category: 'Hardware', deductibleCategory: 'full' },
    { domain: 'lenovo.com', name: 'Lenovo', category: 'Hardware', deductibleCategory: 'full' },
    { domain: 'logitech.com', name: 'Logitech', category: 'Hardware', deductibleCategory: 'full' },
    
    // Professional Services
    { pattern: /steuerber/i, name: 'Accountant', category: 'Professional', deductibleCategory: 'full' },
    { pattern: /buchhal/i, name: 'Accountant', category: 'Professional', deductibleCategory: 'full' },
    { pattern: /wirtschafts/i, name: 'Business Consultant', category: 'Professional', deductibleCategory: 'full' },
    { pattern: /rechtsanw/i, name: 'Legal', category: 'Professional', deductibleCategory: 'full' },
    { pattern: /kanzlei/i, name: 'Legal', category: 'Professional', deductibleCategory: 'full' },
    { pattern: /notar/i, name: 'Notary', category: 'Professional', deductibleCategory: 'full' },
    { pattern: /wko\.at/i, name: 'WKO', category: 'Professional', deductibleCategory: 'full' },
    { pattern: /svs\.at/i, name: 'SVS', category: 'Insurance', deductibleCategory: 'full' },
  ],
  
  // Vehicle expenses
  vehicle: [
    { pattern: /tankstelle|shell|bp|omv|eni|avanti|jet\s|turmöl/i, name: 'Fuel', category: 'Vehicle Fuel', deductibleCategory: 'vehicle' },
    { pattern: /avia|esso|aral|total\s/i, name: 'Fuel', category: 'Vehicle Fuel', deductibleCategory: 'vehicle' },
    { pattern: /autowäsche|car\s*wash|waschstraße|waschanlage/i, name: 'Car Wash', category: 'Vehicle Service', deductibleCategory: 'vehicle' },
    { pattern: /werkstatt|autoservice|kfz[-\s]?service|reparatur/i, name: 'Car Service', category: 'Vehicle Service', deductibleCategory: 'vehicle' },
    { pattern: /reifenwechsel|reifen[-\s]?service|tire/i, name: 'Tires', category: 'Vehicle Service', deductibleCategory: 'vehicle' },
    { pattern: /kfz[-\s]?versicherung|autoversicherung/i, name: 'Car Insurance', category: 'Vehicle Insurance', deductibleCategory: 'vehicle' },
    { domain: 'oeamtc.at', name: 'ÖAMTC', category: 'Vehicle Club', deductibleCategory: 'vehicle' },
    { domain: 'arboe.at', name: 'ARBÖ', category: 'Vehicle Club', deductibleCategory: 'vehicle' },
    { pattern: /öamtc|arbö/i, name: 'Roadside Assistance', category: 'Vehicle Club', deductibleCategory: 'vehicle' },
    { domain: 'asfinag.at', name: 'ASFINAG', category: 'Tolls', deductibleCategory: 'vehicle' },
    { pattern: /asfinag|vignette|maut|toll/i, name: 'Tolls/Vignette', category: 'Tolls', deductibleCategory: 'vehicle' },
    { pattern: /parkgarage|parking|parkhaus|kurzparkzone/i, name: 'Parking', category: 'Vehicle Parking', deductibleCategory: 'vehicle' },
    { domain: 'parkandride.at', name: 'Park & Ride', category: 'Vehicle Parking', deductibleCategory: 'vehicle' },
  ],
  
  // Business meals
  meals: [
    { pattern: /restaurant|gasthaus|gasthof|wirtshaus|beisl/i, name: 'Restaurant', category: 'Business Meal', deductibleCategory: 'meals' },
    { pattern: /bewirtung|geschäftsessen|business\s*lunch|business\s*dinner/i, name: 'Business Meal', category: 'Business Meal', deductibleCategory: 'meals' },
    { pattern: /catering/i, name: 'Catering', category: 'Business Meal', deductibleCategory: 'meals' },
  ],
  
  // Telecom
  telecom: [
    { domain: 'a1.at', name: 'A1', category: 'Telecom', deductibleCategory: 'telecom' },
    { domain: 'a1.net', name: 'A1', category: 'Telecom', deductibleCategory: 'telecom' },
    { domain: 'drei.at', name: 'Drei', category: 'Telecom', deductibleCategory: 'telecom' },
    { domain: 'magenta.at', name: 'Magenta', category: 'Telecom', deductibleCategory: 'telecom' },
    { domain: 't-mobile.at', name: 'Magenta', category: 'Telecom', deductibleCategory: 'telecom' },
    { domain: 'bob.at', name: 'bob', category: 'Telecom', deductibleCategory: 'telecom' },
    { domain: 'yesss.at', name: 'yesss!', category: 'Telecom', deductibleCategory: 'telecom' },
    { domain: 'spusu.at', name: 'spusu', category: 'Telecom', deductibleCategory: 'telecom' },
    { domain: 'hot.at', name: 'HoT', category: 'Telecom', deductibleCategory: 'telecom' },
    { domain: 'fonira.at', name: 'Fonira', category: 'Internet', deductibleCategory: 'telecom' },
    { pattern: /internet|breitband|fiber|glasfaser/i, category: 'Internet', deductibleCategory: 'telecom' },
    { pattern: /telefon|mobile|handy|mobilfunk/i, category: 'Telecom', deductibleCategory: 'telecom' },
  ],
  
  // Partial (variable)
  partial: [],
  
  // Not deductible (personal)
  none: [
    { domain: 'netflix.com', name: 'Netflix', category: 'Entertainment', deductibleCategory: 'none' },
    { domain: 'spotify.com', name: 'Spotify', category: 'Entertainment', deductibleCategory: 'none' },
    { domain: 'disneyplus.com', name: 'Disney+', category: 'Entertainment', deductibleCategory: 'none' },
    { domain: 'primevideo.com', name: 'Prime Video', category: 'Entertainment', deductibleCategory: 'none' },
    { domain: 'hbomax.com', name: 'HBO Max', category: 'Entertainment', deductibleCategory: 'none' },
    { domain: 'twitch.tv', name: 'Twitch', category: 'Entertainment', deductibleCategory: 'none' },
    { domain: 'youtube.com', name: 'YouTube Premium', category: 'Entertainment', deductibleCategory: 'none' },
    { domain: 'crunchyroll.com', name: 'Crunchyroll', category: 'Entertainment', deductibleCategory: 'none' },
    { domain: 'audible.com', name: 'Audible', category: 'Entertainment', deductibleCategory: 'none' },
    { domain: 'audible.de', name: 'Audible', category: 'Entertainment', deductibleCategory: 'none' },
    { pattern: /supermarkt|billa|spar|hofer|lidl|penny|interspar|merkur|eurospar/i, category: 'Groceries', deductibleCategory: 'none' },
    { pattern: /fitinn|mcfit|fitnessstudio|gym|fitness/i, category: 'Fitness', deductibleCategory: 'none' },
    { pattern: /kino|cinema|cineplexx/i, category: 'Entertainment', deductibleCategory: 'none' },
    { domain: 'tinder.com', name: 'Tinder', category: 'Personal', deductibleCategory: 'none' },
    { domain: 'bumble.com', name: 'Bumble', category: 'Personal', deductibleCategory: 'none' },
    { domain: 'flaconi.at', name: 'Flaconi', category: 'Cosmetics', deductibleCategory: 'none' },
    { domain: 'flaconi.de', name: 'Flaconi', category: 'Cosmetics', deductibleCategory: 'none' },
    { domain: 'douglas.at', name: 'Douglas', category: 'Cosmetics', deductibleCategory: 'none' },
    { pattern: /parfum|cosmetic|kosmetik|drogerie/i, category: 'Personal Care', deductibleCategory: 'none' },
    { domain: 'zuckerlwerkstatt.at', name: 'Zuckerlwerkstatt', category: 'Food/Candy', deductibleCategory: 'none' },
    { pattern: /zuckerlwerkstatt|süßwaren|confiserie|konditorei/i, category: 'Food/Candy', deductibleCategory: 'none' },
    { pattern: /vitamin|supplement|nahrungsergänzung|health\s*dispensary/i, category: 'Health/Supplements', deductibleCategory: 'none' },
  ],
  
  // Business gifts (limited deductibility in Austria)
  gifts: [
    { pattern: /geschenk.*business|business.*gift|werbegeschenk/i, category: 'Business Gifts', deductibleCategory: 'gifts' },
    { pattern: /kundengeschenk|mitarbeitergeschenk/i, category: 'Business Gifts', deductibleCategory: 'gifts' },
  ],
  
  // Unclear - needs review
  unclear: [
    { domain: 'amazon.de', name: 'Amazon DE', category: 'Mixed', deductibleCategory: 'unclear' },
    { domain: 'amazon.at', name: 'Amazon AT', category: 'Mixed', deductibleCategory: 'unclear' },
    { domain: 'amazon.com', name: 'Amazon', category: 'Mixed', deductibleCategory: 'unclear' },
    { domain: 'ebay.de', name: 'eBay DE', category: 'Mixed', deductibleCategory: 'unclear' },
    { domain: 'ebay.at', name: 'eBay AT', category: 'Mixed', deductibleCategory: 'unclear' },
    { domain: 'ebay.com', name: 'eBay', category: 'Mixed', deductibleCategory: 'unclear' },
    { pattern: /mediamarkt|saturn|cyberport|alternate/i, category: 'Electronics', deductibleCategory: 'unclear' },
    { pattern: /ikea|xxxlutz|möbelix|kika|leiner/i, category: 'Furniture', deductibleCategory: 'unclear' },
    { domain: 'aliexpress.com', name: 'AliExpress', category: 'Mixed', deductibleCategory: 'unclear' },
  ],
};

// ============================================================================
// Vendor Lookup
// ============================================================================

export interface VendorMatch {
  vendor: Vendor;
  deductibleCategory: DeductibleCategory;
  name: string;
  category: string;
}

/**
 * Find a matching vendor by domain or pattern.
 */
export function findVendor(
  senderDomain: string | null | undefined,
  subject: string = '',
  body: string = ''
): VendorMatch | null {
  const textToCheck = `${senderDomain || ''} ${subject} ${body}`.toLowerCase();
  
  // Check each category
  for (const [deductibleCat, vendors] of Object.entries(KNOWN_VENDORS)) {
    for (const vendor of vendors) {
      if (isDomainVendor(vendor)) {
        if (senderDomain?.toLowerCase().includes(vendor.domain)) {
          return {
            vendor,
            deductibleCategory: deductibleCat as DeductibleCategory,
            name: vendor.name,
            category: vendor.category,
          };
        }
      } else if (isPatternVendor(vendor)) {
        if (vendor.pattern.test(textToCheck)) {
          return {
            vendor,
            deductibleCategory: deductibleCat as DeductibleCategory,
            name: vendor.name || vendor.category,
            category: vendor.category,
          };
        }
      }
    }
  }
  
  return null;
}

// ============================================================================
// Classification with Situation Context
// ============================================================================

export interface ClassificationResult {
  deductibleCategory: DeductibleCategory;
  incomeTaxPercent: number;
  vatRecoverable: boolean;
  vatPercent: number;
  reason: string;
  vendorMatch: VendorMatch | null;
}

/**
 * Classify an expense using the vendor database and situation context.
 * Uses the jurisdiction's tax rules for calculations.
 */
export function classifyExpense(
  senderDomain: string | null | undefined,
  subject: string,
  body: string,
  situation: Situation,
  amountCents?: number
): ClassificationResult {
  const vendorMatch = findVendor(senderDomain, subject, body);
  const taxRules = getTaxRules(situation.jurisdiction);
  
  // Determine deductible category
  const deductibleCategory = vendorMatch?.deductibleCategory || 'unclear';
  
  // Prepare calculation context
  const context = {
    amountCents,
  };
  
  // Calculate tax implications using jurisdiction rules
  const vatResult = taxRules.calculateVatRecovery(deductibleCategory, situation, context);
  const incomeTaxResult = taxRules.calculateIncomeTaxPercent(deductibleCategory, situation, context);
  
  // Build reason
  let reason: string;
  if (vendorMatch) {
    reason = `${vendorMatch.name} - ${vendorMatch.category}`;
  } else {
    reason = 'Unknown vendor - needs manual review';
  }
  
  return {
    deductibleCategory,
    incomeTaxPercent: incomeTaxResult.percent,
    vatRecoverable: vatResult.recoverable,
    vatPercent: vatResult.percent,
    reason: `${reason}. ${incomeTaxResult.reason}`,
    vendorMatch,
  };
}



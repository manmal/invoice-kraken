/**
 * Known vendor database for tax deductibility classification
 * For Austrian Einzelunternehmer (sole proprietors) / freelance software developers
 * 
 * IMPORTANT AUSTRIAN TAX RULES:
 * 1. Income Tax (EST) and VAT (USt) deductibility are SEPARATE
 * 2. PKW/Kombi: NO Vorsteuerabzug in Austria (except electric vehicles!)
 * 3. Business meals: 50% income tax, 100% VAT
 * 4. Phone/Internet: Business portion only (configurable, default 50%)
 * 5. Kleinunternehmer (< €55k revenue): No VAT recovery at all
 * 
 * See: docs/austrian-tax-deductibility.md for details
 */

import { DeductibleCategory } from '../types.js';
import { 
  getVehicleVatRecovery, 
  getTelecomBusinessPercent, 
  isKleinunternehmer
} from './config.js';

/**
 * Deductibility type definition
 */
interface DeductibilityType {
  income_tax_percent: number | null;
  vat_recoverable: boolean | null;
  icon: string;
  label: string;
}

/**
 * Vendor definition with domain matching
 */
interface VendorDomain {
  domain: string;
  name: string;
  category: string;
  percent?: number;
}

/**
 * Vendor definition with pattern matching
 */
interface VendorPattern {
  pattern: RegExp;
  name?: string;
  category: string;
  percent?: number;
}

/**
 * Union type for vendor definitions
 */
type Vendor = VendorDomain | VendorPattern;

/**
 * Type guard for domain-based vendors
 */
function isDomainVendor(vendor: Vendor): vendor is VendorDomain {
  return 'domain' in vendor;
}

/**
 * Type guard for pattern-based vendors
 */
function isPatternVendor(vendor: Vendor): vendor is VendorPattern {
  return 'pattern' in vendor;
}

/**
 * Deductibility types with Austrian tax rules
 */
export const DEDUCTIBILITY_TYPES: Record<DeductibleCategory, DeductibilityType> = {
  // 100% income tax + 100% VAT recovery
  full: {
    income_tax_percent: 100,
    vat_recoverable: true,
    icon: '💼',
    label: 'Fully Deductible',
  },
  
  // Vehicle expenses: 100% income tax (business portion) but NO VAT recovery!
  vehicle: {
    income_tax_percent: 100, // of business portion
    vat_recoverable: false,  // PKW = no Vorsteuerabzug in Austria!
    icon: '🚗',
    label: 'Vehicle (no VAT)',
  },
  
  // Business meals: 50% income tax, 100% VAT
  meals: {
    income_tax_percent: 50,
    vat_recoverable: true,  // Full VAT recovery despite 50% income tax!
    icon: '🍽️',
    label: 'Meals (50% EST)',
  },
  
  // Telecom: Business portion (typically 50%)
  telecom: {
    income_tax_percent: 50, // default, can be higher with proof
    vat_recoverable: true,  // same percentage as income tax
    icon: '📱',
    label: 'Telecom (partial)',
  },
  
  // Partial deductibility
  partial: {
    income_tax_percent: 50,
    vat_recoverable: true,
    icon: '📊',
    label: 'Partial',
  },
  
  // Not deductible (personal expenses)
  none: {
    income_tax_percent: 0,
    vat_recoverable: false,
    icon: '🚫',
    label: 'Not Deductible',
  },
  
  // Needs manual review
  unclear: {
    income_tax_percent: null,
    vat_recoverable: null,
    icon: '❓',
    label: 'Needs Review',
  },
};

/**
 * Known vendors database organized by deductibility category
 */
export const KNOWN_VENDORS: Record<'full' | 'vehicle' | 'meals' | 'telecom' | 'none' | 'unclear', Vendor[]> = {
  // Fully deductible (100% income tax + VAT recovery)
  full: [
    // Software & SaaS
    { domain: 'jetbrains.com', name: 'JetBrains', category: 'Software' },
    { domain: 'github.com', name: 'GitHub', category: 'Dev Tools' },
    { domain: 'gitlab.com', name: 'GitLab', category: 'Dev Tools' },
    { domain: 'atlassian.com', name: 'Atlassian', category: 'Software' },
    { domain: 'atlassian.net', name: 'Atlassian', category: 'Software' },
    { domain: 'figma.com', name: 'Figma', category: 'Design Tools' },
    { domain: 'notion.so', name: 'Notion', category: 'Productivity' },
    { domain: 'linear.app', name: 'Linear', category: 'Project Management' },
    { domain: '1password.com', name: '1Password', category: 'Security' },
    { domain: 'bitwarden.com', name: 'Bitwarden', category: 'Security' },
    { domain: 'lastpass.com', name: 'LastPass', category: 'Security' },
    { domain: 'adobe.com', name: 'Adobe', category: 'Software' },
    { domain: 'sketch.com', name: 'Sketch', category: 'Design Tools' },
    { domain: 'canva.com', name: 'Canva', category: 'Design Tools' },
    { domain: 'miro.com', name: 'Miro', category: 'Collaboration' },
    { domain: 'asana.com', name: 'Asana', category: 'Project Management' },
    { domain: 'monday.com', name: 'Monday', category: 'Project Management' },
    { domain: 'trello.com', name: 'Trello', category: 'Project Management' },
    { domain: 'dropbox.com', name: 'Dropbox', category: 'Cloud Storage' },
    { domain: 'box.com', name: 'Box', category: 'Cloud Storage' },
    
    // Cloud & Infrastructure
    { domain: 'aws.amazon.com', name: 'AWS', category: 'Cloud' },
    { domain: 'amazonaws.com', name: 'AWS', category: 'Cloud' },
    { domain: 'cloud.google.com', name: 'Google Cloud', category: 'Cloud' },
    { domain: 'azure.microsoft.com', name: 'Azure', category: 'Cloud' },
    { domain: 'digitalocean.com', name: 'DigitalOcean', category: 'Cloud' },
    { domain: 'hetzner.com', name: 'Hetzner', category: 'Hosting' },
    { domain: 'hetzner.de', name: 'Hetzner', category: 'Hosting' },
    { domain: 'vercel.com', name: 'Vercel', category: 'Hosting' },
    { domain: 'netlify.com', name: 'Netlify', category: 'Hosting' },
    { domain: 'cloudflare.com', name: 'Cloudflare', category: 'CDN/DNS' },
    { domain: 'render.com', name: 'Render', category: 'Hosting' },
    { domain: 'railway.app', name: 'Railway', category: 'Hosting' },
    { domain: 'fly.io', name: 'Fly.io', category: 'Hosting' },
    { domain: 'heroku.com', name: 'Heroku', category: 'Hosting' },
    { domain: 'linode.com', name: 'Linode', category: 'Cloud' },
    { domain: 'vultr.com', name: 'Vultr', category: 'Cloud' },
    { domain: 'scaleway.com', name: 'Scaleway', category: 'Cloud' },
    { domain: 'ovh.com', name: 'OVH', category: 'Hosting' },
    { domain: 'ovhcloud.com', name: 'OVH', category: 'Hosting' },
    
    // Domains & DNS
    { domain: 'namecheap.com', name: 'Namecheap', category: 'Domains' },
    { domain: 'godaddy.com', name: 'GoDaddy', category: 'Domains' },
    { domain: 'hover.com', name: 'Hover', category: 'Domains' },
    { domain: 'iwantmyname.com', name: 'iwantmyname', category: 'Domains' },
    { domain: 'gandi.net', name: 'Gandi', category: 'Domains' },
    { domain: 'porkbun.com', name: 'Porkbun', category: 'Domains' },
    { domain: 'nic.at', name: 'nic.at', category: 'Domains' },
    { domain: 'denic.de', name: 'DENIC', category: 'Domains' },
    
    // Monitoring & Analytics
    { domain: 'sentry.io', name: 'Sentry', category: 'Monitoring' },
    { domain: 'datadoghq.com', name: 'Datadog', category: 'Monitoring' },
    { domain: 'newrelic.com', name: 'New Relic', category: 'Monitoring' },
    { domain: 'logrocket.com', name: 'LogRocket', category: 'Monitoring' },
    { domain: 'bugsnag.com', name: 'Bugsnag', category: 'Monitoring' },
    { domain: 'mixpanel.com', name: 'Mixpanel', category: 'Analytics' },
    { domain: 'amplitude.com', name: 'Amplitude', category: 'Analytics' },
    { domain: 'segment.com', name: 'Segment', category: 'Analytics' },
    { domain: 'plausible.io', name: 'Plausible', category: 'Analytics' },
    { domain: 'posthog.com', name: 'PostHog', category: 'Analytics' },
    
    // Email Services
    { domain: 'postmarkapp.com', name: 'Postmark', category: 'Email Service' },
    { domain: 'sendgrid.com', name: 'SendGrid', category: 'Email Service' },
    { domain: 'mailgun.com', name: 'Mailgun', category: 'Email Service' },
    { domain: 'mailchimp.com', name: 'Mailchimp', category: 'Email Service' },
    { domain: 'convertkit.com', name: 'ConvertKit', category: 'Email Service' },
    { domain: 'buttondown.email', name: 'Buttondown', category: 'Email Service' },
    { domain: 'resend.com', name: 'Resend', category: 'Email Service' },
    { domain: 'brevo.com', name: 'Brevo', category: 'Email Service' },
    { domain: 'sendinblue.com', name: 'Brevo', category: 'Email Service' },
    
    // Communication (Business)
    { domain: 'slack.com', name: 'Slack', category: 'Communication' },
    { domain: 'zoom.us', name: 'Zoom', category: 'Communication' },
    { domain: 'zoom.com', name: 'Zoom', category: 'Communication' },
    { domain: 'workspace.google.com', name: 'Google Workspace', category: 'Productivity' },
    { domain: 'google.com', name: 'Google', category: 'Services' },
    { domain: 'microsoft.com', name: 'Microsoft', category: 'Software' },
    { domain: 'office.com', name: 'Microsoft 365', category: 'Software' },
    { domain: 'discord.com', name: 'Discord', category: 'Communication' },
    { domain: 'loom.com', name: 'Loom', category: 'Communication' },
    { domain: 'calendly.com', name: 'Calendly', category: 'Productivity' },
    { domain: 'cal.com', name: 'Cal.com', category: 'Productivity' },
    
    // AI & APIs
    { domain: 'openai.com', name: 'OpenAI', category: 'AI Services' },
    { domain: 'anthropic.com', name: 'Anthropic', category: 'AI Services' },
    { domain: 'replicate.com', name: 'Replicate', category: 'AI Services' },
    { domain: 'huggingface.co', name: 'Hugging Face', category: 'AI Services' },
    { domain: 'cohere.ai', name: 'Cohere', category: 'AI Services' },
    { domain: 'elevenlabs.io', name: 'ElevenLabs', category: 'AI Services' },
    { domain: 'midjourney.com', name: 'Midjourney', category: 'AI Services' },
    { domain: 'stability.ai', name: 'Stability AI', category: 'AI Services' },
    
    // Payment Processing
    { domain: 'stripe.com', name: 'Stripe', category: 'Payment Processing' },
    { domain: 'paypal.com', name: 'PayPal', category: 'Payment Processing' },
    { domain: 'paddle.com', name: 'Paddle', category: 'Payment Processing' },
    { domain: 'lemonsqueezy.com', name: 'Lemon Squeezy', category: 'Payment Processing' },
    { domain: 'gumroad.com', name: 'Gumroad', category: 'Payment Processing' },
    
    // Development Tools
    { domain: 'npmjs.com', name: 'npm', category: 'Dev Tools' },
    { domain: 'docker.com', name: 'Docker', category: 'Dev Tools' },
    { domain: 'circleci.com', name: 'CircleCI', category: 'CI/CD' },
    { domain: 'travis-ci.com', name: 'Travis CI', category: 'CI/CD' },
    { domain: 'buildkite.com', name: 'Buildkite', category: 'CI/CD' },
    { domain: 'codecov.io', name: 'Codecov', category: 'Dev Tools' },
    { domain: 'snyk.io', name: 'Snyk', category: 'Security' },
    { domain: 'sonarqube.com', name: 'SonarQube', category: 'Dev Tools' },
    { domain: 'browserstack.com', name: 'BrowserStack', category: 'Testing' },
    { domain: 'lambdatest.com', name: 'LambdaTest', category: 'Testing' },
    
    // Education & Books
    { domain: 'udemy.com', name: 'Udemy', category: 'Education' },
    { domain: 'pluralsight.com', name: 'Pluralsight', category: 'Education' },
    { domain: 'egghead.io', name: 'Egghead', category: 'Education' },
    { domain: 'frontendmasters.com', name: 'Frontend Masters', category: 'Education' },
    { domain: 'oreilly.com', name: "O'Reilly", category: 'Education' },
    { domain: 'manning.com', name: 'Manning', category: 'Education' },
    { domain: 'packtpub.com', name: 'Packt', category: 'Education' },
    
    // Hardware vendors (typically deductible)
    { domain: 'apple.com', name: 'Apple', category: 'Hardware' },
    { domain: 'dell.com', name: 'Dell', category: 'Hardware' },
    { domain: 'lenovo.com', name: 'Lenovo', category: 'Hardware' },
    { domain: 'logitech.com', name: 'Logitech', category: 'Hardware' },
    
    // Professional Services
    { pattern: /steuerber/i, name: 'Accountant', category: 'Professional' },
    { pattern: /buchhal/i, name: 'Accountant', category: 'Professional' },
    { pattern: /wirtschafts/i, name: 'Business Consultant', category: 'Professional' },
    { pattern: /rechtsanw/i, name: 'Legal', category: 'Professional' },
    { pattern: /kanzlei/i, name: 'Legal', category: 'Professional' },
    { pattern: /notar/i, name: 'Notary', category: 'Professional' },
    { pattern: /wko\.at/i, name: 'WKO', category: 'Professional' },
    { pattern: /svs\.at/i, name: 'SVS', category: 'Insurance' },
  ],
  
  // Vehicle expenses: 100% income tax but NO VAT recovery (Austrian special rule!)
  vehicle: [
    // Fuel - NO Vorsteuerabzug for PKW in Austria!
    { pattern: /tankstelle|shell|bp|omv|eni|avanti|jet\s|turmöl/i, name: 'Fuel', category: 'Vehicle Fuel' },
    { pattern: /avia|esso|aral|total\s/i, name: 'Fuel', category: 'Vehicle Fuel' },
    
    // Car services - NO Vorsteuerabzug
    { pattern: /autowäsche|car\s*wash|waschstraße|waschanlage/i, name: 'Car Wash', category: 'Vehicle Service' },
    { pattern: /werkstatt|autoservice|kfz[-\s]?service|reparatur/i, name: 'Car Service', category: 'Vehicle Service' },
    { pattern: /reifenwechsel|reifen[-\s]?service|tire/i, name: 'Tires', category: 'Vehicle Service' },
    { pattern: /kfz[-\s]?versicherung|autoversicherung/i, name: 'Car Insurance', category: 'Vehicle Insurance' },
    
    // Roadside assistance & tolls
    { domain: 'oeamtc.at', name: 'ÖAMTC', category: 'Vehicle Club' },
    { domain: 'arboe.at', name: 'ARBÖ', category: 'Vehicle Club' },
    { pattern: /öamtc|arbö/i, name: 'Roadside Assistance', category: 'Vehicle Club' },
    { domain: 'asfinag.at', name: 'ASFINAG', category: 'Tolls' },
    { pattern: /asfinag|vignette|maut|toll/i, name: 'Tolls/Vignette', category: 'Tolls' },
    
    // Parking
    { pattern: /parkgarage|parking|parkhaus|kurzparkzone/i, name: 'Parking', category: 'Vehicle Parking' },
    { domain: 'parkandride.at', name: 'Park & Ride', category: 'Vehicle Parking' },
  ],
  
  // Business meals: 50% income tax, but 100% VAT recovery!
  meals: [
    { pattern: /restaurant|gasthaus|gasthof|wirtshaus|beisl/i, name: 'Restaurant', category: 'Business Meal' },
    { pattern: /bewirtung|geschäftsessen|business\s*lunch|business\s*dinner/i, name: 'Business Meal', category: 'Business Meal' },
    { pattern: /catering/i, name: 'Catering', category: 'Business Meal' },
  ],
  
  // Telecom: Typically 50% business use (can be higher with proof)
  telecom: [
    { domain: 'a1.at', name: 'A1', category: 'Telecom', percent: 50 },
    { domain: 'a1.net', name: 'A1', category: 'Telecom', percent: 50 },
    { domain: 'drei.at', name: 'Drei', category: 'Telecom', percent: 50 },
    { domain: 'magenta.at', name: 'Magenta', category: 'Telecom', percent: 50 },
    { domain: 't-mobile.at', name: 'Magenta', category: 'Telecom', percent: 50 },
    { domain: 'bob.at', name: 'bob', category: 'Telecom', percent: 50 },
    { domain: 'yesss.at', name: 'yesss!', category: 'Telecom', percent: 50 },
    { domain: 'spusu.at', name: 'spusu', category: 'Telecom', percent: 50 },
    { domain: 'hot.at', name: 'HoT', category: 'Telecom', percent: 50 },
    { domain: 'fonira.at', name: 'Fonira', category: 'Internet', percent: 50 },
    { pattern: /internet|breitband|fiber|glasfaser/i, category: 'Internet', percent: 50 },
    { pattern: /telefon|mobile|handy|mobilfunk/i, category: 'Telecom', percent: 50 },
  ],
  
  // Not deductible (personal expenses)
  none: [
    // Entertainment & Streaming
    { domain: 'netflix.com', name: 'Netflix', category: 'Entertainment' },
    { domain: 'spotify.com', name: 'Spotify', category: 'Entertainment' },
    { domain: 'disneyplus.com', name: 'Disney+', category: 'Entertainment' },
    { domain: 'primevideo.com', name: 'Prime Video', category: 'Entertainment' },
    { domain: 'hbomax.com', name: 'HBO Max', category: 'Entertainment' },
    { domain: 'twitch.tv', name: 'Twitch', category: 'Entertainment' },
    { domain: 'youtube.com', name: 'YouTube Premium', category: 'Entertainment' },
    { domain: 'crunchyroll.com', name: 'Crunchyroll', category: 'Entertainment' },
    { domain: 'audible.com', name: 'Audible', category: 'Entertainment' },
    { domain: 'audible.de', name: 'Audible', category: 'Entertainment' },
    
    // Groceries
    { pattern: /supermarkt|billa|spar|hofer|lidl|penny|interspar|merkur|eurospar/i, category: 'Groceries' },
    
    // Fitness
    { pattern: /fitinn|mcfit|fitnessstudio|gym|fitness/i, category: 'Fitness' },
    
    // Entertainment venues
    { pattern: /kino|cinema|cineplexx/i, category: 'Entertainment' },
    
    // Dating
    { domain: 'tinder.com', name: 'Tinder', category: 'Personal' },
    { domain: 'bumble.com', name: 'Bumble', category: 'Personal' },
    
    // Cosmetics / Personal care
    { domain: 'flaconi.at', name: 'Flaconi', category: 'Cosmetics' },
    { domain: 'flaconi.de', name: 'Flaconi', category: 'Cosmetics' },
    { domain: 'douglas.at', name: 'Douglas', category: 'Cosmetics' },
    { pattern: /parfum|cosmetic|kosmetik|drogerie/i, category: 'Personal Care' },
    
    // Food / Candy shops
    { domain: 'zuckerlwerkstatt.at', name: 'Zuckerlwerkstatt', category: 'Food/Candy' },
    { pattern: /zuckerlwerkstatt|süßwaren|confiserie|konditorei/i, category: 'Food/Candy' },
    
    // Health supplements (personal)
    { pattern: /vitamin|supplement|nahrungsergänzung|health\s*dispensary/i, category: 'Health/Supplements' },
  ],
  
  // Unclear - needs review
  unclear: [
    { domain: 'amazon.de', name: 'Amazon DE', category: 'Mixed' },
    { domain: 'amazon.at', name: 'Amazon AT', category: 'Mixed' },
    { domain: 'amazon.com', name: 'Amazon', category: 'Mixed' },
    { domain: 'ebay.de', name: 'eBay DE', category: 'Mixed' },
    { domain: 'ebay.at', name: 'eBay AT', category: 'Mixed' },
    { domain: 'ebay.com', name: 'eBay', category: 'Mixed' },
    { pattern: /mediamarkt|saturn|cyberport|alternate/i, category: 'Electronics' },
    { pattern: /ikea|xxxlutz|möbelix|kika|leiner/i, category: 'Furniture' },
    { domain: 'aliexpress.com', name: 'AliExpress', category: 'Mixed' },
  ],
};

/**
 * Internal result type for classifyDeductibility that includes type info
 */
interface ClassificationResult {
  deductible: DeductibleCategory;
  type: DeductibilityType;
  reason: string;
  income_tax_percent: number | null;
  vat_recoverable: boolean | null;
}

/**
 * Classify deductibility based on sender domain and subject
 * Returns detailed Austrian tax classification
 * Uses user config for vehicle VAT and telecom percentages
 */
export function classifyDeductibility(
  senderDomain: string | null | undefined,
  subject: string = '',
  body: string = ''
): ClassificationResult {
  const textToCheck = `${senderDomain || ''} ${subject} ${body}`.toLowerCase();
  
  // Check if user is Kleinunternehmer (no VAT recovery at all)
  const kleinunternehmer = isKleinunternehmer();
  
  // Get vehicle VAT status from config (depends on electric vs ICE)
  const vehicleVat = getVehicleVatRecovery();
  
  // Check vehicle expenses first
  for (const vendor of KNOWN_VENDORS.vehicle) {
    if (isDomainVendor(vendor) && senderDomain?.includes(vendor.domain)) {
      return {
        deductible: 'vehicle',
        type: DEDUCTIBILITY_TYPES.vehicle,
        reason: `${vendor.name} - ${vendor.category} (${vehicleVat.reason})`,
        income_tax_percent: 100,
        vat_recoverable: kleinunternehmer ? false : (vehicleVat.recoverable === true),
      };
    }
    if (isPatternVendor(vendor) && vendor.pattern.test(textToCheck)) {
      return {
        deductible: 'vehicle',
        type: DEDUCTIBILITY_TYPES.vehicle,
        reason: `${vendor.name || vendor.category} (${vehicleVat.reason})`,
        income_tax_percent: 100,
        vat_recoverable: kleinunternehmer ? false : (vehicleVat.recoverable === true),
      };
    }
  }
  
  // Check business meals (50% income tax, 100% VAT - unless Kleinunternehmer)
  for (const vendor of KNOWN_VENDORS.meals) {
    if (isDomainVendor(vendor) && senderDomain?.includes(vendor.domain)) {
      return {
        deductible: 'meals',
        type: DEDUCTIBILITY_TYPES.meals,
        reason: `${vendor.name} - ${vendor.category} (50% EST${kleinunternehmer ? '' : ', 100% VAT'})`,
        income_tax_percent: 50,
        vat_recoverable: kleinunternehmer ? false : true,
      };
    }
    if (isPatternVendor(vendor) && vendor.pattern.test(textToCheck)) {
      return {
        deductible: 'meals',
        type: DEDUCTIBILITY_TYPES.meals,
        reason: `${vendor.name || vendor.category} (50% EST${kleinunternehmer ? '' : ', 100% VAT'})`,
        income_tax_percent: 50,
        vat_recoverable: kleinunternehmer ? false : true,
      };
    }
  }
  
  // Check full deductibility (100% income tax + VAT - unless Kleinunternehmer)
  for (const vendor of KNOWN_VENDORS.full) {
    if (isDomainVendor(vendor) && senderDomain?.includes(vendor.domain)) {
      return {
        deductible: 'full',
        type: DEDUCTIBILITY_TYPES.full,
        reason: `${vendor.name} - ${vendor.category}`,
        income_tax_percent: 100,
        vat_recoverable: kleinunternehmer ? false : true,
      };
    }
    if (isPatternVendor(vendor) && vendor.pattern.test(textToCheck)) {
      return {
        deductible: 'full',
        type: DEDUCTIBILITY_TYPES.full,
        reason: `${vendor.name || vendor.category}`,
        income_tax_percent: 100,
        vat_recoverable: kleinunternehmer ? false : true,
      };
    }
  }
  
  // Check telecom (partial - use configured percentage)
  const telecomPercent = getTelecomBusinessPercent();
  
  for (const vendor of KNOWN_VENDORS.telecom) {
    if (isDomainVendor(vendor) && senderDomain?.includes(vendor.domain)) {
      return {
        deductible: 'telecom',
        type: DEDUCTIBILITY_TYPES.telecom,
        reason: `${vendor.name} - ${vendor.category} (${telecomPercent}% business use)`,
        income_tax_percent: telecomPercent,
        vat_recoverable: kleinunternehmer ? false : true,
      };
    }
    if (isPatternVendor(vendor) && vendor.pattern.test(textToCheck)) {
      return {
        deductible: 'telecom',
        type: DEDUCTIBILITY_TYPES.telecom,
        reason: `${vendor.category} (${telecomPercent}% business use)`,
        income_tax_percent: telecomPercent,
        vat_recoverable: kleinunternehmer ? false : true,
      };
    }
  }
  
  // Check non-deductible
  for (const vendor of KNOWN_VENDORS.none) {
    if (isDomainVendor(vendor) && senderDomain?.includes(vendor.domain)) {
      return {
        deductible: 'none',
        type: DEDUCTIBILITY_TYPES.none,
        reason: `${vendor.name} - ${vendor.category} (personal expense)`,
        income_tax_percent: 0,
        vat_recoverable: false,
      };
    }
    if (isPatternVendor(vendor) && vendor.pattern.test(textToCheck)) {
      return {
        deductible: 'none',
        type: DEDUCTIBILITY_TYPES.none,
        reason: `${vendor.category} (personal expense)`,
        income_tax_percent: 0,
        vat_recoverable: false,
      };
    }
  }
  
  // Check unclear
  for (const vendor of KNOWN_VENDORS.unclear) {
    if (isDomainVendor(vendor) && senderDomain?.includes(vendor.domain)) {
      return {
        deductible: 'unclear',
        type: DEDUCTIBILITY_TYPES.unclear,
        reason: `${vendor.name} - ${vendor.category} (needs review)`,
        income_tax_percent: null,
        vat_recoverable: null,
      };
    }
    if (isPatternVendor(vendor) && vendor.pattern.test(textToCheck)) {
      return {
        deductible: 'unclear',
        type: DEDUCTIBILITY_TYPES.unclear,
        reason: `${vendor.category} (needs review)`,
        income_tax_percent: null,
        vat_recoverable: null,
      };
    }
  }
  
  // Default to unclear if no match
  return {
    deductible: 'unclear',
    type: DEDUCTIBILITY_TYPES.unclear,
    reason: 'Unknown vendor - needs manual review',
    income_tax_percent: null,
    vat_recoverable: null,
  };
}

/**
 * Get deductibility icon for display
 */
export function getDeductibilityIcon(deductible: DeductibleCategory): string {
  return DEDUCTIBILITY_TYPES[deductible]?.icon || '❓';
}

/**
 * Get deductibility label for display
 */
export function getDeductibilityLabel(deductible: DeductibleCategory): string {
  return DEDUCTIBILITY_TYPES[deductible]?.label || 'Unknown';
}

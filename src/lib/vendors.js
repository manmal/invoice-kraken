/**
 * Known vendor database for tax deductibility classification
 * For Austrian freelance software developers
 */

export const KNOWN_VENDORS = {
  // Fully deductible (100%)
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
    { domain: 'amazon.com', name: 'Amazon Books', category: 'Education', partial: true },
    
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
    
    // Company Car (Firmen-KFZ) - fully deductible
    { pattern: /tankstelle|shell|bp|omv|eni|avanti|jet\s|turmöl/i, name: 'Fuel', category: 'Company Car' },
    { pattern: /avia|esso|aral|total\s/i, name: 'Fuel', category: 'Company Car' },
    { pattern: /autowäsche|car\s*wash|waschstraße|waschanlage/i, name: 'Car Wash', category: 'Company Car' },
    { pattern: /werkstatt|autoservice|kfz[-\s]?service|reparatur/i, name: 'Car Service', category: 'Company Car' },
    { pattern: /reifenwechsel|reifen[-\s]?service|tire/i, name: 'Tires', category: 'Company Car' },
    { pattern: /öamtc|arbö/i, name: 'Roadside Assistance', category: 'Company Car' },
    { pattern: /asfinag|vignette|maut|toll/i, name: 'Tolls/Vignette', category: 'Company Car' },
    { pattern: /parkgarage|parking|parkhaus|kurzparkzone/i, name: 'Parking', category: 'Company Car' },
    { pattern: /kfz[-\s]?versicherung|autoversicherung/i, name: 'Car Insurance', category: 'Company Car' },
    { domain: 'asfinag.at', name: 'ASFINAG', category: 'Company Car' },
    { domain: 'oeamtc.at', name: 'ÖAMTC', category: 'Company Car' },
    { domain: 'arboe.at', name: 'ARBÖ', category: 'Company Car' },
  ],
  
  // Partially deductible
  partial: [
    { domain: 'a1.at', name: 'A1', category: 'Telecom', percent: 50 },
    { domain: 'a1.net', name: 'A1', category: 'Telecom', percent: 50 },
    { domain: 'drei.at', name: 'Drei', category: 'Telecom', percent: 50 },
    { domain: 'magenta.at', name: 'Magenta', category: 'Telecom', percent: 50 },
    { domain: 't-mobile.at', name: 'Magenta', category: 'Telecom', percent: 50 },
    { domain: 'bob.at', name: 'bob', category: 'Telecom', percent: 50 },
    { domain: 'yesss.at', name: 'yesss!', category: 'Telecom', percent: 50 },
    { domain: 'spusu.at', name: 'spusu', category: 'Telecom', percent: 50 },
    { domain: 'hot.at', name: 'HoT', category: 'Telecom', percent: 50 },
    { pattern: /internet|breitband|fiber|glasfaser/i, category: 'Internet', percent: 60 },
    { pattern: /telefon|mobile|handy/i, category: 'Telecom', percent: 50 },
  ],
  
  // Not deductible
  none: [
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
    { pattern: /supermarkt|billa|spar|hofer|lidl|penny|interspar|merkur|eurospar/i, category: 'Groceries' },
    { pattern: /restaurant|pizz|burger|kebab|sushi|cafe|coffee/i, category: 'Food' },
    { pattern: /fitinn|mcfit|fitnessstudio|gym/i, category: 'Fitness' },
    { pattern: /kino|cinema|cineplexx/i, category: 'Entertainment' },
    { domain: 'tinder.com', name: 'Tinder', category: 'Personal' },
    { domain: 'bumble.com', name: 'Bumble', category: 'Personal' },
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
 * Classify deductibility based on sender domain and subject
 */
export function classifyDeductibility(senderDomain, subject = '', body = '') {
  const textToCheck = `${senderDomain} ${subject} ${body}`.toLowerCase();
  
  // Check full deductibility first (most common for dev expenses)
  for (const vendor of KNOWN_VENDORS.full) {
    if (vendor.domain && senderDomain?.includes(vendor.domain)) {
      return {
        deductible: 'full',
        reason: `${vendor.name} - ${vendor.category}`,
        percent: 100,
      };
    }
    if (vendor.pattern && vendor.pattern.test(textToCheck)) {
      return {
        deductible: 'full',
        reason: `${vendor.name || vendor.category}`,
        percent: 100,
      };
    }
  }
  
  // Check partial deductibility
  for (const vendor of KNOWN_VENDORS.partial) {
    if (vendor.domain && senderDomain?.includes(vendor.domain)) {
      return {
        deductible: 'partial',
        reason: `${vendor.name} - ${vendor.category} (business use)`,
        percent: vendor.percent || 50,
      };
    }
    if (vendor.pattern && vendor.pattern.test(textToCheck)) {
      return {
        deductible: 'partial',
        reason: `${vendor.category} (business use)`,
        percent: vendor.percent || 50,
      };
    }
  }
  
  // Check non-deductible
  for (const vendor of KNOWN_VENDORS.none) {
    if (vendor.domain && senderDomain?.includes(vendor.domain)) {
      return {
        deductible: 'none',
        reason: `${vendor.name} - ${vendor.category} (personal)`,
        percent: 0,
      };
    }
    if (vendor.pattern && vendor.pattern.test(textToCheck)) {
      return {
        deductible: 'none',
        reason: `${vendor.category} (personal)`,
        percent: 0,
      };
    }
  }
  
  // Check unclear
  for (const vendor of KNOWN_VENDORS.unclear) {
    if (vendor.domain && senderDomain?.includes(vendor.domain)) {
      return {
        deductible: 'unclear',
        reason: `${vendor.name} - ${vendor.category} (needs review)`,
        percent: null,
      };
    }
    if (vendor.pattern && vendor.pattern.test(textToCheck)) {
      return {
        deductible: 'unclear',
        reason: `${vendor.category} (needs review)`,
        percent: null,
      };
    }
  }
  
  // Default to unclear if no match
  return {
    deductible: 'unclear',
    reason: 'Unknown vendor - needs manual review',
    percent: null,
  };
}
